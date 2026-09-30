/**
 * The clothing entry group at the session (ADR-0002 decision 54): one entry
 * mode for the session, the clothing insulation or the dynamic clothing
 * insulation, converting every slot that holds values by the rule of the
 * session's model's standard. Asserted at the seam the other session tests
 * use — a session in, its state and its outputs out — and nothing flushes, for
 * the reason `compute.svelte.test.ts` gives.
 *
 * Every expected number is the library's own `clo_dynamic_ashrae` or
 * `clo_dynamic_iso`, or what a session entering that number gives.
 */
import { clo_dynamic_ashrae, clo_dynamic_iso } from "jsthermalcomfort";
import { describe, expect, it } from "vitest";
import type { PointTrace } from "$lib/core/charts/chartSpec";
import { enteredBound } from "$lib/core/applicability";
import { chartType } from "$lib/core/chartType";
import { airSpeedMode, clothingMode } from "$lib/core/entryModes";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { quantities } from "$lib/core/quantities";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Outputs } from "./compute.svelte";
import { Session, slotPositions } from "./session.svelte";
import { heldSlot, listedRowsOf, resultValueOf, sessionComparingThreeSlots, shapeOf } from "./sessionTestReaders";

const q = quantities;

/** Each slot's own clothing, air speed and metabolic rate, so no two convert to one number; slot 1 below 1.2 met. */
const entriesOfSlot = [
  { clo: 0.5, v: 0.1, met: 1.1 },
  { clo: 1, v: 0.4, met: 2 },
  { clo: 1.4, v: 0.8, met: 3 },
] as const;

/** The dynamic clothing insulation each model's standard gives a slot's entries, by the library. */
const corrections = [
  { model: pmvPpdAshrae, dynamic: ({ clo, met }: (typeof entriesOfSlot)[number]) => clo_dynamic_ashrae(clo, met) },
  { model: pmvPpdIso, dynamic: ({ clo, met, v }: (typeof entriesOfSlot)[number]) => clo_dynamic_iso(clo, met, v) },
] as const;

function threeDifferentSlots(model: RegisteredModel): Session {
  const session = sessionComparingThreeSlots(model);
  slotPositions.forEach((position) => {
    const { clo, v, met } = entriesOfSlot[position];
    heldSlot(session, position).setEntered(q.clo, clo);
    heldSlot(session, position).setEntered(q.v, v);
    heldSlot(session, position).setEntered(q.met, met);
  });
  return session;
}

/** A session on `model` whose one slot enters `clo_dynamic` and what else `entries` names of a slot. */
function enteringDynamic(model: RegisteredModel, entries: { v: number; met: number }, dynamic: number): Session {
  const session = new Session(model);
  session.slots[0].setEntered(q.v, entries.v);
  session.slots[0].setEntered(q.met, entries.met);
  session.setClothingMode(clothingMode.corrected);
  session.slots[0].setEntered(q.clo_dynamic, dynamic);
  return session;
}

