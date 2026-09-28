/**
 * The slot a test runs a declaration from: the model's own declared defaults,
 * options included, in the default entry modes, so every test that shares it
 * runs a declaration on the numbers the app would start it on.
 */
import { humidityMode, temperatureMode } from "./entryModes";
import type { SlotInputs } from "./libraryInputs";
import type { RegisteredModel } from "./modelDeclaration";
import type { Quantity } from "./quantities";

export function defaultSlot(model: RegisteredModel): SlotInputs {
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
