/**
 * The slot a test runs a declaration from: the model's own declared defaults,
 * options included, in the default entry modes, so every test that shares it
 * runs a declaration on the numbers the app would start it on. A test that
 * needs other numbers enters them over those defaults.
 */
import { humidityMode, temperatureMode } from "./entryModes";
import type { RegisteredModel } from "./modelDeclaration";
import { quantities, type Quantity } from "./quantities";
import type { Slot } from "./slot";

export function defaultSlot(model: RegisteredModel): Slot {
  const values = new Map<Quantity, number>();
  let humidity = { mode: humidityMode.rh, value: 0 };
  for (const { quantity, value } of model.inputs) {
    if (quantity === humidityMode.rh.quantity) {
      humidity = { mode: humidityMode.rh, value };
    } else {
      values.set(quantity, value);
    }
  }
  const options = new Map(model.options.map((option) => [option, option.default]));
  return { values, humidity, temperature: { mode: temperatureMode.separate }, options };
}

/** A humidity mode's quantity, which the slot holds as its humidity entry rather than among its values. */
type HumidityKey = (typeof humidityMode)[keyof typeof humidityMode]["quantity"]["key"];

/**
 * `model`'s default slot with `entered` over its values. Entering
 * `operative_tmp` puts the slot under operative entry, where it stands in for
 * the separate temperatures, as the input panel shows it. The humidity entry
 * is not among the values, so it cannot be entered here.
 */
export function enteredSlotFor(
  model: RegisteredModel,
  entered: Partial<Record<Exclude<keyof typeof quantities, HumidityKey>, number>>,
): Slot {
  const slot = defaultSlot(model);
  const values = new Map(slot.values);
  const mode = entered.operative_tmp === undefined ? temperatureMode.separate : temperatureMode.operative;
  if (mode === temperatureMode.operative) {
    for (const quantity of temperatureMode.separate.panel) {
      values.delete(quantity);
    }
  }
  for (const [key, value] of Object.entries(entered)) {
    if (value !== undefined) {
      values.set(quantities[key as keyof typeof quantities], value);
    }
  }
  return { ...slot, values, temperature: { mode } };
}
