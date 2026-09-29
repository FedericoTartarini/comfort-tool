/**
 * What is inside and outside a model's applicability. Reads `applicability`
 * off a model's `info.inputs` for the bound an entered quantity must satisfy
 * (the pre-call gate, and the range shown beside the input; ADR-0002
 * decision 4), intersected with its kind's bound from `kindBounds` when the
 * model takes the quantity (decision 46); `axisRangeFor` reads the same
 * applicability bounds only as an axis range's fallback (decision 5). The
 * rows a completed run still breaks are the library's, read off the result's
 * `warnings` (ADR-0002 decision 23) and mapped to quantities here.
 *
 * A violation is `{ quantity, bounded, role, value, bound }`, and its warning
 * sentence is assembled here from the bounded quantity's label, the bound and
 * the display unit, in the copy dictionary's words.
 */
import type { Bound, VariableInfo } from "jsthermalcomfort";
import { copy } from "$lib/text/copy";
import { humidityMode, temperatureMode, type HumidityMode } from "./entryModes";
import { takesRelativeAirSpeed, type ModelResult, type RegisteredModel } from "./modelDeclaration";
import { resultWarnings } from "./modelRun";
import { formatNumber } from "./numberFormat";
import { kindBounds, quantities, quantityFor, type Quantity } from "./quantities";
import { isHumidityQuantity, resolvedTdb, type Slot } from "./slot";
import type { DisplayUnit } from "./units";
import { displayUnitFor, valueWithUnit } from "./units";
import type { UnitSystem } from "./unitSystem";

export type { Bound };

const q = quantities;

/** One entered value the pre-call gate stops, with the bound it was tested against. */
export interface OutOfRangeRow {
  readonly quantity: Quantity;
  readonly value: number;
  readonly bound: Bound;
}

/**
 * One applicability row a value broke, and where it appeared in the model's
 * evaluation. `quantity` is the row it is reported on; `bounded` is the
 * quantity the bound and value belong to, which the sentence names. The two
 * differ only for `vr`, reported on the entered `v` (ADR-0002 decision 4).
 */
export interface ViolationRow extends OutOfRangeRow {
  readonly bounded: Quantity;
  readonly role: "input" | "derived" | "output";
}

/** The applicability bound of `table`'s row for `quantity`, reconciled by key through `quantityFor` (ADR-0002 decision 2). */
function boundFor(table: Readonly<Record<string, VariableInfo>> | undefined, quantity: Quantity): Bound | undefined {
  if (!table) {
    return undefined;
  }
  for (const [key, variable] of Object.entries(table)) {
    if (quantityFor(key) === quantity) {
      return variable.applicability;
    }
  }
  return undefined;
}

function breaksBound(bound: Bound, value: number): boolean {
  return (bound.min !== undefined && value < bound.min) || (bound.max !== undefined && value > bound.max);
}

/** The bound between `min` and `max`, keeping only an end that is a finite number. */
function boundOf(min: number | undefined, max: number | undefined): Bound {
  const result: { min?: number; max?: number } = {};
  if (min !== undefined && Number.isFinite(min)) {
    result.min = min;
  }
  if (max !== undefined && Number.isFinite(max)) {
    result.max = max;
  }
  return result;
}

/** The narrowest bound that satisfies every bound in `bounds`, or `undefined` for none. */
function intersect(bounds: readonly [Bound, ...Bound[]]): Bound;
function intersect(bounds: readonly Bound[]): Bound | undefined;
function intersect(bounds: readonly Bound[]): Bound | undefined {
  if (bounds.length === 0) {
    return undefined;
  }
  const mins = bounds.map((bound) => bound.min).filter((min): min is number => min !== undefined);
  const maxes = bounds.map((bound) => bound.max).filter((max): max is number => max !== undefined);
  return boundOf(mins.length > 0 ? Math.max(...mins) : undefined, maxes.length > 0 ? Math.min(...maxes) : undefined);
}

/**
 * Every bound `model` puts on `quantity`: its applicability row, and, when the
 * model takes the quantity, the bound of the quantity's kind (ADR-0002
 * decision 46). The two hold at once, so a caller intersects them.
 */
