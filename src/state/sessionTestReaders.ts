/**
 * How the session tests read a session's state: a slot as plain data, a slot
 * the session is known to hold, a value the result table would show, and what
 * a pending switch lists; the session comparing all three slots and the
 * bounded model they start from; the check of the invariant the session's
 * entry modes rest on; and what a page would open on, the address a session
 * is on, and the texts a tab keeps and a link carries of it. Shared by the
 * state tests so that all of them compare the same way.
 */
import { expect } from "vitest";
import type { Bound, OutOfRangeRow } from "$lib/core/applicability";
import type { ModelResult, RegisteredModel } from "$lib/core/modelDeclaration";
import { resultValue } from "$lib/core/modelRun";
import type { Address } from "$lib/core/page";
import type { Quantity } from "$lib/core/quantities";
import { narrowedToPage, toText } from "$lib/core/shareLink";
import { entryModesOf } from "$lib/core/slot";
import type { WrittenSession } from "$lib/core/writtenSession";
import { registeredModels } from "$lib/models";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Session, type InputSlot, type SlotPosition } from "./session.svelte";

/** Everything a slot holds, as plain data a comparison can be made against. */
export function shapeOf(slot: InputSlot) {
  return slot.toSlot();
}

/** The slot at `position`, or a throw for a slot never enabled, which holds nothing. */
export function heldSlot(session: Session, position: SlotPosition): InputSlot {
  const slot = session.slots[position];
  if (!slot) {
    throw new Error(`Slot ${position + 1} holds nothing`);
  }
  return slot;
}

/**
 * Every slot of `session` that holds values is in slot 1's entry modes,
 * humidity's included: the invariant ADR-0002 decision 51's amendment names,
 * which the session's readers of the entry modes rest on.
 */
export function expectEverySlotInSessionEntryModes(session: Session): void {
  const held = session.slots.filter((slot) => slot !== null);
  expect(held.map(entryModesOf)).toEqual(held.map(() => session.entryModes));
  expect(held.map((slot) => slot.humidity?.mode)).toEqual(held.map(() => session.humidityMode));
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

/** What the page would open on: the session written out, the page it is on, and the question it holds. */
export function openedOn(session: Session) {
  return { written: session.toWrittenSession(), page: session.page, pendingSwitch: session.pendingSwitch };
}

/** The address `session` is on. */
export function addressOf(session: Session): Address {
  return { page: session.page, model: session.model };
}

/** `session` as the tab would keep it. */
export function keptTextOf(session: Session): string {
  return toText(session.toWrittenSession(), registeredModels);
}

/** The narrowed session a link copied from `session` on its page carries. */
export function linkSessionOf(session: Session): WrittenSession {
  return narrowedToPage(session.toWrittenSession(), session.page);
}
