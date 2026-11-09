/**
 * How the session tests read a session's state: a slot as plain data, a slot
 * the session is known to hold, a value the result table would show, what
 * a pending switch lists, and every entry out of range; how far a slot stands
 * from slot 1, and how far a slot first enabled is moved from it; the session comparing all three slots and the
 * bounded model they start from; a Band list edited as the Bands dialog edits it; the check of the invariant the session's
 * entry modes rest on; and what a page would open on, the address a session
 * is on, and the texts a tab keeps and a link carries of it. Shared by the
 * state tests so that all of them compare the same way.
 */
import type { ModelOutputs } from "jsthermalcomfort";
import { expect } from "vitest";
import { outOfRangeRows, type Bound, type OutOfRangeRow } from "$lib/core/applicability";
import type { ModelDeclaration } from "$lib/core/modelDeclaration";
import { outputValue } from "$lib/core/modelRun";
import type { Address } from "$lib/core/page";
import { quantities, type Quantity } from "$lib/core/quantities";
import { narrowedToPage, toText } from "$lib/core/shareLink";
import { entryModesOf } from "$lib/core/slot";
import type { WrittenSession } from "$lib/core/writtenSession";
import { registeredModels } from "$lib/models";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import type { BandListDraft } from "./bandListDraft.svelte";
import { Session, type InputSlot, type SlotPosition } from "./session.svelte";

const q = quantities;

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

/** Every entry out of range in every slot `session` holds, as the gate reads it. */
export function outOfRangeRowsOf(session: Session): OutOfRangeRow[] {
  return session.slots.flatMap((slot) => (slot ? outOfRangeRows(slot, session.model, session.atmosphericPressure) : []));
}

/** The quantities out of range in the slot at `position`, as the gate reads them; none where the slot holds nothing. */
export function outOfRangeQuantitiesAt(session: Session, position: SlotPosition): Quantity[] {
  const slot = session.slots[position];
  return slot ? outOfRangeRows(slot, session.model, session.atmosphericPressure).map((row) => row.quantity) : [];
}

/**
 * How far the slot at `position` stands from slot 1: each value it holds that
 * slot 1 holds another of, as its difference from slot 1's. Asserts first
 * that the two slots hold the same quantities, the same humidity, entry modes
 * and options, so a difference is a value's alone.
 */
export function differenceFromSlot1(session: Session, position: SlotPosition): Map<Quantity, number> {
  const first = shapeOf(session.slots[0]);
  const slot = shapeOf(heldSlot(session, position));
  expect({ ...slot, values: [...slot.values.keys()] }).toEqual({ ...first, values: [...first.values.keys()] });
  return new Map(
    [...slot.values].flatMap(([quantity, value]): [Quantity, number][] => {
      const difference = value - (first.values.get(quantity) ?? Number.NaN);
      return difference === 0 ? [] : [[quantity, difference]];
    }),
  );
}

/** `differences`, each matched at the two decimals a row shows, as {@link differenceFromSlot1} is compared against. */
export function shownDifferences(...differences: readonly [Quantity, number][]): Map<Quantity, unknown> {
  return new Map(differences.map(([quantity, difference]) => [quantity, expect.closeTo(difference, 2)]));
}

/**
 * The Slot offset per position of each value a slot holds at `model`'s
 * defaults, in the separate, air speed and clothing insulation entry modes:
 * one twentieth of the quantity's axis range, written by hand from each model
 * file's axis ranges and, where it declares none, its library applicability
 * bound. Slot 2 first enabled is moved by it once, slot 3 twice (GLOSSARY.md,
 * **Slot offset**).
 */
const slotOffsetPerPositionAtDefaults = new Map<ModelDeclaration, readonly [Quantity, number][]>([
  [pmvPpdAshrae, [[q.tdb, 1.5], [q.tr, 1.5], [q.v, 0.1], [q.met, 0.15], [q.clo, 0.11]]],
  [pmvPpdIso, [[q.tdb, 1], [q.tr, 1.5], [q.v, 0.05], [q.met, 0.16], [q.clo, 0.2]]],
  [adaptiveAshrae, [[q.tdb, 1.5], [q.tr, 1.5], [q.t_running_mean, 1.175], [q.v, 0.1]]],
]);

/**
 * How far the slot at `position`, first enabled, stands from slot 1 at
 * `model`'s defaults, as {@link differenceFromSlot1} is compared against;
 * `except` names the quantities the move leaves where slot 1 has them, as a
 * cut to a bound does.
 */
export function slotOffsetAtDefaults(model: ModelDeclaration, position: number, except: readonly Quantity[] = []): Map<Quantity, unknown> {
  const perPosition = slotOffsetPerPositionAtDefaults.get(model);
  if (!perPosition) {
    throw new Error(`no Slot offset is written for ${model.info.label}`);
  }
  return shownDifferences(
    ...perPosition.flatMap(([quantity, offsetPerPosition]): [Quantity, number][] =>
      except.includes(quantity) ? [] : [[quantity, offsetPerPosition * position]],
    ),
  );
}

/**
 * Slot 1's values entered in every other slot `session` holds, as the input
 * panel enters a value, so slots a Slot offset moved apart hold alike again:
 * for a test whose slots need only start alike, and whose subject is not how
 * a slot starts. Returns `session`.
 */
export function enterSlot1ValuesInOthers(session: Session): Session {
  const [first, ...others] = session.slots;
  for (const slot of others) {
    for (const [quantity, value] of first.values) {
      slot?.setEntered(quantity, value);
    }
  }
  return session;
}

/** A session on `model` with Compare on and all three slots enabled, each started from slot 1 moved by its Slot offset. */
export function sessionComparingThreeSlots(model: ModelDeclaration): Session {
  const session = new Session(model);
  session.setCompare(true);
  session.setSlotEnabled(2, true);
  return session;
}

/** A draft of `session`'s Band list, as the Bands dialog opens one, or a throw for a model that scans nothing. */
export function bandsDraftOf(session: Session): BandListDraft {
  const draft = session.chart.draftBands();
  if (!draft) {
    throw new Error("the model scans nothing, so it has no Band list to edit");
  }
  return draft;
}

/** `session`'s Band list edited by `edit` on a draft and applied, as the Bands dialog's Apply applies it. */
export function editBands(session: Session, edit: (draft: BandListDraft) => void): void {
  const draft = bandsDraftOf(session);
  edit(draft);
  draft.apply();
}

/** A value the result table would show, read through the app's own accessor. */
export function outputValueOf(outputs: ModelOutputs | null, quantity: Quantity) {
  return outputs === null ? undefined : outputValue(outputs, quantity);
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
export function withBounds(bounds: Readonly<Record<string, Bound>>): ModelDeclaration {
  return {
    ...pmvPpdIso,
    info: {
      ...pmvPpdIso.info,
      name: `fixture_bounds_${Object.keys(bounds).join("_")}`,
      inputs: Object.fromEntries(
        Object.entries(pmvPpdIso.info.inputs).map(([key, field]) => [
          key,
          key in bounds ? { ...field, applicability: bounds[key] } : field,
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

/** The link from `session` with slot 1's metabolic rate taken out, as a cut or a hand edit would leave it. */
export function lackingLinkTextOf(session: Session): string {
  const written = linkSessionOf(session);
  const [first, ...others] = written.slots;
  const lacking = { ...first, values: new Map([...first.values].filter(([quantity]) => quantity !== quantities.met)) };
  return toText({ ...written, slots: [lacking, ...others] }, registeredModels);
}
