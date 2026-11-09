/**
 * The air-speed entry group at the session (ADR-0002 decision 54): one entry
 * mode for the session, the air speed or the relative air speed, converting
 * every slot that holds values. Asserted at the seam the other session tests
 * use — a session in, its state and its computation out — and nothing
 * flushes, for the reason `compute.svelte.test.ts` gives.
 *
 * Every expected number is the library's own `v_relative`, or what a session
 * in the default mode gives; an air speed the switch back leaves is written
 * out, and `v_relative` of it is the relative air speed it came from.
 */
import { v_relative } from "jsthermalcomfort";
import { describe, expect, it } from "vitest";
import type { PointTrace } from "$lib/core/charts/chartSpec";
import { enteredBound } from "$lib/core/applicability";
import { chartType } from "$lib/core/chartType";
import { airSpeedMode, temperatureMode } from "$lib/core/entryModes";
import { quantities } from "$lib/core/quantities";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Computation } from "./compute.svelte";
import { Session, slotPositions } from "./session.svelte";
import {
  differenceFromSlot1,
  enterSlot1ValuesInOthers,
  heldSlot,
  listedRowsOf,
  outOfRangeQuantitiesAt,
  outputValueOf,
  sessionComparingThreeSlots,
  shapeOf,
  shownDifferences,
} from "./sessionTestReaders";

const q = quantities;

/**
 * Each slot's own air speed and metabolic rate, so no two convert to one
 * number, each inside ISO 7730's 1 m/s of relative air speed.
 */
const entriesOfSlot = [
  { v: 0.1, met: 1.1 },
  { v: 0.4, met: 2 },
  { v: 0.3, met: 3 },
] as const;

function threeDifferentSlots(): Session {
  const session = sessionComparingThreeSlots(pmvPpdIso);
  slotPositions.forEach((position) => {
    heldSlot(session, position).setEntered(q.v, entriesOfSlot[position].v);
    heldSlot(session, position).setEntered(q.met, entriesOfSlot[position].met);
  });
  return session;
}

