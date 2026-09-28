/**
 * What a slot holds; the functions that read what the person entered, enter
 * values, convert the temperature entry mode and seed a model's defaults; and
 * the get-or-throw they read through. Turning a slot into the library's params
 * is `core/libraryInputs.ts`'s and adjusting it to bounds `core/modelSwitch.ts`'s;
 * both depend on this module, and this module on neither.
 */
import { t_o } from "jsthermalcomfort";
import { humidityMode, temperatureMode, underTemperatureMode, type HumidityMode, type TemperatureMode } from "./entryModes";
import { hasTemperatureGroup, type OptionSpec, type RegisteredModel } from "./modelDeclaration";
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
export function expandOperative(values: Map<Quantity, number>): void {
  const operative = requireValue(values, q.operative_tmp);
  values.set(q.tdb, operative);
  values.set(q.tr, operative);
  values.delete(q.operative_tmp);
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
 * a model that has no temperature entry group. `resolveQuantities`'s
 * expansion (`core/libraryInputs.ts`) is a different act — it stands the
 * operative entry in for the two temperatures of one library call and changes
 * no entry mode.
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

/**
 * Every input the new model declares that the slot has no value for starts at
 * the declaration's own default; what the slot already holds is kept, whatever
 * model put it there. A temperature input is sought under the slot's own entry
 * mode, so an operative entry answers for the dry-bulb one it stands in for.
 *
 * A humidity input is never missing — a slot carries a humidity entry in some
 * representation at all times — and the defaults are applied through
 * `withEnteredValues`, which puts humidity where the slot keeps it, so no
 * default can land among the values `rh` is excluded from (ADR §4.5).
 *
 * Options are seeded the same way: an option the new model declares and the
 * slot has no value for starts at its default, and every other is kept
 * (ADR-0002 decision 36). The gate never sees them — an option has no range.
 */
export function seedDeclaredDefaults(slot: SlotInputs, model: RegisteredModel): SlotInputs {
  const defaults = new Map<Quantity, number>();
  for (const { quantity, value } of model.inputs) {
    const held = underTemperatureMode(quantity, slot.temperature.mode);
    // Two declared temperatures stand in one operative entry, so the first of
    // them — the entry mode's own axis — is the one whose default applies.
    if (enteredValue(slot, held, model) === undefined && !defaults.has(held)) {
      defaults.set(held, value);
    }
  }
  const options = new Map(slot.options);
  for (const option of model.options) {
    if (!options.has(option)) {
      options.set(option, option.default);
    }
  }
  // Always a copy, empty defaults included: what comes back is the plain shape
  // decision 32 rehearses on, never the caller's own slot under another name.
  return { ...withEnteredValues(slot, defaults), options };
}
