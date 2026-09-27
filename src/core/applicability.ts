/**
 * What is inside and outside a standard's applicability. Owns every read of
 * `applicability` off a model's `info.inputs`: the bound an entered quantity
 * must satisfy (the pre-call gate, and the range shown beside the input).
 * The rows a completed run still breaks are the library's, read off the
 * result's `warnings` (ADR-0002 decision 23) and mapped to quantities here.
 *
 * `limitFor` and the fork's `ApplicabilityLimit` are gone with it: a
 * violation is `{ quantity, role, value, bound }`, and the warning sentence is
 * templated here from the quantity's label, the bound and the display unit —
 * the fork's `limit.warning` strings are not carried.
 */
import type { Bound, VariableInfo } from "jsthermalcomfort";
import { temperatureMode, type TemperatureMode } from "./entryModes";
import { resultWarnings, type SlotInputs } from "./libraryInputs";
import type { ModelResult, RegisteredModel } from "./modelDeclaration";
import { formatNumber } from "./numberFormat";
import { quantities, quantityFor, type Quantity } from "./quantities";
import type { DisplayUnit } from "./units";
import { displayUnitFor } from "./units";
import type { UnitSystem } from "./unitSystem";

export type { Bound };

const q = quantities;

/** One entered value the pre-call gate stops, with the bound it was tested against. */
export interface OutOfRangeRow {
  readonly quantity: Quantity;
  readonly value: number;
  readonly bound: Bound;
}

/** One applicability row a value broke, and where it appeared in the model's evaluation. */
export interface ViolationRow extends OutOfRangeRow {
  readonly role: "input" | "derived" | "output";
}

/** `info`'s row for `quantity`, reconciled by key through `quantityFor` (ADR-0002 decision 2). */
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

/** The narrowest bound that satisfies every bound in `bounds`, or `undefined` for none. */
function intersect(bounds: readonly Bound[]): Bound | undefined {
  if (bounds.length === 0) {
    return undefined;
  }
  const mins = bounds.map((bound) => bound.min).filter((min): min is number => min !== undefined);
  const maxes = bounds.map((bound) => bound.max).filter((max): max is number => max !== undefined);
  const result: { min?: number; max?: number } = {};
  if (mins.length > 0) {
    result.min = Math.max(...mins);
  }
  if (maxes.length > 0) {
    result.max = Math.min(...maxes);
  }
  return result;
}

/**
 * The bound an entered quantity must satisfy under `model.info`, given the
 * current temperature mode. An operative entry stands in for both
 * temperature rows and must satisfy both at once. Entered `v` has no bound of
 * its own — the standard bounds the relative air speed it derives, `vr`,
 * which the library checks and {@link violationRows} reports on the `v` row.
 */
export function enteredBound(model: RegisteredModel, quantity: Quantity, mode: TemperatureMode): Bound | undefined {
  const constrained =
    mode !== temperatureMode.separate && mode.panel.includes(quantity) ? temperatureMode.separate.panel : [quantity];
  return intersect(
    constrained
      .map((entry) => boundFor(model.info.inputs, entry))
      .filter((bound): bound is Bound => bound !== undefined),
  );
}

/**
 * Entered values outside the model's applicability bounds — the pre-call gate,
 * with the bound each value was tested against. Checks what the user typed,
 * not a derived value, and says nothing about a quantity the model does not
 * bound (the entered `v` of a model that takes `vr`, a humidity entered as
 * anything but `rh`): the library reports those after the call, through
 * {@link violationRows}.
 *
 * The one definition of out of range in the app (ADR-0002 decision 32). The
 * input panel's red boxes and the model-switch dialog's rows are both this
 * list, so the two can never disagree about a value.
 */
export function outOfRangeRows(slot: SlotInputs, model: RegisteredModel): OutOfRangeRow[] {
  const entered: (readonly [Quantity, number])[] = [
    ...slot.values,
    [slot.humidity.mode.quantity, slot.humidity.value],
  ];
  const rows: OutOfRangeRow[] = [];
  for (const [quantity, value] of entered) {
    const bound = enteredBound(model, quantity, slot.temperature.mode);
    if (bound && breaksBound(bound, value)) {
      rows.push({ quantity, value, bound });
    }
  }
  return rows;
}

/** Which quantities {@link outOfRangeRows} names — what the input panel marks. */
export function outOfRangeInputs(slot: SlotInputs, model: RegisteredModel): Quantity[] {
  return outOfRangeRows(slot, model).map((row) => row.quantity);
}

/**
 * The rows a completed run broke, as the library reports them on the result's
 * `warnings` (ADR-0002 decision 23) — the app does not evaluate a row. Each
 * row's key is reconciled to a quantity through `quantityFor`; a key the table
 * lacks is dropped. A key can repeat (one quantity breaking several limits),
 * so every row is kept. When the model takes `vr`, its row is reported on the
 * entered `v`, the quantity the user typed.
 */
export function violationRows(model: RegisteredModel, result: ModelResult): ViolationRow[] {
  const rows: ViolationRow[] = [];
  for (const { key, role, value, bound } of resultWarnings(model, result)) {
    const quantity = quantityFor(key);
    if (!quantity) {
      continue;
    }
    rows.push({ quantity: model.relativeAirSpeed && quantity === q.vr ? q.v : quantity, role, value, bound });
  }
  return rows;
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

/** The sentence a violation row shows the user, templated from the quantity's label, bound and display unit. */
export function warningFor(row: ViolationRow, unitSystem: UnitSystem): string {
  const unit = displayUnitFor(row.quantity, unitSystem);
  const range = formatBound(row.bound, unit);
  return unit.symbol ? `${row.quantity.label} must be ${range} ${unit.symbol}` : `${row.quantity.label} must be ${range}`;
}
