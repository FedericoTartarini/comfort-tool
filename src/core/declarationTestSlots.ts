/**
 * A slot the registry-wide declaration tests start from: the model's own
 * declared defaults, options included, in the default entry modes. Shared by
 * `modelDeclarationCall.test.ts` and `modelDeclarationRun.test.ts`, so both
 * run every declaration on the numbers the app would start it on.
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
