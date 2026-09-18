import { v_relative } from "jsthermalcomfort";
import { humidityMode, temperatureMode, type HumidityMode, type TemperatureMode } from "./entryModes";
import { hasHumidityGroup, hasTemperatureGroup, type ModelResult, type RegisteredModel } from "./modelDeclaration";
import { quantities, type Quantity } from "./quantities";

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
 * The slot's dry-bulb temperature: the entered `tdb`, or the operative entry
 * standing in for it under operative mode.
 */
export function resolvedTdb(slot: SlotInputs): number {
  return slot.values.get(q.tdb) ?? requireValue(slot.values, q.operative_tmp);
}

/**
 * The slot's humidity as the library's `rh`, converted from whatever the user
 * entered at the slot's dry-bulb temperature (the operative temperature under
 * operative entry, ADR §4.5). The one place the mode's conversion is invoked.
 */
export function relativeHumidityOf(slot: SlotInputs): number {
  return slot.humidity.mode.toRelativeHumidity(slot.humidity.value, resolvedTdb(slot));
}

/**
 * Entry-group representations → the SI quantities the library model takes
 * (ADR §4.5): operative temperature expands to `tdb = tr = operative_tmp`, the
 * humidity entry becomes `rh`, and `v` becomes `vr` when the model asks for it.
 */
export function resolveQuantities(slot: SlotInputs, model: RegisteredModel): Map<Quantity, number> {
  const resolved = new Map(slot.values);

  if (hasTemperatureGroup(model) && slot.temperature.mode === temperatureMode.operative) {
    const operative = requireValue(resolved, q.operative_tmp);
    resolved.set(q.tdb, operative);
    resolved.set(q.tr, operative);
    resolved.delete(q.operative_tmp);
  }

  if (hasHumidityGroup(model)) {
    resolved.set(q.rh, relativeHumidityOf(slot));
  }

  if (model.relativeAirSpeed) {
    resolved.set(q.vr, v_relative(requireValue(resolved, q.v), requireValue(resolved, q.met)));
    resolved.delete(q.v);
  }

  return resolved;
}

/**
 * The keyed record `run` takes, for `slot`: its resolved quantities, keyed by
 * {@link keyedInputs}. The declaration's own `run` hardcodes
 * `limit_inputs: false` — `core/applicability.ts` gates entered values
 * against `_INFO` before calling, and the library then always returns numbers
 * rather than NaN, the behaviour of the deployed CBE tool. The rows a run
 * still breaks (derived, output, or the `v` row when `vr = v + 0.3(met − 1)`
 * breaks it while the entered `v` does not) are reported, not gated, by
 * `applicability.derivedViolations` and `applicability.outputViolations`.
 */
export function toLibraryInputs(slot: SlotInputs, model: RegisteredModel): Record<string, number> {
  return keyedInputs(resolveQuantities(slot, model));
}

/**
 * SI values keyed by `Quantity.key`, the shape `run` takes. Besides shareLink,
 * this is the only place in the app that reads `Quantity.key` in this
 * direction (ADR §4.0).
 */
export function keyedInputs(values: ReadonlyMap<Quantity, number>): Record<string, number> {
  return Object.fromEntries([...values].map(([quantity, value]) => [quantity.key, value]));
}

/**
 * The mirror read: a quantity's value off the model's own result object, by
 * key. `undefined` for a key the result does not carry. The one cast onto
 * `ModelResult`'s deliberately unindexed `object` (`core/modelDeclaration.ts`).
 */
export function resultValue(result: ModelResult, quantity: Quantity): number | string | undefined {
  return (result as Record<string, number | string>)[quantity.key];
}

/**
 * The quantities the user actually types, in panel order: the model's inputs
 * with its temperature rows replaced by the current mode's. The input panel
 * lays these out and the dynamic chart offers them as axes.
 */
export function enteredQuantities(model: RegisteredModel, mode: TemperatureMode): Quantity[] {
  const separate: readonly Quantity[] = temperatureMode.separate.panel;
  const rows: Quantity[] = [];
  for (const { quantity } of model.inputs) {
    if (!separate.includes(quantity)) {
      rows.push(quantity);
    } else if (quantity === separate[0]) {
      rows.push(...mode.panel);
    }
  }
  return rows;
}

/**
 * What the user entered for `quantity`, humidity included. `rh` is answered
 * in every mode — the dynamic chart sweeps and marks the library's `rh`, not
 * the entered representation.
 */
export function enteredValue(slot: SlotInputs, quantity: Quantity): number | undefined {
  if (quantity === slot.humidity.mode.quantity) {
    return slot.humidity.value;
  }
  if (quantity === q.rh) {
    return relativeHumidityOf(slot);
  }
  return slot.values.get(quantity);
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
    } else if (quantity === q.rh) {
      // An rh sweep overrides the humidity entry outright: the chart's axis is the library's rh.
      humidity = { mode: humidityMode.rh, value };
    } else {
      values.set(quantity, value);
    }
  }
  return { values, humidity, temperature: slot.temperature };
}
