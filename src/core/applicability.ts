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
import { temperatureMode, type HumidityMode } from "./entryModes";
import { takesRelativeAirSpeed, type ModelResult, type RegisteredModel } from "./modelDeclaration";
import { resultWarnings } from "./modelRun";
import { formatBoundEnd, isShownBeyond } from "./numberFormat";
import { kindBounds, quantities, quantityFor, type Quantity } from "./quantities";
import { isHumidityQuantity, resolvedTdb, valueEntryGroups, type EntryCorrection, type Slot, type ValueEntryModes } from "./slot";
import { displayUnitFor, valueWithUnit, type DisplayUnit } from "./units";
import { unitSystem, type UnitSystem } from "./unitSystem";

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
 * differ for `vr` under air speed entry, reported on the entered `v`
 * (ADR-0002 decision 4).
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

/**
 * Whether `value` of `quantity` is outside `bound` as its row shows both: the
 * number formatter's comparison, in the quantity's SI display unit (ADR-0002
 * decision 56). A difference no row shows, 1.8751 clo under a maximum of
 * 1.875, is not outside.
 */
function breaksBound(quantity: Quantity, bound: Bound, value: number): boolean {
  return isShownBeyond(value, bound, gateUnitFor(quantity));
}

/**
 * The unit the gate judges a value of `quantity` in, whatever the session
 * shows: g/kg for the humidity ratio, not kg/kg. The range text asks the same
 * unit, so an end it writes is one the gate accepts.
 */
