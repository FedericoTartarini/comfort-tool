/**
 * A model switch while Compare is on (ADR-0002 decision 52): every slot that
 * holds values is rehearsed, the question lists every held slot's rows,
 * grouped by slot in slot order, and one answer lands the model with every
 * slot or leaves them all. Asserted at the seam the other session tests use —
 * a session in, its state and its outputs out, with no component and no
 * router — and nothing flushes, for the reason `compute.svelte.test.ts` gives.
 *
 * A slot's expected rows and landed values are those of a session holding that
 * slot alone, so no number here is written by hand.
 */
import { describe, expect, it } from "vitest";
import { humidityMode, temperatureMode } from "$lib/core/entryModes";
import { inputsOf, type RegisteredModel } from "$lib/core/modelDeclaration";
import { page } from "$lib/core/page";
import { quantities, type Quantity } from "$lib/core/quantities";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Outputs } from "./compute.svelte";
import { Session, slotPositions, type SlotPosition } from "./session.svelte";
import { heldSlot, listedRowsOf, sessionComparingThreeSlots, shapeOf, withBounds } from "./sessionTestReaders";

const q = quantities;

/**
 * PMV (ISO 7730) bounded to 10–20 °C dry-bulb and 1.1 met at least, and taking
 * the external work PMV (ISO 7730) does not, so a slot the switch seeded is
 * one that holds it.
 */
const coolerAndTakesWork = {
  ...withBounds({ tdb: { min: 10, max: 20 }, met: { min: 1.1 } }),
  inputs: [...pmvPpdIso.inputs, { quantity: q.wme, value: 0.4 }],
} satisfies RegisteredModel;

/** A dry-bulb temperature, [°C], and a metabolic rate, [met], {@link coolerAndTakesWork} accepts. */
const accepted = new Map<Quantity, number>([
  [q.tdb, 18],
  [q.met, 1.2],
]);

/** What the slots start with, and the positions in `breaking` breaking {@link coolerAndTakesWork}. */
function entriesBreaking(breaking: readonly SlotPosition[]): ReadonlyMap<Quantity, number>[] {
  return slotPositions.map((position) =>
    breaking.includes(position)
      ? new Map<Quantity, number>([
          [q.tdb, 24 + position],
          // Inside PMV (ISO 7730)'s own 0.8 met at every position.
          [q.met, 1.2 - position * 0.15],
        ])
      : accepted,
  );
}

/** A session on PMV (ISO 7730) comparing three slots, each entered with its own entries. */
function comparingSlotsEntered(entries: readonly ReadonlyMap<Quantity, number>[]): Session {
  const session = sessionComparingThreeSlots(pmvPpdIso);
  slotPositions.forEach((position) => {
    for (const [quantity, value] of entries[position]) {
      heldSlot(session, position).setEntered(quantity, value);
    }
  });
  return session;
}

/** A session on PMV (ISO 7730) holding only a slot entered with `entries`. */
function sessionAlone(entries: ReadonlyMap<Quantity, number>): Session {
  const session = new Session(pmvPpdIso);
  for (const [quantity, value] of entries) {
    session.slots[0].setEntered(quantity, value);
  }
  return session;
}

/** The positions the pending question lists, in the order it lists them. */
function listedPositions(session: Session): SlotPosition[] | undefined {
  return session.pendingSwitch?.slots.filter((slot) => slot.listedRows.length > 0).map((slot) => slot.position);
}

