import { quantities, type Quantity } from "jsthermalcomfort/io";
import { v_relative } from "jsthermalcomfort/utilities";
import { temperatureMode, type HumidityMode, type TemperatureMode } from "./entryModes";
import { limitFor, type LibraryInit, type Range, type RegisteredModel } from "./modelDeclaration";

/**
 * The slice of an input slot this module reads. A plain interface, so core/
 * never imports state/ (ADR §5).
 */
export interface SlotInputs {
  readonly values: ReadonlyMap<Quantity, number>;
  readonly humidity: { readonly mode: HumidityMode; readonly value: number };
  readonly temperature: { readonly mode: TemperatureMode };
}

const q = quantities;

export function requireValue(values: ReadonlyMap<Quantity, number>, quantity: Quantity): number {
  const value = values.get(quantity);
  if (value === undefined) {
    throw new Error(`Slot has no value for ${quantity.label}`);
  }
  return value;
}

/**
 * Entry-group representations → the SI quantities the library model takes
 * (ADR §4.5): operative temperature expands to `tdb = tr = operative_tmp`, the
 * humidity entry becomes `rh`, and `v` becomes `vr` when the model asks for it.
 */
export function resolveQuantities(slot: SlotInputs, model: RegisteredModel): Map<Quantity, number> {
  const resolved = new Map(slot.values);

  if (slot.temperature.mode === temperatureMode.operative) {
    const operative = requireValue(resolved, q.operative_tmp);
    resolved.set(q.tdb, operative);
    resolved.set(q.tr, operative);
    resolved.delete(q.operative_tmp);
  }

  // Relative humidity is the only humidity mode until the library ships the
  // inverse conversions (rewrite plan, Phase 2b); the other modes convert here.
  resolved.set(q.rh, slot.humidity.value);

  if (model.relativeAirSpeed) {
    resolved.set(q.vr, v_relative(requireValue(resolved, q.v), requireValue(resolved, q.met)));
    resolved.delete(q.v);
  }

  return resolved;
}

/**
 * The init object of the library's io wrapper. Besides shareLink, this is the
 * only place in the app that reads `Quantity.key` (ADR §4.0).
 */
export function toLibraryInputs(slot: SlotInputs, model: RegisteredModel): LibraryInit {
  const byKey = Object.fromEntries(
    [...resolveQuantities(slot, model)].map(([quantity, value]) => [quantity.key, value]),
  );
  // `limit_inputs: false`: the app gates inputs against `model.limits` before
  // calling, and the library then always returns numbers rather than NaN —
  // the behaviour of the deployed CBE tool.
  return { ...byKey, units: "SI", limit_inputs: false };
}

/**
 * The range an entered quantity must satisfy. An operative-temperature entry
 * is written to every quantity it replaces, so it must satisfy all of their
 * limits at once.
 */
export function enteredRange(model: RegisteredModel, quantity: Quantity, mode: TemperatureMode): Range | undefined {
  const constrained =
    mode !== temperatureMode.separate && mode.panel.includes(quantity)
      ? temperatureMode.separate.panel
      : [quantity];
  const limits = constrained.map((entry) => limitFor(model, entry)).filter((limit) => limit !== undefined);
  if (limits.length === 0) {
    return undefined;
  }
  return {
    min: Math.max(...limits.map((limit) => limit.min)),
    max: Math.min(...limits.map((limit) => limit.max)),
  };
}

/**
 * Entered quantities outside the model's applicability limits. Checks what the
 * user typed, not the derived `vr`.
 */
export function outOfRangeInputs(slot: SlotInputs, model: RegisteredModel): Quantity[] {
  const entered: (readonly [Quantity, number])[] = [
    ...slot.values,
    [slot.humidity.mode.quantity, slot.humidity.value],
  ];
  // ponytail: vr = v + 0.3(met − 1) can exceed the vr limit while v is within
  // its own; the library computes anyway, as the deployed tool does.
  return entered
    .filter(([quantity, value]) => {
      const range = enteredRange(model, quantity, slot.temperature.mode);
      return range !== undefined && (value < range.min || value > range.max);
    })
    .map(([quantity]) => quantity);
}

/**
 * The quantities the user actually types, in panel order: the model's inputs
 * with its temperature rows replaced by the current mode's. The input panel
 * lays these out and the dynamic chart offers them as axes.
 */
export function enteredQuantities(model: RegisteredModel, mode: TemperatureMode): Quantity[] {
  const separate: readonly Quantity[] = temperatureMode.separate.panel;
  const rows: Quantity[] = [];
  for (const [quantity] of model.inputs) {
    if (!separate.includes(quantity)) {
      rows.push(quantity);
    } else if (quantity === separate[0]) {
      rows.push(...mode.panel);
    }
  }
  return rows;
}

/** What the user entered for `quantity`, humidity included. */
export function enteredValue(slot: SlotInputs, quantity: Quantity): number | undefined {
  return quantity === slot.humidity.mode.quantity ? slot.humidity.value : slot.values.get(quantity);
}

/**
 * The same slot with some entered values replaced — how the dynamic chart
 * sweeps its axes. Replacing before resolution keeps the derivations honest:
 * an overridden `v` is still turned into `vr`, an overridden `operative_tmp`
 * still expands to `tdb = tr`.
 */
export function withEnteredValues(slot: SlotInputs, overrides: ReadonlyMap<Quantity, number>): SlotInputs {
  const values = new Map(slot.values);
  let humidity = slot.humidity;
  for (const [quantity, value] of overrides) {
    if (quantity === humidity.mode.quantity) {
      humidity = { mode: humidity.mode, value };
    } else {
      values.set(quantity, value);
    }
  }
  return { values, humidity, temperature: slot.temperature };
}