describe("the session's clothing entry mode", () => {
  it("starts as clothing insulation entry", () => {
    const session = new Session(pmvPpdIso);

    expect(session.clothingMode).toBe(clothingMode.uncorrected);
    expect(session.slots[0].values.has(q.clo_dynamic)).toBe(false);
  });

  describe.each(corrections)("on $model.info.label", ({ model, dynamic }) => {
    it("gives the model the clothing corrected by its standard's rule under clothing insulation entry", () => {
      const outputs = new Outputs(threeDifferentSlots(model));

      slotPositions.forEach((position) => {
        const entries = entriesOfSlot[position];
        const given = new Outputs(enteringDynamic(model, entries, dynamic(entries)));
        expect(outputs.slots[position].result, `slot ${position + 1}`).not.toBeNull();
        expect(outputs.slots[position].result, `slot ${position + 1}`).toEqual(given.slots[0].result);
      });
    });

    it("converts every slot that holds values into dynamic clothing entry, each at its own values", () => {
      const session = threeDifferentSlots(model);

      session.setClothingMode(clothingMode.corrected);

      expect(session.clothingMode).toBe(clothingMode.corrected);
      slotPositions.forEach((position) => {
        expect(heldSlot(session, position).clothing.mode).toBe(clothingMode.corrected);
        expect(heldSlot(session, position).values.get(q.clo_dynamic)).toBe(dynamic(entriesOfSlot[position]));
        expect(heldSlot(session, position).values.has(q.clo)).toBe(false);
      });
    });

    it("moves no result on the switch into dynamic clothing entry: the entry shows what the model was given", () => {
      const session = threeDifferentSlots(model);
      const outputs = new Outputs(session);
      const before = outputs.slots.map((slot) => slot.result);
      expect(before.every((result) => result !== null)).toBe(true);

      session.setClothingMode(clothingMode.corrected);

      expect(outputs.slots.map((slot) => slot.result)).toEqual(before);
    });

    // An entry convention, not an equation (ADR-0002 decision 54): the number
    // stays, and the model is then given it corrected again.
    it("keeps the number on the switch back, which the model is then given corrected again", () => {
      const session = threeDifferentSlots(model);
      const outputs = new Outputs(session);
      const before = outputs.slots.map((slot) => resultValueOf(slot.result, q.pmv));
      session.setClothingMode(clothingMode.corrected);

      session.setClothingMode(clothingMode.uncorrected);

      expect(session.clothingMode).toBe(clothingMode.uncorrected);
      slotPositions.forEach((position) => {
        expect(heldSlot(session, position).values.get(q.clo)).toBe(dynamic(entriesOfSlot[position]));
        expect(heldSlot(session, position).values.has(q.clo_dynamic)).toBe(false);
      });
      const after = outputs.slots.map((slot) => resultValueOf(slot.result, q.pmv));
      expect(after[1]).not.toBe(before[1]);
      expect(after[2]).not.toBe(before[2]);
    });

    // The anchor: the same model under no standard has no clothing correction,
    // so it is given the clothing insulation as entered, as before this group.
    it("gives the model an entered dynamic clothing insulation unchanged", () => {
      const passedThrough = new Session({ ...model, standard: undefined });
      passedThrough.slots[0].setEntered(q.met, 3);
      passedThrough.slots[0].setEntered(q.clo, 0.7);
      const entered = enteringDynamic(model, { v: 0.1, met: 3 }, 0.7);
      const corrected = new Session(model);
      corrected.slots[0].setEntered(q.met, 3);
      corrected.slots[0].setEntered(q.clo, 0.7);

      const given = new Outputs(entered).slots[0].result;

      expect(given).not.toBeNull();
      expect(given).toEqual(new Outputs(passedThrough).slots[0].result);
      expect(given).not.toEqual(new Outputs(corrected).slots[0].result);
    });
  });

  it("moves no number of PMV (ASHRAE 55) at or below 1.2 met, in either mode", () => {
    const session = new Session(pmvPpdAshrae);
    const outputs = new Outputs(session);
    session.slots[0].setEntered(q.met, 1.2);
    const before = outputs.slots[0].result;

    session.setClothingMode(clothingMode.corrected);

    expect(session.slots[0].values.get(q.clo_dynamic)).toBe(0.5);
    expect(outputs.slots[0].result).toEqual(before);

    session.setClothingMode(clothingMode.uncorrected);

    expect(outputs.slots[0].result).toEqual(before);
  });

  it("converts by the session's model's standard: one entry is two dynamic clothing insulations under the two", () => {
    const [ashrae, iso] = corrections.map(({ model }) => {
      const session = threeDifferentSlots(model);
      session.setClothingMode(clothingMode.corrected);
      return heldSlot(session, 1).values.get(q.clo_dynamic);
    });

    expect(ashrae).toBe(clo_dynamic_ashrae(1, 2));
    expect(iso).toBe(clo_dynamic_iso(1, 2, 0.4));
    expect(ashrae).not.toBe(iso);
  });

  it("corrects by ISO 7730's rule at the relative air speed the model is given, in either air-speed mode", () => {
    const session = threeDifferentSlots(pmvPpdIso);
    session.setAirSpeedMode(airSpeedMode.corrected);

    session.setClothingMode(clothingMode.corrected);

    slotPositions.forEach((position) => {
      const { clo, met, v } = entriesOfSlot[position];
      expect(heldSlot(session, position).values.get(q.clo_dynamic)).toBe(clo_dynamic_iso(clo, met, v));
    });
  });

  it("converts a slot that holds values and is not compared, and hands a slot first enabled slot 1's mode", () => {
    const session = new Session(pmvPpdAshrae);
    session.setCompare(true);
    heldSlot(session, 1).setEntered(q.met, 2);
    session.setSlotEnabled(1, false);

    session.setClothingMode(clothingMode.corrected);
    session.setSlotEnabled(2, true);

    expect(heldSlot(session, 1).values.get(q.clo_dynamic)).toBe(clo_dynamic_ashrae(0.5, 2));
    expect(shapeOf(heldSlot(session, 2))).toEqual(shapeOf(session.slots[0]));
    expect(heldSlot(session, 2).clothing.mode).toBe(clothingMode.corrected);
  });

  it("judges the entered clothing on the row the person sees, in either mode", () => {
    const bound = pmvPpdAshrae.info.inputs.clo?.applicability;
    const session = new Session(pmvPpdAshrae);
    const outputs = new Outputs(session);
    session.slots[0].setEntered(q.clo, (bound?.max ?? 0) + 0.1);
    expect(outputs.slots[0].outOfRangeQuantities).toEqual([q.clo]);

    session.setClothingMode(clothingMode.corrected);

    expect(outputs.slots[0].outOfRangeQuantities).toEqual([q.clo_dynamic]);
    expect(enteredBound(pmvPpdAshrae, q.clo_dynamic, session.slots[0], session.atmosphericPressure)).toEqual(bound);
    expect(outputs.slots[0].notCalculated).toBe(true);
  });

  // ISO 7730's rule gives still, seated air more clothing than was entered: 2
  // clo, the most the gate lets through, is given to the model as 2.069.
  it("reports a dynamic clothing insulation the run breaks on the row entered, and stops it once it is the entry", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    for (const [quantity, value] of [[q.v, 0], [q.met, 1], [q.clo, 2]] as const) {
      session.slots[0].setEntered(quantity, value);
    }
    expect(outputs.slots[0].outOfRangeQuantities).toEqual([]);
    expect(outputs.slots[0].violations.map(({ quantity, bounded }) => [quantity, bounded])).toEqual([[q.clo, q.clo_dynamic]]);

    session.setClothingMode(clothingMode.corrected);

    expect(session.slots[0].values.get(q.clo_dynamic)).toBe(clo_dynamic_iso(2, 1, 0));
    expect(outputs.slots[0].outOfRangeQuantities).toEqual([q.clo_dynamic]);
    expect(outputs.slots[0].notCalculated).toBe(true);
  });
});