describe("Session.requestModel while Compare is on", () => {
  it("holds a question whose rows are slot 2's when slot 2 alone breaks the model, and changes nothing", () => {
    const session = comparingSlotsEntered(entriesBreaking([1]));
    const before = slotPositions.map((position) => shapeOf(heldSlot(session, position)));

    session.requestModel(coolerAndTakesWork);

    expect(listedPositions(session)).toEqual([1]);
    expect(listedRowsOf(session, 1)?.map((row) => row.quantity)).toEqual([q.tdb, q.met]);
    expect(session.model).toBe(pmvPpdIso);
    expect(slotPositions.map((position) => shapeOf(heldSlot(session, position)))).toEqual(before);
  });

  it("lists slots 1 and 3's rows, grouped by slot in slot order, when both break the model", () => {
    const session = comparingSlotsEntered(entriesBreaking([0, 2]));

    session.requestModel(coolerAndTakesWork);

    expect(listedPositions(session)).toEqual([0, 2]);
    expect(listedRowsOf(session, 0)?.map((row) => row.quantity)).toEqual([q.tdb]);
    expect(listedRowsOf(session, 2)?.map((row) => row.quantity)).toEqual([q.tdb, q.met]);
  });

  it("lists for each slot the rows a session holding that slot alone is asked about", () => {
    const entries = entriesBreaking([0, 1, 2]);
    const session = comparingSlotsEntered(entries);
    session.setHumidityMode(humidityMode.humidityRatio);

    session.requestModel(coolerAndTakesWork);

    slotPositions.forEach((position) => {
      const alone = sessionAlone(entries[position]);
      alone.setHumidityMode(humidityMode.humidityRatio);
      alone.requestModel(coolerAndTakesWork);
      expect(listedRowsOf(session, position)).toEqual(listedRowsOf(alone));
    });
  });

  it("moves every listed value on a yes and nothing else, and lands every slot under the new model", () => {
    const entries = entriesBreaking([0, 2]);
    const session = comparingSlotsEntered(entries);

    session.requestModel(coolerAndTakesWork);
    session.acceptSwitch();

    expect(session.model).toBe(coolerAndTakesWork);
    expect(session.pendingSwitch).toBeNull();
    slotPositions.forEach((position) => {
      const alone = sessionAlone(entries[position]);
      alone.requestModel(coolerAndTakesWork);
      alone.acceptSwitch();
      expect(shapeOf(heldSlot(session, position))).toEqual(shapeOf(alone.slots[0]));
      expect(heldSlot(session, position).values.get(q.wme)).toBe(0.4);
    });
  });

  it("leaves no compared slot with an entry out of range after a yes", () => {
    const session = comparingSlotsEntered(entriesBreaking([0, 1, 2]));
    const outputs = new Outputs(session);
    session.setHumidityMode(humidityMode.humidityRatio);

    session.requestModel(coolerAndTakesWork);
    session.acceptSwitch();

    expect(outputs.atmosphericPressureOutOfRange).toBe(false);
    expect(outputs.slots.map((slot) => slot.outOfRangeQuantities)).toEqual([[], [], []]);
    expect(outputs.slots.map((slot) => slot.notCalculated)).toEqual([false, false, false]);
  });

  it("leaves the model and every slot as they were on a no, entry modes included", () => {
    const session = comparingSlotsEntered(entriesBreaking([0, 1]));
    session.setTemperatureMode(temperatureMode.operative);
    session.setHumidityMode(humidityMode.dewPoint);
    const before = slotPositions.map((position) => shapeOf(heldSlot(session, position)));

    session.requestModel(coolerAndTakesWork);
    session.declineSwitch();

    expect(session.model).toBe(pmvPpdIso);
    expect(session.pendingSwitch).toBeNull();
    expect(slotPositions.map((position) => shapeOf(heldSlot(session, position)))).toEqual(before);
  });

  it("lists a slot that is not compared, and on a yes cuts it as a session holding it alone", () => {
    const entries = entriesBreaking([0, 2]);
    const session = comparingSlotsEntered(entries);
    session.setSlotEnabled(2, false);

    session.requestModel(coolerAndTakesWork);
    expect(listedPositions(session)).toEqual([0, 2]);
    session.acceptSwitch();

    const alone = sessionAlone(entries[2]);
    alone.requestModel(coolerAndTakesWork);
    alone.acceptSwitch();
    expect(shapeOf(heldSlot(session, 2))).toEqual(shapeOf(alone.slots[0]));
    expect(heldSlot(session, 2).values.get(q.wme)).toBe(0.4);
  });

  it("converts a slot that is not compared out of operative entry for a model without the temperature entry group, and cuts it, as a session holding it alone", () => {
    const session = comparingSlotsEntered(entriesBreaking([2]));
    session.setSlotEnabled(2, false);
    session.setTemperatureMode(temperatureMode.operative);

    session.requestModel(heatIndexRothfusz);
    session.acceptSwitch();

    expect(session.model).toBe(heatIndexRothfusz);
    const alone = sessionAlone(entriesBreaking([2])[2]);
    alone.setTemperatureMode(temperatureMode.operative);
    alone.requestModel(heatIndexRothfusz);
    alone.acceptSwitch();
    expect(heldSlot(session, 2).temperature.mode).toBe(temperatureMode.separate);
    expect(shapeOf(heldSlot(session, 2))).toEqual(shapeOf(alone.slots[0]));
  });

  it("leaves a slot never enabled holding nothing, which copies slot 1 when first enabled", () => {
    const session = new Session(pmvPpdIso);
    session.setCompare(true);

    session.requestModel(coolerAndTakesWork);
    session.acceptSwitch();

    expect(session.slots[2]).toBeNull();
    session.setSlotEnabled(2, true);
    expect(shapeOf(heldSlot(session, 2))).toEqual(shapeOf(session.slots[0]));
  });

  it("holds a question about a slot that is not compared when it alone breaks the model, and changes nothing", () => {
    const session = comparingSlotsEntered(entriesBreaking([1]));
    session.setSlotEnabled(1, false);
    const before = slotPositions.map((position) => shapeOf(heldSlot(session, position)));

    session.requestModel(coolerAndTakesWork);

    expect(listedPositions(session)).toEqual([1]);
    expect(session.model).toBe(pmvPpdIso);
    expect(slotPositions.map((position) => shapeOf(heldSlot(session, position)))).toEqual(before);
  });

  it("leaves every compared slot's outputs the current model's while the question is pending", () => {
    const session = comparingSlotsEntered(entriesBreaking([0, 2]));
    const outputs = new Outputs(session);
    const before = outputs.slots.map((slot) => slot.result);

    session.requestModel(coolerAndTakesWork);

    outputs.slots.forEach((slot, index) => expect(slot.result).toBe(before[index]));
    expect(outputs.slots.map((slot) => slot.outOfRangeQuantities)).toEqual([[], [], []]);
  });
});

