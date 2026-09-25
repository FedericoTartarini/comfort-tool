import { t_o, v_relative } from "jsthermalcomfort";
import type { ApplicabilityWarning } from "jsthermalcomfort";
import { humidityMode, temperatureMode, type HumidityMode, type TemperatureMode } from "./entryModes";
import {
  hasHumidityGroup,
  hasTemperatureGroup,
  type ModelResult,
  type OptionSpec,
  type OptionsReader,
  type RegisteredModel,
  type Values,
} from "./modelDeclaration";
import { quantities, type Quantity } from "./quantities";

/**
 * The slice of an input slot this module reads. A plain interface, so core/
 * never imports state/ (ADR §5).
 */
export interface SlotInputs {
  readonly values: ReadonlyMap<Quantity, number>;
  readonly humidity: { readonly mode: HumidityMode; readonly value: number };
  readonly temperature: { readonly mode: TemperatureMode };
  /** Every option any model put here, by identity: a superset bag like `values` (ADR-0002 decision 36). */
  readonly options: ReadonlyMap<OptionSpec, boolean>;
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
 * The values `run` reads for `slot`: its resolved quantities, wrapped by
 * {@link valuesReader}. The declaration's own `run` hardcodes
 * `limit_inputs: false` — `core/applicability.ts` gates entered values
 * against `_INFO` before calling, and the library then always returns numbers
 * rather than NaN, the behaviour of the deployed CBE tool. The rows a run
 * still breaks (derived, output, or the `v` row when `vr = v + 0.3(met − 1)`
 * breaks it while the entered `v` does not) come back on the result's
 * `warnings` and are reported, not gated, by `applicability.violationRows`.
 */
export function toLibraryInputs(slot: SlotInputs, model: RegisteredModel): Values {
  return valuesReader(resolveQuantities(slot, model));
}

/**
 * `values` as the object a declaration's `run` reads: one getter per
 * `Quantity`, under its key, and a throw naming the quantity the map does not
 * carry (ADR-0002 decision 34). Never a silent `undefined` — a missing input
 * that reaches the library unnoticed is the failure this shape exists to rule
 * out.
 */
export function valuesReader(values: ReadonlyMap<Quantity, number>): Values {
  const object = {};
  for (const [key, quantity] of Object.entries(quantities)) {
    Object.defineProperty(object, key, { enumerable: true, get: () => requireValue(values, quantity) });
  }
  // `defineProperty` cannot tell the compiler what it added; the loop above
  // defines exactly the table's keys, which is what `Values` promises.
  return object as Values;
}

/**
 * `options` as the reader a declaration's `run` asks: the boolean the slot
 * holds for the option, and a throw naming an option the map does not carry,
 * for the reason {@link valuesReader} gives (ADR-0002 decision 36).
 */
export function optionsReader(options: ReadonlyMap<OptionSpec, boolean>): OptionsReader {
  return (option) => {
    const value = options.get(option);
    if (value === undefined) {
      throw new Error(`Slot has no value for ${option.label}`);
    }
    return value;
  };
}

/**
 * The mirror read: a quantity's value off the model's own result object, by
 * key. `undefined` for a key the result does not carry. One of the two casts
 * onto `ModelResult`'s deliberately unindexed `object`
 * (`core/modelDeclaration.ts`); {@link resultWarnings} is the other.
 */
export function resultValue(result: ModelResult, quantity: Quantity): number | string | undefined {
  return (result as Record<string, number | string>)[quantity.key];
}

/**
 * The applicability rows the library says the call broke, off the result's
 * `warnings` (ADR-0002 decision 23). Every v1 model returns them, so a result
 * without them is a declaration bug, and it throws naming the model rather
 * than reading as a run that broke nothing.
 */
export function resultWarnings(model: RegisteredModel, result: ModelResult): readonly ApplicabilityWarning[] {
  const warnings = (result as { warnings?: readonly ApplicabilityWarning[] }).warnings;
  if (!warnings) {
    throw new Error(`${model.info.label} returned no applicability rows`);
  }
  return warnings;
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
  return { values, humidity, temperature: slot.temperature, options: slot.options };
}

/**
 * The same slot with its temperatures re-expressed under `mode`. Separate →
 * operative is the library's `t_o(tdb, tr, v)`; operative → separate sets
 * `tdb = tr = operative_tmp`. Lossy and one-way, as in the old tool, and the
 * one removal the bag ever suffers: the two representations never coexist.
 *
 * The one statement of the conversion a slot undergoes: the entry-mode buttons
 * apply it through the slot they own, and `core/modelSwitch.ts` applies it for
 * a model that has no temperature entry group. {@link resolveQuantities}'s
 * expansion is a different act — it stands the operative entry in for the two
 * temperatures of one library call and changes no entry mode.
 */
export function withTemperatureMode(slot: SlotInputs, mode: TemperatureMode): SlotInputs {
  if (mode === slot.temperature.mode) {
    return slot;
  }
  const values = new Map(slot.values);
  if (mode === temperatureMode.operative) {
    const operative = t_o(requireValue(values, q.tdb), requireValue(values, q.tr), requireValue(values, q.v));
    values.set(q.operative_tmp, operative);
    values.delete(q.tdb);
    values.delete(q.tr);
  } else {
    const operative = requireValue(values, q.operative_tmp);
    values.set(q.tdb, operative);
    values.set(q.tr, operative);
    values.delete(q.operative_tmp);
  }
  return { values, humidity: slot.humidity, temperature: { mode }, options: slot.options };
}