describe("the session's air-speed entry mode", () => {
  it("starts as air speed entry, the page as it was", () => {
    const session = new Session(pmvPpdIso);

    expect(session.airSpeedMode).toBe(airSpeedMode.airSpeed);
    expect(session.slots[0].values.has(q.vr)).toBe(false);
  });

  it("converts every slot that holds values into relative air speed entry, each at its own air speed and metabolic rate", () => {
    const session = threeDifferentSlots();

    session.setAirSpeedMode(airSpeedMode.relativeAirSpeed);

    expect(session.airSpeedMode).toBe(airSpeedMode.relativeAirSpeed);
    slotPositions.forEach((position) => {
      const { v, met } = entriesOfSlot[position];
      expect(heldSlot(session, position).airSpeed.mode).toBe(airSpeedMode.relativeAirSpeed);
      expect(heldSlot(session, position).values.get(q.vr)).toBe(v_relative(v, met));
      expect(heldSlot(session, position).values.has(q.v)).toBe(false);
    });
  });

  it("moves no output on the switch into relative air speed entry: the entry shows what the model was given", () => {
    const session = threeDifferentSlots();
    const computation = new Computation(session);
    const before = computation.slots.map((slot) => outputValueOf(slot.outputs, q.pmv));

    session.setAirSpeedMode(airSpeedMode.relativeAirSpeed);

    expect(computation.slots.map((slot) => outputValueOf(slot.outputs, q.pmv))).toEqual(before);
  });

  /** What the model returned for each slot: equal before and after only if it was given the same values. */
  function outputsOfEachSlot(computation: Computation) {
    return computation.slots.map((slot) => slot.outputs);
  }

  it("gives the air speed back on the switch back, the model given the same relative air speed throughout", () => {
    const session = threeDifferentSlots();
    const computation = new Computation(session);
    const entered = slotPositions.map((position) => shapeOf(heldSlot(session, position)));
    const before = outputsOfEachSlot(computation);
    expect(before.every((ofSlot) => ofSlot !== null)).toBe(true);

    // A third round trip as the first: the number does not ratchet up by the activity's share.
    for (const roundTrip of [1, 2, 3]) {
      session.setAirSpeedMode(airSpeedMode.relativeAirSpeed);
      expect(outputsOfEachSlot(computation), `into relative air speed entry, round ${roundTrip}`).toEqual(before);

      session.setAirSpeedMode(airSpeedMode.airSpeed);
      expect(slotPositions.map((position) => shapeOf(heldSlot(session, position)))).toEqual(entered);
      expect(outputsOfEachSlot(computation), `back in air speed entry, round ${roundTrip}`).toEqual(before);
    }
  });

  // `v_relative` rounds to 0.001 above 1 met, so an air speed entered finer
  // than that cannot come back finer: the inverse is exact to the library's
  // own rounding and no further, and the model is given what it was given.
  it("gives an air speed finer than the library's 0.001 back at the shown precision, and the same from then on", () => {
    const session = new Session(pmvPpdIso);
    const computation = new Computation(session);
    session.slots[0].setEntered(q.met, 2);
    session.slots[0].setEntered(q.v, 0.1234);
    const before = computation.slots[0].outputs;

    session.setAirSpeedMode(airSpeedMode.relativeAirSpeed);
    session.setAirSpeedMode(airSpeedMode.airSpeed);

    const restored = session.slots[0].values.get(q.v);
    expect(restored).toBeCloseTo(0.123, 2);
    expect(computation.slots[0].outputs).toEqual(before);

    session.setAirSpeedMode(airSpeedMode.relativeAirSpeed);
    session.setAirSpeedMode(airSpeedMode.airSpeed);

    expect(session.slots[0].values.get(q.v)).toBe(restored);
  });

  describe("a relative air speed below the activity's share, switched back", () => {
    /** Story 2's stationary equipment: 0.1 m/s at 2 met, which no air speed gives. */
    function switchedBack(model = pmvPpdIso): Session {
      const session = new Session(model);
      session.slots[0].setEntered(q.met, 2);
      session.setAirSpeedMode(airSpeedMode.relativeAirSpeed);
      session.slots[0].setEntered(q.vr, 0.1);
      session.setAirSpeedMode(airSpeedMode.airSpeed);
      return session;
    }

    it("is cut to an air speed of 0, the air speed's bound, and calculated (ADR-0002 decision 84, rule 5)", () => {
      const session = switchedBack();
      const computation = new Computation(session);

      expect(session.slots[0].values.get(q.v)).toBe(0);
      expect(enteredBound(pmvPpdIso, q.v, session.slots[0], session.atmosphericPressure)).toEqual({ min: 0 });
      expect(outOfRangeQuantitiesAt(session, 0)).toEqual([]);
      expect(computation.slots[0].outputs).not.toBeNull();
    });
  });

  it("gives the model an entered relative air speed unchanged", () => {
    const { v, met } = entriesOfSlot[1];
    const entered = new Session(pmvPpdIso);
    entered.slots[0].setEntered(q.met, met);
    entered.setAirSpeedMode(airSpeedMode.relativeAirSpeed);
    entered.slots[0].setEntered(q.vr, v_relative(v, met));
    const derived = new Session(pmvPpdIso);
    derived.slots[0].setEntered(q.met, met);
    derived.slots[0].setEntered(q.v, v);

    expect(new Computation(entered).slots[0].outputs).toEqual(new Computation(derived).slots[0].outputs);
  });

  it("converts a slot that holds values and is not compared, and hands a slot first enabled slot 1's mode", () => {
    const session = new Session(pmvPpdIso);
    session.setCompare(true);
    enterSlot1ValuesInOthers(session);
    heldSlot(session, 1).setEntered(q.met, 2);
    session.setSlotEnabled(1, false);

    session.setAirSpeedMode(airSpeedMode.relativeAirSpeed);
    session.setSlotEnabled(2, true);

    expect(heldSlot(session, 1).values.get(q.vr)).toBe(v_relative(0.1, 2));
    expect(heldSlot(session, 2).airSpeed.mode).toBe(airSpeedMode.relativeAirSpeed);
    expect(differenceFromSlot1(session, 2)).toEqual(
      shownDifferences([q.tdb, 2], [q.tr, 3], [q.vr, 0.1], [q.met, 0.32], [q.clo, 0.4]),
    );
  });

  it("converts into operative entry under relative air speed entry, in either order of the two changes", () => {
    const first = threeDifferentSlots();
    first.setAirSpeedMode(airSpeedMode.relativeAirSpeed);
    first.setTemperatureMode(temperatureMode.operative);
    const computation = new Computation(first);

    expect(first.temperatureMode).toBe(temperatureMode.operative);
    slotPositions.forEach((position) => {
      expect(heldSlot(first, position).values.has(q.operative_tmp)).toBe(true);
      expect(heldSlot(first, position).values.has(q.vr)).toBe(true);
    });
    expect(first.comparedPositions.map((position) => outOfRangeQuantitiesAt(first, position))).toEqual([[], [], []]);
    expect(computation.chart).not.toBeNull();
  });

  it("reports a relative air speed the run breaks on the row entered: the air speed's, then its own", () => {
    // PMV (ASHRAE 55) with the air-speed control off: 0.15 m/s at met 1.29 is a vr of 0.237,
    // over the 0.2 m/s the standard allows at this operative temperature.
    const session = new Session(pmvPpdAshrae);
    const computation = new Computation(session);
    for (const [quantity, value] of [[q.tdb, 22], [q.tr, 22], [q.v, 0.15], [q.met, 1.29]] as const) {
      session.slots[0].setEntered(quantity, value);
    }
    expect(computation.slots[0].violations.map(({ quantity, bounded }) => [quantity, bounded])).toEqual([[q.v, q.vr]]);

    session.setAirSpeedMode(airSpeedMode.relativeAirSpeed);

    expect(outOfRangeQuantitiesAt(session, 0)).toEqual([]);
    expect(computation.slots[0].violations.map(({ quantity, bounded }) => [quantity, bounded])).toEqual([[q.vr, q.vr]]);
  });

  it("calculates an air speed the model is given past its relative-air-speed row, reporting it on the air speed's row, and cuts it to the row as an entered relative air speed", () => {
    const bound = pmvPpdIso.info.inputs.vr?.applicability;
    const session = new Session(pmvPpdIso);
    const computation = new Computation(session);
    session.slots[0].setEntered(q.met, 2);
    // 0.8 m/s at 2 met is a relative air speed of 1.1 m/s, past the model's 1.
    session.slots[0].setEntered(q.v, 0.8);

    expect(outOfRangeQuantitiesAt(session, 0)).toEqual([]);
    expect(computation.slots[0].outputs).not.toBeNull();
    expect(computation.slots[0].violations.find((row) => row.quantity === q.v)).toMatchObject({ bounded: q.vr, bound });

    session.setAirSpeedMode(airSpeedMode.relativeAirSpeed);

    expect(enteredBound(pmvPpdIso, q.vr, session.slots[0], session.atmosphericPressure)).toEqual(bound);
    expect(session.slots[0].values.get(q.vr)).toBe(bound?.max);
    expect(outOfRangeQuantitiesAt(session, 0)).toEqual([]);
    expect(computation.slots[0].outputs).not.toBeNull();
  });
});