describe("the model switch while Compare is on, by setting the model or there and back", () => {
  it("lands the model set with every slot converted and seeded, asking nothing and adjusting nothing", () => {
    const entries = entriesBreaking([0, 1, 2]);
    const session = comparingSlotsEntered(entries);
    const outputs = new Outputs(session);
    session.setTemperatureMode(temperatureMode.operative);

    session.setModel(coolerAndTakesWork);

    expect(session.model).toBe(coolerAndTakesWork);
    expect(session.pendingSwitch).toBeNull();
    slotPositions.forEach((position) => {
      const alone = sessionAlone(entries[position]);
      alone.setTemperatureMode(temperatureMode.operative);
      alone.setModel(coolerAndTakesWork);
      expect(shapeOf(heldSlot(session, position))).toEqual(shapeOf(alone.slots[0]));
      expect(heldSlot(session, position).values.get(q.wme)).toBe(0.4);
      expect(outputs.slots[position].outOfRangeQuantities.length).toBeGreaterThan(0);
    });
  });

  it("returns each slot's values for the first model on switching to another and back", () => {
    const session = comparingSlotsEntered(entriesBreaking([1, 2]));
    const before = slotPositions.map((position) => shapeOf(heldSlot(session, position)));

    session.requestModel(adaptiveAshrae);
    expect(session.model).toBe(adaptiveAshrae);
    // Adaptive seeded every slot, so each was under it in between.
    expect(slotPositions.map((position) => heldSlot(session, position).values.has(q.t_running_mean))).toEqual([true, true, true]);
    session.requestModel(pmvPpdIso);

    expect(session.model).toBe(pmvPpdIso);
    slotPositions.forEach((position) => {
      const held = heldSlot(session, position);
      for (const { quantity } of inputsOf(pmvPpdIso)) {
        if (quantity !== q.rh) {
          expect(held.values.get(quantity)).toBe(before[position].values.get(quantity));
        }
      }
      expect(held.humidity).toEqual(before[position].humidity);
    });
  });
});