function gateUnitFor(quantity: Quantity): DisplayUnit {
  return displayUnitFor(quantity, unitSystem.si);
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
 * `bound` converted into the quantity a person entered, each end by `convert`:
 * the one rule by which an entry is held to a bound on what it is turned into
 * (ADR-0002 decisions 46 and 54), the humidity entry's and an
 * activity-adjusted entry's. An end `convert` has no finite value for is
 * dropped. `undefined` where neither end is left, and where the converted
 * ends come out inverted: the entry then has no bound.
 */
function convertedBound(bound: Bound, convert: (end: number) => number): Bound | undefined {
  const converted = boundOf(
    bound.min === undefined ? undefined : convert(bound.min),
    bound.max === undefined ? undefined : convert(bound.max),
  );
  if (isInverted(converted)) {
    return undefined;
  }
  return converted.min === undefined && converted.max === undefined ? undefined : converted;
}

/** Whether no value satisfies `bound`: its lower end is above its upper one. */
function isInverted(bound: Bound): boolean {
  return bound.min !== undefined && bound.max !== undefined && bound.min > bound.max;
}

/**
 * The bound a humidity entry in `mode` must satisfy under `model`: relative
 * humidity's — its kind's 0 to 100, narrowed by any row the model has —
 * converted into the entry's mode by the mode's own `fromRelativeHumidity` at
 * the slot's dry-bulb temperature and the atmospheric pressure (ADR-0002
 * decisions 46 and 49), by {@link convertedBound}. The end the mode has no
 * finite value for is the dew point of 0 %. The library's
 * conversions do not rise with relative humidity everywhere — saturated air's
 * humidity ratio turns negative from 100 °C — so the converted ends come
 * out inverted there, and the entry has no bound at that temperature. The
 * mode says of itself whether it is bounded at all, and whether its bound
 * reads the pressure, in which case it has none while the pressure is out of
 * range (decision 53).
 * `undefined` for a model without the humidity entry group.
 */
function humidityEntryBoundFor(model: RegisteredModel, mode: HumidityMode, slot: Slot, atmosphericPressure: number): Bound | undefined {
  if (!mode.bounded || (mode.readsPressure && isAtmosphericPressureOutOfRange(atmosphericPressure))) {
    return undefined;
  }
  const relativeHumidity = intersect(everyBoundFor(model, q.rh));
  if (!relativeHumidity) {
    return undefined;
  }
  const tdb = resolvedTdb(slot);
  return convertedBound(relativeHumidity, (end) => mode.fromRelativeHumidity(end, tdb, atmosphericPressure));
}

/**
 * The bound an entry of an activity-adjusted group must satisfy under `model`
 * (ADR-0002 decision 54 as revised a third time). The model's info bounds the
 * quantity the model takes, `correction.taken`: an entry of the corrected mode
 * is held to that row as it is, and an entry of the other mode to that row
 * converted into the entered quantity by the correction's inverse at the
 * slot's own other values ({@link convertedBound}), so the bound moves with
 * them. The entered quantity's kind bound holds beside it: an air speed is not
 * below 0, where the model's 0 m/s of relative air speed is a lower air speed.
 * Where the two leave no entry, the kind's holds alone, as a converted bound
 * whose ends come out inverted is dropped: past 4.3 met the activity's share
 * alone is over ISO 7730's 1 m/s, a metabolic rate the gate stops on its own row.
 */
function correctedEntryBoundFor(
  model: RegisteredModel,
  quantity: Quantity,
  slot: Slot,
  correction: EntryCorrection,
): Bound | undefined {
  const taken = boundFor(model.info.inputs, correction.taken);
  if (correction.corrected.panel.includes(quantity)) {
    return taken;
  }
  const kind = kindBounds[quantity.kind];
  const converted = taken && convertedBound(taken, (end) => correction.entryGiving(end, slot, model));
  const both = intersect([converted, kind].filter((bound): bound is Bound => bound !== undefined));
  return both && isInverted(both) ? kind : both;
}

/**
 * The bound an entered quantity must satisfy under `model`, given the slot's
 * entry modes. An operative entry stands in for both temperature rows and
 * must satisfy both at once. The humidity entry is held to relative
 * humidity's bound converted into its mode at the slot's dry-bulb
 * temperature and `atmosphericPressure`, so the bound moves with both,
 * except in wet-bulb entry, which is not bounded, and in humidity-ratio entry
 * while the pressure is out of range ({@link humidityEntryBoundFor}); a slot that
 * holds no humidity has no humidity entry to bound. An entry of an
 * activity-adjusted group the model has is held to the model's row for what
 * it takes, `vr` or the dynamic clothing insulation the library calls `clo`:
 * as it is for an entered `vr` or dynamic clothing insulation, and converted
 * into the entered quantity for an entered `v` or clothing insulation
 * ({@link correctedEntryBoundFor}). In a model without the group an entered
 * `v` or `clo` is held to the model's own row for it.
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
  for (const { correction, appliesTo, modes } of valueEntryGroups) {
    if (correction && appliesTo(model) && modes.some((mode) => mode.panel.includes(quantity))) {
      return correctedEntryBoundFor(model, quantity, slot, correction);
    }
  }
  return intersect(boundingQuantities(quantity, slot).flatMap((entry) => everyBoundFor(model, entry)));
}

/** The quantities whose bounds an entry of `quantity` must satisfy, under the slot's entry modes. */
function boundingQuantities(quantity: Quantity, slot: Slot): readonly Quantity[] {
  const { mode } = slot.temperature;
  if (mode !== temperatureMode.separate && mode.panel.includes(quantity)) {
    return temperatureMode.separate.panel;
  }
  return [quantity];
}

/**
 * Entered values outside the bounds {@link enteredBound} gives — the pre-call
 * gate, with the bound each value was tested against. Checks what the user
 * typed, not a derived value: a humidity entry is tested in its own mode,
 * against relative humidity's bound converted into it. It says nothing about
 * a quantity {@link enteredBound} leaves unbounded: a wet-bulb entry, or a
 * humidity-ratio entry while the pressure is out of range. An entered `v` or
 * clothing insulation is tested against the model's bound for what the model
 * is given, converted into it, so the library finds no row of the model's info
 * broken by what the gate passed, at the precision a row shows, which is the
 * precision {@link violationRows} judges the library's rows at; what it still
 * reports of an input is a limit the info does not carry.
 *
 * The bounds are read at `boundsAt`, the slot itself unless given: a bound may be
 * read at another entry, and `core/modelSwitch.ts` asks what the entries
 * break at the values a yes would leave.
 *
 * The one definition of out of range in the app (ADR-0002 decision 32). The
 * input panel's red boxes and the model-switch dialog's rows are both this
 * list, so the two can never disagree about a value.
 */
export function outOfRangeRows(slot: Slot, model: RegisteredModel, atmosphericPressure: number, boundsAt: Slot = slot): OutOfRangeRow[] {
  const entered: (readonly [Quantity, number])[] = [...slot.values];
  if (slot.humidity) {
    entered.push([slot.humidity.mode.quantity, slot.humidity.value]);
  }
  const rows: OutOfRangeRow[] = [];
  for (const [quantity, value] of entered) {
    const bound = enteredBound(model, quantity, boundsAt, atmosphericPressure);
    if (bound && breaksBound(quantity, bound, value)) {
      rows.push({ quantity, value, bound });
    }
  }
  return rows;
}

/**
 * Whether the session's atmospheric pressure breaks its kind's bound. Judged
 * apart from {@link outOfRangeRows}: that list is what a model switch asks
 * about and adjusts in the slot, and the pressure is neither held in a slot
 * nor dependent on the model (ADR-0002 decision 49). {@link enteredBound}
 * applies a kind's bound only to a quantity the model takes, so it never
 * reaches the pressure.
 */
export function isAtmosphericPressureOutOfRange(atmosphericPressure: number): boolean {
  const bound = kindBounds[q.p_atm.kind];
  return bound !== undefined && breaksBound(q.p_atm, bound, atmosphericPressure);
}

/** Which quantities {@link outOfRangeRows} names — what the input panel marks. */
export function outOfRangeQuantities(slot: Slot, model: RegisteredModel, atmosphericPressure: number): Quantity[] {
  return outOfRangeRows(slot, model, atmosphericPressure).map((row) => row.quantity);
}

/**
 * The rows a completed run broke, as the library reports them on the result's
 * `warnings` (ADR-0002 decision 23) — the app finds no row of its own. Each
 * row's key is reconciled to a quantity through `quantityFor`; a key the table
 * lacks is dropped. When the model takes `vr`, its row is reported on the
 * air-speed quantity entered under `modes`, the row the person sees: the
 * entered `v`, staying `bounded` by `vr`, or the entered `vr` itself, with no
 * mapping (ADR-0002 decision 54): the gate holds the entry to the info's own
 * `vr` row, so what arrives here is PMV (ASHRAE 55)'s limits at the operative
 * temperature. No `clo` row arrives from a model with the clothing entry
 * group, whose entry the gate holds to that row, so none is mapped. A
 * quantity can break several limits in one role (PMV (ASHRAE 55)'s fixed
 * air-speed row plus its no-control rows): those merge into one row over the
 * narrowest bound, so the person reads one sentence; the individual bounds
 * are not kept. A row is only a value shown outside its bound, as the gate
 * judges an entry.
 */
export function violationRows(model: RegisteredModel, result: ModelResult, modes: ValueEntryModes): ViolationRow[] {
  const rows: ViolationRow[] = [];
  for (const { key, role, value, bound } of resultWarnings(model, result)) {
    const keyed = quantityFor(key);
    if (!keyed) {
      continue;
    }
    const { quantity, bounded } = reportedRow(model, keyed, modes);
    // The library judges its bounds exactly, and the app at the precision a row
    // shows (ADR-0002 decision 56): a warning on a value a hair over its bound,
    // which no row shows as outside, is not a row and is dropped silently.
    if (!breaksBound(bounded, bound, value)) {
      continue;
    }
    const index = rows.findIndex((row) => row.quantity === quantity && row.role === role);
    if (index === -1) {
      rows.push({ quantity, bounded, role, value, bound });
    } else {
      // Keeps the first row's `bounded`: a model that takes `vr` reports `vr` rows and no `v` rows.
      rows[index] = { ...rows[index], bound: intersect([rows[index].bound, bound]) };
    }
  }
  return rows;
}

/**
 * Where the library's row for `keyed` is reported under `modes`, and the
 * quantity its bound and value are of: both `keyed` itself, but for the
 * relative air speed of a model that takes it.
 */
function reportedRow(model: RegisteredModel, keyed: Quantity, modes: ValueEntryModes): Pick<ViolationRow, "quantity" | "bounded"> {
  if (keyed === q.vr && takesRelativeAirSpeed(model)) {
    return { quantity: modes.airSpeed.mode.axis, bounded: keyed };
  }
  return { quantity: keyed, bounded: keyed };
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

/**
 * `bound` on `quantity` in its display unit under `system`, formatted, without
 * the unit symbol. Each end is written as any number is, nearest: `0 – 1.88`
 * for a maximum of 1.875; where that end typed back would be stopped by the
 * gate, which judges in the quantity's SI display unit, it steps one shown
 * digit inward: `≤ 0.79` inHg for 2700 Pa (`formatBoundEnd`). The end a person
 * reads is accepted (ADR-0002 decision 56).
 */
export function formatBound(bound: Bound, quantity: Quantity, system: UnitSystem): string {
  const unit = displayUnitFor(quantity, system);
  const judgedIn = gateUnitFor(quantity);
  const min = bound.min !== undefined ? formatBoundEnd(bound.min, "min", unit, judgedIn) : undefined;
  const max = bound.max !== undefined ? formatBoundEnd(bound.max, "max", unit, judgedIn) : undefined;
  if (min !== undefined && max !== undefined) {
    return `${min} – ${max}`;
  }
  return min !== undefined ? `≥ ${min}` : `≤ ${max}`;
}

/** The sentence a violation row shows the user, from the bounded quantity's label, the bound and its display unit. */
export function warningFor(row: ViolationRow, unitSystem: UnitSystem): string {
  const unit = displayUnitFor(row.bounded, unitSystem);
  return copy.applicabilityWarning(row.bounded.label, valueWithUnit(formatBound(row.bound, row.bounded, unitSystem), unit));
}