function everyBoundFor(model: RegisteredModel, quantity: Quantity): Bound[] {
  const takes = model.inputs.some((entry) => entry.quantity === quantity);
  return [boundFor(model.info.inputs, quantity), takes ? kindBounds[quantity.kind] : undefined].filter(
    (bound): bound is Bound => bound !== undefined,
  );
}

/**
 * The bound a humidity entry in `mode` must satisfy under `model`: relative
 * humidity's — its kind's 0 to 100, narrowed by any row the model has —
 * converted into the entry's mode by the mode's own `fromRelativeHumidity` at
 * the slot's dry-bulb temperature and the atmospheric pressure (ADR-0002
 * decisions 46 and 49). An end the mode has no finite value for (the dew
 * point of 0 %) is dropped. The library's
 * conversions do not rise with relative humidity everywhere — saturated air's
 * humidity ratio turns negative from 100 °C — so where the converted ends come
 * out inverted the entry has no bound at that temperature. `undefined` for a
 * model without the humidity entry group.
 */
function humidityEntryBoundFor(model: RegisteredModel, mode: HumidityMode, slot: Slot, atmosphericPressure: number): Bound | undefined {
  // `rh_from_wet_bulb` clamps to 0 – 100, so a wet-bulb entry can never
  // resolve outside the bound; and `t_wb` at 0 % is approximate (1.9 °C at
  // 10 °C, which reads back as 16 %), so bounding the entry would stop valid ones.
  if (mode === humidityMode.wetBulb) {
    return undefined;
  }
  const relativeHumidity = intersect(everyBoundFor(model, q.rh));
  if (!relativeHumidity) {
    return undefined;
  }
  const tdb = resolvedTdb(slot);
  const converted = (end: number | undefined) =>
    end === undefined ? undefined : mode.fromRelativeHumidity(end, tdb, atmosphericPressure);
  const bound = boundOf(converted(relativeHumidity.min), converted(relativeHumidity.max));
  if (bound.min !== undefined && bound.max !== undefined && bound.min > bound.max) {
    return undefined;
  }
  return bound.min === undefined && bound.max === undefined ? undefined : bound;
}

/**
 * The bound an entered quantity must satisfy under `model`, given the slot's
 * entry modes. An operative entry stands in for both temperature rows and
 * must satisfy both at once. The humidity entry is held to relative
 * humidity's bound converted into its mode at the slot's dry-bulb
 * temperature and `atmosphericPressure`, so the bound moves with both,
 * except in wet-bulb entry, which is not bounded
 * ({@link humidityEntryBoundFor}); a slot that
 * holds no humidity has no humidity entry to bound. Entered `v` has
 * no bound of its own — the standard bounds the relative air speed it
 * derives, `vr`, which the library checks and {@link violationRows} reports
 * on the `v` row.
 */
export function enteredBound(
  model: RegisteredModel,
  quantity: Quantity,
  slot: Slot,
  atmosphericPressure: number,
): Bound | undefined {
  const { humidity } = slot;
  if (quantity === humidity?.mode.quantity) {
    return humidityEntryBoundFor(model, humidity.mode, slot, atmosphericPressure);
  }
  if (humidity === undefined && isHumidityQuantity(quantity)) {
    return undefined;
  }
  const { mode } = slot.temperature;
  const constrained =
    mode !== temperatureMode.separate && mode.panel.includes(quantity) ? temperatureMode.separate.panel : [quantity];
  return intersect(constrained.flatMap((entry) => everyBoundFor(model, entry)));
}

/**
 * Entered values outside the bounds {@link enteredBound} gives — the pre-call
 * gate, with the bound each value was tested against. Checks what the user
 * typed, not a derived value: a humidity entry is tested in its own mode,
 * against relative humidity's bound converted into it. It says nothing about
 * a quantity {@link enteredBound} leaves unbounded: a wet-bulb entry, or the
 * entered `v` of a model that takes `vr`, whose derived `vr` the library
 * reports after the call, through {@link violationRows}.
 *
 * The one definition of out of range in the app (ADR-0002 decision 32). The
 * input panel's red boxes and the model-switch dialog's rows are both this
 * list, so the two can never disagree about a value.
 */
