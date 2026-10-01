/**
 * The chart request a test draws: one slot, badged as slot 1, at the default
 * atmospheric pressure and in its own entry modes, so every builder
 * test asks as a session whose Compare is off asks; or several, badged by
 * position, as a session comparing them asks. Either paints Comfort zones, as
 * the Standard page asks; a test of Bands hands its own list.
 */
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { DEFAULT_ATMOSPHERIC_PRESSURE } from "$lib/core/quantities";
import { entryModesOf, type Slot, type ValueEntryModes } from "$lib/core/slot";
import { slotBadges } from "$lib/core/slotBadge";
import { unitSystem, type UnitSystem } from "$lib/core/unitSystem";
import type { ChartRequest } from "./chartRequest";

/** `model`'s chart of `slot` alone, as slot 1, in `system`. */
export function chartRequestFor(model: RegisteredModel, slot: Slot, system: UnitSystem = unitSystem.si): ChartRequest {
  return chartRequestForSlots(model, [slot], system);
}

/**
 * `model`'s chart of `slots`, the first as slot 1 and each after it as the
 * next position, in `system`, and in the session's entry modes `modes`: by
 * default the first slot's, as a session whose gates are open holds every
 * slot in them.
 */
export function chartRequestForSlots(
  model: RegisteredModel,
  slots: readonly Slot[],
  system: UnitSystem = unitSystem.si,
  modes: ValueEntryModes = entryModesOf(slots[0]),
): ChartRequest {
  return {
    model,
    slots: slots.map((slot, position) => ({ ...slotBadges[position], slot })),
    unitSystem: system,
    entryModes: modes,
    atmosphericPressure: DEFAULT_ATMOSPHERIC_PRESSURE,
    bands: null,
  };
}
