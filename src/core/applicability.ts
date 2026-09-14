/**
 * What is inside and outside a standard's applicability, read from the
 * library's `_INFO` alone (ADR-0002 decision 4). Owns every read of
 * `applicability` off a model's `info.inputs`, `info.derived` and
 * `info.outputs`: the bound an entered quantity must satisfy (the pre-call
 * gate, and the range shown beside the input), and the rows a completed run
 * still breaks (the derived vapour pressure, the relative air speed derived
 * from `v`, and a bounded output).
 *
 * `limitFor` and the fork's `ApplicabilityLimit` are gone with it: a
 * violation is `{ quantity, role, value, bound }`, and the warning sentence is
 * templated here from the quantity's label, the bound and the display unit —
 * the fork's `limit.warning` strings are not carried.
 */
import { p_sat } from "jsthermalcomfort-main";
import type { Bound, VariableInfo } from "jsthermalcomfort-main";
import { v_relative } from "jsthermalcomfort/utilities";
import { temperatureMode, type TemperatureMode } from "./entryModes";
import { relativeHumidityOf, requireValue, resolvedTdb, type SlotInputs } from "./libraryInputs";
import type { ModelResult, RegisteredModel } from "./modelDeclaration";
import { formatNumber } from "./numberFormat";
import { quantities, quantityFor, type Quantity } from "./quantities";
import type { DisplayUnit } from "./units";
import { displayUnitFor } from "./units";
import type { UnitSystem } from "./unitSystem";

export type { Bound };

const q = quantities;

/** One applicability row a value broke, and where it appeared in the model's evaluation. */
export interface ViolationRow {
  readonly quantity: Quantity;
  readonly role: "input" | "derived" | "output";
  readonly value: number;
  readonly bound: Bound;
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

function breaksBound(bound: Bound | undefined, value: number): boolean {
  if (!bound) {
    return false;
  }
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
 * which {@link derivedViolations} checks and reports on the `v` row.
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
 * Entered quantities outside the model's applicability bounds — the pre-call
 * gate. Checks what the user typed, not a derived value.
 */
export function outOfRangeInputs(slot: SlotInputs, model: RegisteredModel): Quantity[] {
  const entered: (readonly [Quantity, number])[] = [
    ...slot.values,
    [slot.humidity.mode.quantity, slot.humidity.value],
  ];
  return entered
    .filter(([quantity, value]) => breaksBound(enteredBound(model, quantity, slot.temperature.mode), value))
    .map(([quantity]) => quantity);
}

/** The water vapour partial pressure ISO 7730 derives from `tdb` and `rh`, in SI. */
export function vapourPressure(tdb: number, rh: number): number {
  return (rh / 100) * p_sat(tdb);
}

/**
 * The rows a run breaks that the pre-call gate cannot see: the derived
 * vapour pressure, and the relative air speed `v` derives when the model
 * takes `vr`. Reported whether or not the run has happened yet — both are
 * functions of the entered slot alone.
 */
export function derivedViolations(slot: SlotInputs, model: RegisteredModel): ViolationRow[] {
  const rows: ViolationRow[] = [];

  const paBound = boundFor(model.info.derived, q.pa);
  if (paBound) {
    const pa = vapourPressure(resolvedTdb(slot), relativeHumidityOf(slot));
    if (breaksBound(paBound, pa)) {
      rows.push({ quantity: q.pa, role: "derived", value: pa, bound: paBound });
    }
  }

  const v = slot.values.get(q.v);
  const vrBound = boundFor(model.info.inputs, q.vr);
  if (model.relativeAirSpeed && v !== undefined && vrBound) {
    const vr = v_relative(v, requireValue(slot.values, q.met));
    if (breaksBound(vrBound, vr)) {
      rows.push({ quantity: q.v, role: "input", value: vr, bound: vrBound });
    }
  }

  return rows;
}

/**
 * The output rows a completed run breaks, read off the model's own result
 * object by key (ADR-0002 decision 3).
 */
export function outputViolations(model: RegisteredModel, result: ModelResult): ViolationRow[] {
  const rows: ViolationRow[] = [];
  for (const [key, variable] of Object.entries(model.info.outputs)) {
    if (!variable.applicability) {
      continue;
    }
    const quantity = quantityFor(key);
    const value = quantity ? result[key] : undefined;
    if (quantity && typeof value === "number" && breaksBound(variable.applicability, value)) {
      rows.push({ quantity, role: "output", value, bound: variable.applicability });
    }
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
