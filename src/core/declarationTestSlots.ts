/**
 * The slot a test enters values over: a model's own starting slot, so every
 * test that shares it runs a declaration on the numbers the app starts it on;
 * and the entry modes a test asks a rule about.
 */
import {
  airSpeedMode,
  clothingMode,
  humidityMode,
  temperatureMode,
  type AirSpeedMode,
  type ClothingMode,
  type TemperatureMode,
} from "./entryModes";
import type { RegisteredModel } from "./modelDeclaration";
import { quantities } from "./quantities";
import { defaultEntryModes, startingSlot, type Slot, type ValueEntryModes } from "./slot";

/** The entry modes of a session that changed none but temperature's, to `mode`. */
export function entryModesWithTemperature(mode: TemperatureMode): ValueEntryModes {
  return { ...defaultEntryModes, temperature: { mode } };
}

/** The entry modes of a session that changed none but air speed's, to `mode`. */
export function entryModesWithAirSpeed(mode: AirSpeedMode): ValueEntryModes {
  return { ...defaultEntryModes, airSpeed: { mode } };
}

/** The entry modes of a session that changed none but clothing's, to `mode`. */
export function entryModesWithClothing(mode: ClothingMode): ValueEntryModes {
  return { ...defaultEntryModes, clothing: { mode } };
}

/** A humidity mode's quantity, which the slot holds as its humidity entry rather than among its values. */
type HumidityKey = (typeof humidityMode)[keyof typeof humidityMode]["quantity"]["key"];

/**
 * `model`'s starting slot with `entered` over its values. Entering
 * `operative_tmp` puts the slot under operative entry, where it stands in for
 * the separate temperatures, as the input panel shows it, and entering `vr`
 * under relative air speed entry, where it stands in for the air speed, and
 * entering `clo_dynamic` under dynamic clothing entry, likewise. The
 * humidity entry is not among the values, so it cannot be entered here.
 */
export function enteredSlotFor(
  model: RegisteredModel,
  entered: Partial<Record<Exclude<keyof typeof quantities, HumidityKey>, number>>,
): Slot {
  const slot = startingSlot(model);
  const values = new Map(slot.values);
  const mode = entered.operative_tmp === undefined ? temperatureMode.separate : temperatureMode.operative;
  if (mode === temperatureMode.operative) {
    for (const quantity of temperatureMode.separate.panel) {
      values.delete(quantity);
    }
  }
  const airSpeedEntry = entered.vr === undefined ? airSpeedMode.uncorrected : airSpeedMode.corrected;
  if (airSpeedEntry === airSpeedMode.corrected) {
    values.delete(quantities.v);
  }
  const clothingEntry = entered.clo_dynamic === undefined ? clothingMode.uncorrected : clothingMode.corrected;
  if (clothingEntry === clothingMode.corrected) {
    values.delete(quantities.clo);
  }
  for (const [key, value] of Object.entries(entered)) {
    if (value !== undefined) {
      values.set(quantities[key as keyof typeof quantities], value);
    }
  }
  return { ...slot, values, temperature: { mode }, airSpeed: { mode: airSpeedEntry }, clothing: { mode: clothingEntry } };
}
