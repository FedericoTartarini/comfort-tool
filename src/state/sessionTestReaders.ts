/**
 * How the session tests read a session's state: a slot as plain data, a slot
 * the session is known to hold, a value the result table would show, and what
 * a pending switch lists; and the session comparing all three slots and the
 * bounded model they start from. Shared by the state tests so that all of them
 * compare the same way.
 */
import type { Bound, OutOfRangeRow } from "$lib/core/applicability";
import type { ModelResult, RegisteredModel } from "$lib/core/modelDeclaration";
import { resultValue } from "$lib/core/modelRun";
import type { Quantity } from "$lib/core/quantities";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Session, type InputSlot, type SlotPosition } from "./session.svelte";

/** Everything a slot holds, as plain data a comparison can be made against. */
export function shapeOf(slot: InputSlot) {
  return {
    values: new Map(slot.values),
    humidity: slot.humidity,
    temperature: slot.temperature,
    airSpeed: slot.airSpeed,
    clothing: slot.clothing,
    options: new Map(slot.options),
  };
}

/** The slot at `position`, or a throw for a slot never enabled, which holds nothing. */
export function heldSlot(session: Session, position: SlotPosition): InputSlot {
  const slot = session.slots[position];
  if (!slot) {
    throw new Error(`Slot ${position + 1} holds nothing`);
  }
  return slot;
}

/** A session on `model` with Compare on and all three slots enabled, each holding what slot 1 started with. */
export function sessionComparingThreeSlots(model: RegisteredModel): Session {
  const session = new Session(model);
  session.setCompare(true);
  session.setSlotEnabled(2, true);
  return session;
}

/** A value the result table would show, read through the app's own accessor. */
export function resultValueOf(result: ModelResult | null, quantity: Quantity) {
  return result === null ? undefined : resultValue(result, quantity);
}

/**
 * The rows the pending question lists for the slot at `position` (slot 1 by
 * default): none for a slot it does not list, and `undefined` while no
 * question is held.
 */
export function listedRowsOf(session: Session, position: SlotPosition = 0): readonly OutOfRangeRow[] | undefined {
  const pending = session.pendingSwitch;
  return pending ? (pending.slots.find((slot) => slot.position === position)?.listedRows ?? []) : undefined;
}

/**
 * `pmvPpdIso` with some of its applicability bounds replaced, keyed as
 * `info.inputs` keys them. Everything else about the model is the registered
 * one's, because the bounds are the only thing the tests using it are about.
 */
export function withBounds(bounds: Readonly<Record<string, Bound>>): RegisteredModel {
  return {
    ...pmvPpdIso,
    info: {
      ...pmvPpdIso.info,
      name: `fixture_bounds_${Object.keys(bounds).join("_")}`,
      inputs: Object.fromEntries(
        Object.entries(pmvPpdIso.info.inputs).map(([key, variable]) => [
          key,
          key in bounds ? { ...variable, applicability: bounds[key] } : variable,
        ]),
      ),
    },
  };
}
