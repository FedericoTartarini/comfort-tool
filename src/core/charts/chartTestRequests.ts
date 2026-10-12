/**
 * The chart request a test draws: one slot, unnamed, at the default
 * atmospheric pressure and in its own entry modes, so every builder test asks
 * as a session whose Compare is off asks; or a list of slots, each named by
 * its position, as a session comparing them asks, one slot being a session
 * with Compare on and slots 2 and 3 disabled. Either paints Comfort zones, as
 * the Standard page asks; a test of Bands hands its own list.
 */
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { DEFAULT_ATMOSPHERIC_PRESSURE } from "$lib/core/quantities";
import { entryModesOf, type Slot, type ValueEntryModes } from "$lib/core/slot";
import { slotBadge } from "$lib/core/slotBadge";
import { unitSystem, type UnitSystem } from "$lib/core/unitSystem";
import type { SlotPosition } from "$lib/core/writtenSession";
import type { ChartedSlot, ChartRequest } from "./chartRequest";

/** `model`'s chart of `slot` alone, as slot 1 unnamed, in `system` and in the session's entry modes `modes`, by default its own. */
export function chartRequestFor(
  model: RegisteredModel,
  slot: Slot,
  system: UnitSystem = unitSystem.si,
  modes: ValueEntryModes = entryModesOf(slot),
): ChartRequest {
  return requestOf(model, [{ ...slotBadge(0, false), slot }], system, modes);
}

/**
 * `model`'s chart of `slots`, the first as slot 1 and each after it as the
 * next position, each named by it, in `system`, and in the session's entry
 * modes `modes`: by default the first slot's, as a session whose gates are
 * open holds every slot in them.
 */
export function chartRequestForSlots(
  model: RegisteredModel,
  slots: readonly Slot[],
  system: UnitSystem = unitSystem.si,
  modes: ValueEntryModes = entryModesOf(slots[0]),
): ChartRequest {
  const charted = slots.map((slot, position) => ({ ...slotBadge(position as SlotPosition, true), slot }));
  return requestOf(model, charted, system, modes);
}

function requestOf(model: RegisteredModel, slots: readonly ChartedSlot[], system: UnitSystem, modes: ValueEntryModes): ChartRequest {
  return { model, slots, unitSystem: system, entryModes: modes, atmosphericPressure: DEFAULT_ATMOSPHERIC_PRESSURE, bands: null };
}