describe("the dynamic chart under the session's air-speed entry mode", () => {
  function markerOf(computation: Computation): PointTrace | undefined {
    return computation.chart?.traces.find((trace): trace is PointTrace => trace.kind === "point");
  }

  it("offers and draws the relative air speed where it offered the air speed", () => {
    const session = new Session(pmvPpdIso);
    const computation = new Computation(session);
    session.chart.type = chartType.dynamic;
    expect(computation.drawnAxes?.selected).toEqual({ x: q.tdb, y: q.v });

    session.setAirSpeedMode(airSpeedMode.relativeAirSpeed);

    expect(computation.drawnAxes?.selected).toEqual({ x: q.tdb, y: q.vr });
    expect(computation.drawnAxes?.choices).toContain(q.vr);
    expect(computation.drawnAxes?.choices).not.toContain(q.v);
    expect(computation.chart?.layout.y.title).toContain(q.vr.label);
    expect(markerOf(computation)?.y).toBe(session.slots[0].values.get(q.vr));
  });
});

describe("a model switch under relative air speed entry", () => {
  const isoBound = pmvPpdIso.info.inputs.vr?.applicability;

  /** A session on PMV (ASHRAE 55) entering a relative air speed ISO 7730 does not accept. */
  function enteringRelativeAirSpeed(): Session {
    const session = new Session(pmvPpdAshrae);
    session.setAirSpeedMode(airSpeedMode.relativeAirSpeed);
    session.slots[0].setEntered(q.vr, 1.5);
    return session;
  }

  it("asks about the relative air speed by its own name, against the new model's bound for it", () => {
    const session = enteringRelativeAirSpeed();

    session.requestModel(pmvPpdIso);

    expect(session.model).toBe(pmvPpdAshrae);
    expect(listedRowsOf(session)).toEqual([{ quantity: q.vr, value: 1.5, bound: isoBound }]);
  });

  it("leaves the slot untouched on a no, its entry mode included", () => {
    const session = enteringRelativeAirSpeed();
    const before = shapeOf(session.slots[0]);

    session.requestModel(pmvPpdIso);
    session.declineSwitch();

    expect(session.model).toBe(pmvPpdAshrae);
    expect(shapeOf(session.slots[0])).toEqual(before);
  });

  it("cuts the relative air speed on a yes, and keeps the mode", () => {
    const session = enteringRelativeAirSpeed();

    session.requestModel(pmvPpdIso);
    session.acceptSwitch();

    expect(session.model).toBe(pmvPpdIso);
    expect(session.airSpeedMode).toBe(airSpeedMode.relativeAirSpeed);
    expect(session.slots[0].values.get(q.vr)).toBe(isoBound?.max);
    expect(session.slots[0].values.has(q.v)).toBe(false);
  });

  it("keeps the mode and cuts nothing when the model is set", () => {
    const session = enteringRelativeAirSpeed();

    session.setModel(pmvPpdIso);

    expect(session.airSpeedMode).toBe(airSpeedMode.relativeAirSpeed);
    expect(session.slots[0].values.get(q.vr)).toBe(1.5);
    expect(outOfRangeQuantitiesAt(session, 0)).toEqual([q.vr]);
  });

  it("switches without asking to a model whose relative-air-speed row the air speed breaks, and reports it on the air speed's row", () => {
    const session = new Session(pmvPpdAshrae);
    const computation = new Computation(session);
    session.slots[0].setEntered(q.met, 2);
    // A relative air speed of 1.8 m/s: inside ASHRAE 55's 2, past ISO 7730's 1.
    session.slots[0].setEntered(q.v, 1.5);

    session.requestModel(pmvPpdIso);

    expect(listedRowsOf(session)).toBeUndefined();
    expect(session.model).toBe(pmvPpdIso);
    expect(session.slots[0].values.get(q.v)).toBe(1.5);
    expect(computation.slots[0].outputs).not.toBeNull();
    expect(computation.slots[0].violations.find((row) => row.quantity === q.v)).toMatchObject({
      bounded: q.vr,
      bound: pmvPpdIso.info.inputs.vr?.applicability,
    });
  });

  // Adaptive (ASHRAE 55) has no air-speed group, so the slot arrives in air
  // speed entry by the conversion the control applies: the mode is lost, and
  // the relative air speed the PMV model takes is not (ADR-0002 decision 54).
  it("returns to air speed entry through a model without the group, holding the inverted air speed, and gives the model its relative air speed back", () => {
    const session = new Session(pmvPpdAshrae);
    const computation = new Computation(session);
    session.slots[0].setEntered(q.met, 2);
    session.setAirSpeedMode(airSpeedMode.relativeAirSpeed);
    session.slots[0].setEntered(q.vr, 1.9);
    const before = computation.slots[0].outputs;
    expect(before).not.toBeNull();

    session.setModel(adaptiveAshrae);

    expect(session.airSpeedMode).toBe(airSpeedMode.airSpeed);
    expect(session.slots[0].values.get(q.v)).toBe(1.6);
    expect(session.slots[0].values.has(q.vr)).toBe(false);

    session.setModel(pmvPpdAshrae);

    expect(session.airSpeedMode).toBe(airSpeedMode.airSpeed);
    expect(v_relative(1.6, 2)).toBe(1.9);
    expect(computation.slots[0].outputs).toEqual(before);
  });
});
