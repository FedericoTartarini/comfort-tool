/**
 * How the session tests read a session's state: a slot as plain data, a slot
 * the session is known to hold, and a value the result table would show; and
 * the session comparing all three slots they start from. Shared by the state
 * tests so that all of them compare the same way.
 */
import type { ModelResult, RegisteredModel } from "$lib/core/modelDeclaration";
import { resultValue } from "$lib/core/modelRun";
import type { Quantity } from "$lib/core/quantities";
import { Session, type InputSlot, type SlotPosition } from "./session.svelte";

/** Everything a slot holds, as plain data a comparison can be made against. */
export function shapeOf(slot: InputSlot) {
  return {
    values: new Map(slot.values),
    humidity: slot.humidity,
    temperature: slot.temperature,
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

/** What slots 2 and 3 hold, as plain data: both must hold values. */
export function otherSlotsOf(session: Session) {
  return [shapeOf(heldSlot(session, 1)), shapeOf(heldSlot(session, 2))];
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
