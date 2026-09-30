/**
 * The chart request a test draws: one slot, badged as slot 1, at the default
 * atmospheric pressure, so every builder test asks as a session whose Compare
 * is off asks.
 */
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { DEFAULT_ATMOSPHERIC_PRESSURE } from "$lib/core/quantities";
import type { Slot } from "$lib/core/slot";
import { slotBadges } from "$lib/core/slotBadge";
import { unitSystem, type UnitSystem } from "$lib/core/unitSystem";
import type { ChartRequest } from "./chartRequest";

/** `model`'s chart of `slot` alone, as slot 1, in `system`. */
export function chartRequestFor(model: RegisteredModel, slot: Slot, system: UnitSystem = unitSystem.si): ChartRequest {
  return {
    model,
    slots: [{ ...slotBadges[0], slot }],
    unitSystem: system,
    atmosphericPressure: DEFAULT_ATMOSPHERIC_PRESSURE,
  };
}