describe("the model switch asked for on Explore, which compares slot 1 alone (ADR-0002 decision 57)", () => {
  /** Slots 1 and 2 breaking {@link coolerAndTakesWork}, Compare on, the session on Explore. */
  function onExploreBreakingSlots1And2(): Session {
    const session = comparingSlotsEntered(entriesBreaking([0, 1]));
    session.setAddress({ page: page.explore, model: session.model });
    return session;
  }

  it("lists the rows of every slot the session holds, as the same request on the Standard page lists them", () => {
    const session = onExploreBreakingSlots1And2();
    const onStandard = comparingSlotsEntered(entriesBreaking([0, 1]));

    session.requestModel(coolerAndTakesWork);
    onStandard.requestModel(coolerAndTakesWork);

    expect(listedPositions(session)).toEqual([0, 1]);
    expect(session.pendingSwitch?.slots).toEqual(onStandard.pendingSwitch?.slots);
  });

  it("cuts slots 1 and 2 on a yes, each as a session holding it alone", () => {
    const entries = entriesBreaking([0, 1]);
    const session = onExploreBreakingSlots1And2();

    session.requestModel(coolerAndTakesWork);
    session.acceptSwitch();

    expect(session.model).toBe(coolerAndTakesWork);
    slotPositions.forEach((position) => {
      const alone = sessionAlone(entries[position]);
      alone.requestModel(coolerAndTakesWork);
      alone.acceptSwitch();
      expect(shapeOf(heldSlot(session, position))).toEqual(shapeOf(alone.slots[0]));
    });
  });

  it("leaves all three slots on a no", () => {
    const session = onExploreBreakingSlots1And2();
    const before = slotPositions.map((position) => shapeOf(heldSlot(session, position)));

    session.requestModel(coolerAndTakesWork);
    session.declineSwitch();

    expect(session.model).toBe(pmvPpdIso);
    expect(slotPositions.map((position) => shapeOf(heldSlot(session, position)))).toEqual(before);
  });
});

describe("the model switch with a slot held while Compare is off (ADR-0002 decision 84, rule 4)", () => {
  /**
   * A session on PMV (ASHRAE 55) holding slot 2 at 35 °C dry-bulb, past PMV
   * (ISO 7730)'s 30 °C and inside PMV (ASHRAE 55)'s, with Compare off.
   */
  function holdingSlot2PastIso(): Session {
    const session = new Session(pmvPpdAshrae);
    session.setCompare(true);
    heldSlot(session, 1).setEntered(q.tdb, 35);
    session.setCompare(false);
    return session;
  }

  it("lists slot 2's rows among the two slots the session holds, so that the dialog names it by its position", () => {
    const session = holdingSlot2PastIso();

    session.requestModel(pmvPpdIso);

    expect(session.pendingSwitch?.slots.map((slot) => slot.position)).toEqual([0, 1]);
    expect(listedPositions(session)).toEqual([1]);
    expect(listedRowsOf(session, 1)?.map((row) => row.quantity)).toEqual([q.tdb]);
  });

  it("cuts slot 2 on a yes", () => {
    const session = holdingSlot2PastIso();

    session.requestModel(pmvPpdIso);
    const [row] = listedRowsOf(session, 1) ?? [];
    session.acceptSwitch();

    expect(session.model).toBe(pmvPpdIso);
    expect(heldSlot(session, 1).values.get(q.tdb)).toBe(row.bound.max);
    expect(new Outputs(session).slots[0].outOfRangeQuantities).toEqual([]);
    session.setCompare(true);
    expect(new Outputs(session).slots[1].outOfRangeQuantities).toEqual([]);
  });

  it("leaves the model and every slot as they were on a no", () => {
    const session = holdingSlot2PastIso();
    const before = slotPositions.flatMap((position) => (session.slots[position] ? [shapeOf(heldSlot(session, position))] : []));

    session.requestModel(pmvPpdIso);
    session.declineSwitch();

    expect(session.model).toBe(pmvPpdAshrae);
    expect(session.pendingSwitch).toBeNull();
    expect(slotPositions.flatMap((position) => (session.slots[position] ? [shapeOf(heldSlot(session, position))] : []))).toEqual(before);
  });
});