describe("the dynamic chart under the session's clothing entry mode", () => {
  function markerOf(outputs: Outputs): PointTrace | undefined {
    return outputs.chart?.traces.find((trace): trace is PointTrace => trace.kind === "point");
  }

  function sessionOnClothingAxis(): Session {
    const session = new Session(pmvPpdAshrae);
    session.chart.type = chartType.dynamic;
    session.chart.setAxes({ y: q.clo });
    session.slots[0].setEntered(q.met, 2);
    return session;
  }

  it("offers and draws the dynamic clothing insulation where it offered the clothing insulation", () => {
    const session = sessionOnClothingAxis();
    const outputs = new Outputs(session);
    expect(outputs.drawnAxes?.selected).toEqual({ x: q.tdb, y: q.clo });

    session.setClothingMode(clothingMode.corrected);

    expect(outputs.drawnAxes?.selected).toEqual({ x: q.tdb, y: q.clo_dynamic });
    expect(outputs.drawnAxes?.choices).toContain(q.clo_dynamic);
    expect(outputs.drawnAxes?.choices).not.toContain(q.clo);
    expect(outputs.chart?.layout.y.title).toContain(q.clo_dynamic.label);
    expect(markerOf(outputs)?.y).toBe(clo_dynamic_ashrae(0.5, 2));
  });

  it("marks a slot whose gate is closed on the session's axis, at the value the conversion gives its last valid inputs", () => {
    const session = sessionOnClothingAxis();
    const outputs = new Outputs(session);
    void outputs.chart;
    // 50 °C is past ASHRAE 55's 40 °C, and no clothing-mode change moves it.
    session.slots[0].setEntered(q.tdb, 50);

    session.setClothingMode(clothingMode.corrected);

    expect(outputs.slots[0].notCalculated).toBe(true);
    expect(outputs.slots[0].lastValid?.slot.clothing.mode).toBe(clothingMode.uncorrected);
    expect(outputs.chart?.layout.y.title).toContain(q.clo_dynamic.label);
    expect(markerOf(outputs)?.y).toBe(clo_dynamic_ashrae(0.5, 2));
  });
});

