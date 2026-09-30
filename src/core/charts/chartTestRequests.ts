/**
 * The chart request a test draws: one slot, badged as slot 1, at the default
 * atmospheric pressure, so every builder test asks as a session whose Compare
 * is off asks; or several, badged by position, as a session comparing them
 * asks.
 */
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { DEFAULT_ATMOSPHERIC_PRESSURE } from "$lib/core/quantities";
import type { Slot } from "$lib/core/slot";
import { slotBadges } from "$lib/core/slotBadge";
import { unitSystem, type UnitSystem } from "$lib/core/unitSystem";
import type { ChartRequest } from "./chartRequest";

/** `model`'s chart of `slot` alone, as slot 1, in `system`. */
export function chartRequestFor(model: RegisteredModel, slot: Slot, system: UnitSystem = unitSystem.si): ChartRequest {
  return chartRequestForSlots(model, [slot], system);
}

/** `model`'s chart of `slots`, the first as slot 1 and each after it as the next position, in `system`. */
export function chartRequestForSlots(
  model: RegisteredModel,
  slots: readonly Slot[],
  system: UnitSystem = unitSystem.si,
): ChartRequest {
  return {
    model,
    slots: slots.map((slot, position) => ({ ...slotBadges[position], slot })),
    unitSystem: system,
    atmosphericPressure: DEFAULT_ATMOSPHERIC_PRESSURE,
  };
}
