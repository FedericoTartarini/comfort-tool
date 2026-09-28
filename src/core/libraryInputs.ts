import { t_o, v_relative } from "jsthermalcomfort";
import { humidityMode, temperatureMode, type HumidityMode, type TemperatureMode } from "./entryModes";
import {
  hasHumidityGroup,
  hasTemperatureGroup,
  type OptionSpec,
  type OptionsReader,
  type RegisteredModel,
  type Values,
} from "./modelDeclaration";
import { quantities, type Quantity } from "./quantities";

/**
 * The slice of an input slot that core reads. A plain interface, so core/
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
 * operative entry, ADR §4.5). The one place the mode's conversion to relative
 * humidity is invoked.
 */
export function relativeHumidityOf(slot: SlotInputs): number {
  return slot.humidity.mode.toRelativeHumidity(slot.humidity.value, resolvedTdb(slot));
}

/**
 * The slot's operative temperature: the entry itself under operative entry,
 * else the library's `t_o(tdb, tr, v, model.standard)`, weighed by the model's
 * own standard, or by the library's default for a model that declares none.
 * How a chart locked on an operative axis marks a slot in separate entry
 * (ADR-0002 decision 37), and the value the switch into operative entry
 * stores ({@link withTemperatureMode}, decision 39), so the click does not
 * move the marker. The one place the app calls `t_o`.
 *
 * Off the deployed chart's marker, the plain mean `(tdb + tr) / 2`, whenever
 * `tdb ≠ tr`, except under ASHRAE 55 below 0.2 m/s and under ISO 7726 at
 * exactly 0.1 m/s, where the library's weighting is one half.
 */
export function operativeTemperatureOf(slot: SlotInputs, model: RegisteredModel): number {
  if (slot.temperature.mode === temperatureMode.operative) {
    return requireValue(slot.values, q.operative_tmp);
  }
  // `t_o` names fewer standards than a model may pin (not ISO 7933), and
  // throws on one it does not; the cast leaves that call to the library.
  const standard = model.standard as Parameters<typeof t_o>[3];
  return t_o(requireValue(slot.values, q.tdb), requireValue(slot.values, q.tr), requireValue(slot.values, q.v), standard);
}

/**
 * Writes the operative entry into `tdb` and `tr` and removes `operative_tmp`,
 * in place. An entry convention, not an equation (ADR-0002 decision 21).
 */
function expandOperative(values: Map<Quantity, number>): void {
  const operative = requireValue(values, q.operative_tmp);
  values.set(q.tdb, operative);
  values.set(q.tr, operative);
  values.delete(q.operative_tmp);
}

/**
 * Entry-group representations → the SI quantities the library model takes
 * (ADR §4.5): operative temperature expands to `tdb = tr = operative_tmp`, the
 * humidity entry becomes `rh`, and `v` becomes `vr` when the model asks for it.
 */
export function resolveQuantities(slot: SlotInputs, model: RegisteredModel): Map<Quantity, number> {
  const resolved = new Map(slot.values);

  if (hasTemperatureGroup(model) && slot.temperature.mode === temperatureMode.operative) {
    expandOperative(resolved);
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
 * The values a declaration reads for `slot`, in `run` and in a polygons
 * chart's `zones`: its resolved quantities, wrapped by {@link valuesReader}.
 * On the `run` side, the declaration hardcodes
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
 * The quantities the user actually types, in panel order: the model's inputs
 * with its temperature rows replaced by the current mode's. The input panel
 * lays these out, humidity as entered ({@link panelQuantities}), and the
 * dynamic chart offers them as axes. A model without the temperature entry
 * group has no rows to replace: its inputs, in any mode.
 */
export function enteredQuantities(model: RegisteredModel, mode: TemperatureMode): Quantity[] {
  if (!hasTemperatureGroup(model)) {
    return model.inputs.map(({ quantity }) => quantity);
  }
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
 * The rows the input panel lists for `slot`: {@link enteredQuantities} under
 * the slot's temperature mode, with the slot's humidity entry in `rh`'s place.
 * Only the panel swaps humidity; the dynamic chart's axes keep the library's
 * `rh`.
 */
export function panelQuantities(model: RegisteredModel, slot: SlotInputs): Quantity[] {
  return enteredQuantities(model, slot.temperature.mode).map((quantity) =>
    quantity === q.rh ? slot.humidity.mode.quantity : quantity,
  );
}

/**
 * What the user entered for `quantity`, humidity included. `rh` is answered
 * in every mode — the dynamic chart sweeps and marks the library's `rh`, not
 * the entered representation — and so is `operative_tmp`, which a chart with
 * locked axes marks under separate entry too, at `model`'s
 * {@link operativeTemperatureOf}.
 */
export function enteredValue(slot: SlotInputs, quantity: Quantity, model: RegisteredModel): number | undefined {
  if (quantity === slot.humidity.mode.quantity) {
    return slot.humidity.value;
  }
  if (quantity === q.rh) {
    return relativeHumidityOf(slot);
  }
  if (quantity === q.operative_tmp) {
    return operativeTemperatureOf(slot, model);
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
 * operative stores {@link operativeTemperatureOf}'s answer, the library's `t_o`
 * by the model's own standard as pythermalcomfort's models weigh it (ADR-0002
 * decision 39), so the slot lands where the chart marked it; operative →
 * separate sets `tdb = tr = operative_tmp`. Lossy and one-way, and the one
 * removal the bag ever suffers: the two representations never coexist. The
 * deployed tool converts nothing here — its checkbox copies the air
 * temperature into mean radiant.
 *
 * The one statement of the conversion a slot undergoes: the entry-mode buttons
 * apply it through the slot they own, and `core/modelSwitch.ts` applies it for
 * a model that has no temperature entry group. {@link resolveQuantities}'s
 * expansion is a different act — it stands the operative entry in for the two
 * temperatures of one library call and changes no entry mode.
 */
export function withTemperatureMode(slot: SlotInputs, mode: TemperatureMode, model: RegisteredModel): SlotInputs {
  if (mode === slot.temperature.mode) {
    return slot;
  }
  const values = new Map(slot.values);
  if (mode === temperatureMode.operative) {
    values.set(q.operative_tmp, operativeTemperatureOf(slot, model));
    values.delete(q.tdb);
    values.delete(q.tr);
  } else {
    expandOperative(values);
  }
  return { values, humidity: slot.humidity, temperature: { mode }, options: slot.options };
}