describe("a model switch under dynamic clothing entry", () => {
  const ashraeBound = pmvPpdAshrae.info.inputs.clo?.applicability;

  /** A session on PMV (ISO 7730) entering a dynamic clothing insulation ASHRAE 55 does not accept. */
  function enteringDynamicClothing(): Session {
    return enteringDynamic(pmvPpdIso, { v: 0.1, met: 1.1 }, 1.8);
  }

  it("asks about the dynamic clothing insulation by its own name, against the new model's bound for the clothing", () => {
    const session = enteringDynamicClothing();

    session.requestModel(pmvPpdAshrae);

    expect(session.model).toBe(pmvPpdIso);
    expect(listedRowsOf(session)).toEqual([{ quantity: q.clo_dynamic, value: 1.8, bound: ashraeBound }]);
  });

  it("leaves the slot untouched on a no, its entry mode included", () => {
    const session = enteringDynamicClothing();
    const before = shapeOf(session.slots[0]);

    session.requestModel(pmvPpdAshrae);
    session.declineSwitch();

    expect(session.model).toBe(pmvPpdIso);
    expect(shapeOf(session.slots[0])).toEqual(before);
  });

  it("adjusts the dynamic clothing insulation on a yes, and keeps the mode", () => {
    const session = enteringDynamicClothing();

    session.requestModel(pmvPpdAshrae);
    session.acceptSwitch();

    expect(session.model).toBe(pmvPpdAshrae);
    expect(session.clothingMode).toBe(clothingMode.corrected);
    expect(session.slots[0].values.get(q.clo_dynamic)).toBe(ashraeBound?.max);
    expect(session.slots[0].values.has(q.clo)).toBe(false);
  });

  it("keeps the mode and the number between the two PMV models, and adjusts nothing on the address's path", () => {
    const session = enteringDynamicClothing();

    session.setModel(pmvPpdAshrae);

    expect(session.clothingMode).toBe(clothingMode.corrected);
    expect(session.slots[0].values.get(q.clo_dynamic)).toBe(1.8);
    expect(new Outputs(session).slots[0].outOfRangeQuantities).toEqual([q.clo_dynamic]);
  });

  it("keeps a clothing insulation entry between the two PMV models, corrected by the new model's standard", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    session.slots[0].setEntered(q.met, 2);
    session.slots[0].setEntered(q.clo, 1);

    session.requestModel(pmvPpdAshrae);

    expect(session.model).toBe(pmvPpdAshrae);
    expect(session.clothingMode).toBe(clothingMode.uncorrected);
    expect(session.slots[0].values.get(q.clo)).toBe(1);
    expect(outputs.slots[0].result).toEqual(new Outputs(enteringDynamic(pmvPpdAshrae, { v: 0.1, met: 2 }, clo_dynamic_ashrae(1, 2))).slots[0].result);
  });

  // Adaptive (ASHRAE 55) takes no clothing, so it has no clothing group and
  // the slot arrives in clothing insulation entry by the conversion the
  // control applies: the mode is lost and the number kept (ADR-0002 decision 54).
  it("returns to clothing insulation entry through a model without the group, the number kept", () => {
    const session = enteringDynamic(pmvPpdAshrae, { v: 0.1, met: 2 }, 0.8);

    session.setModel(adaptiveAshrae);

    expect(session.clothingMode).toBe(clothingMode.uncorrected);
    expect(session.slots[0].values.get(q.clo)).toBe(0.8);
    expect(session.slots[0].values.has(q.clo_dynamic)).toBe(false);

    session.setModel(pmvPpdAshrae);

    expect(session.clothingMode).toBe(clothingMode.uncorrected);
    expect(session.slots[0].values.get(q.clo)).toBe(0.8);
  });
});