export function outOfRangeRows(slot: Slot, model: RegisteredModel, atmosphericPressure: number): OutOfRangeRow[] {
  const entered: (readonly [Quantity, number])[] = [...slot.values];
  if (slot.humidity) {
    entered.push([slot.humidity.mode.quantity, slot.humidity.value]);
  }
  const rows: OutOfRangeRow[] = [];
  for (const [quantity, value] of entered) {
    const bound = enteredBound(model, quantity, slot, atmosphericPressure);
    if (bound && breaksBound(bound, value)) {
      rows.push({ quantity, value, bound });
    }
  }
  return rows;
}

/** Which quantities {@link outOfRangeRows} names — what the input panel marks. */
export function outOfRangeQuantities(slot: Slot, model: RegisteredModel, atmosphericPressure: number): Quantity[] {
  return outOfRangeRows(slot, model, atmosphericPressure).map((row) => row.quantity);
}

/**
 * The rows a completed run broke, as the library reports them on the result's
 * `warnings` (ADR-0002 decision 23) — the app does not evaluate a row. Each
 * row's key is reconciled to a quantity through `quantityFor`; a key the table
 * lacks is dropped. When the model takes `vr`, its row is reported on the
 * entered `v`, the quantity the user typed, and stays `bounded` by `vr`. A
 * quantity can break several limits in one role (PMV (ASHRAE 55)'s fixed
 * air-speed row plus its no-control rows): those merge into one row over the
 * narrowest bound, so the person reads one sentence; the individual bounds
 * are not kept.
 */
export function violationRows(model: RegisteredModel, result: ModelResult): ViolationRow[] {
  const rows: ViolationRow[] = [];
  for (const { key, role, value, bound } of resultWarnings(model, result)) {
    const keyed = quantityFor(key);
    if (!keyed) {
      continue;
    }
    const quantity = takesRelativeAirSpeed(model) && keyed === q.vr ? q.v : keyed;
    const index = rows.findIndex((row) => row.quantity === quantity && row.role === role);
    if (index === -1) {
      rows.push({ quantity, bounded: keyed, role, value, bound });
    } else {
      // Keeps the first row's `bounded`: a model that takes `vr` reports `vr` rows and no `v` rows.
      rows[index] = { ...rows[index], bound: intersect([rows[index].bound, bound]) };
    }
  }
  return rows;
}

/** A run's violation rows by the side they describe: the inputs they came from, or the outputs. */
export interface ViolationSides {
  readonly inputs: readonly ViolationRow[];
  readonly outputs: readonly ViolationRow[];
}

// `satisfies Record<ViolationRow["role"], …>`: a role added to `ViolationRow`
// fails to compile here until it is given a side. A role the library adds
// fails first in `violationRows`, where its warning becomes a `ViolationRow`.
const sideOfRole = {
  input: "inputs",
  derived: "inputs",
  output: "outputs",
} as const satisfies Record<ViolationRow["role"], keyof ViolationSides>;

/** `rows` split by role, each row on exactly one side, the side `sideOfRole` gives its role. */
export function splitViolations(rows: readonly ViolationRow[]): ViolationSides {
  const sides: { inputs: ViolationRow[]; outputs: ViolationRow[] } = { inputs: [], outputs: [] };
  for (const row of rows) {
    sides[sideOfRole[row.role]].push(row);
  }
  return sides;
}

/** `bound`, converted to the display unit and formatted, without the unit symbol. */
export function formatBound(bound: Bound, unit: DisplayUnit): string {
  const min = bound.min !== undefined ? formatNumber(unit.fromSi(bound.min)) : undefined;
  const max = bound.max !== undefined ? formatNumber(unit.fromSi(bound.max)) : undefined;
  if (min !== undefined && max !== undefined) {
    return `${min} – ${max}`;
  }
  return min !== undefined ? `≥ ${min}` : `≤ ${max}`;
}

/** The sentence a violation row shows the user, from the bounded quantity's label, the bound and its display unit. */
export function warningFor(row: ViolationRow, unitSystem: UnitSystem): string {
  const unit = displayUnitFor(row.bounded, unitSystem);
  return copy.applicabilityWarning(row.bounded.label, valueWithUnit(formatBound(row.bound, unit), unit));
}
