/**
 * Compare (ADR-0002 decisions 50 and 52): the session holds whether Compare is
 * on and which of slots 2 and 3 are enabled, and the outputs are asked about
 * the compared slots, each with its own gate. Asserted at the seam the other
 * session tests use — a session in, its state and its outputs out, with no
 * component and no router — and nothing flushes, for the reason
 * `compute.svelte.test.ts` gives.
 *
 * A compared slot's expected result is the one a session holding that slot
 * alone gives, so no number here is written by hand.
 */
import { describe, expect, it } from "vitest";
import type { ChartSpec, ContourZoneTrace, PathTrace, PointTrace } from "$lib/core/charts/chartSpec";
import { chartType } from "$lib/core/chartType";
import { humidityMode, temperatureMode } from "$lib/core/entryModes";
import type { RegisteredModel, Values } from "$lib/core/modelDeclaration";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities, type Quantity } from "$lib/core/quantities";
import { slotBadges } from "$lib/core/slotBadge";
import { unitSystem } from "$lib/core/unitSystem";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Outputs } from "./compute.svelte";
import { Session, slotPositions, type SlotPosition } from "./session.svelte";
import { heldSlot, sessionComparingThreeSlots, shapeOf } from "./sessionTestReaders";

const q = quantities;

/** The positions of the slots the outputs are asked about, in the order they are given. */
function positionsAskedAbout(outputs: Outputs): SlotPosition[] {
  return outputs.slots.map((slot) => slot.position);
}

/** The result a session holding only a slot entered with `entries` gives. */
function resultAlone(entries: ReadonlyMap<Quantity, number>) {
  const session = new Session(pmvPpdIso);
  for (const [quantity, value] of entries) {
    session.slots[0].setEntered(quantity, value);
  }
  return new Outputs(session).slots[0].result;
}

/** `pmvPpdIso`, counting every call the outputs make of it. */
function modelCountingRuns(): { model: RegisteredModel; runs: () => number } {
  let runs = 0;
  const model = {
    ...pmvPpdIso,
    run: (values: Values) => {
      runs += 1;
      return pmvPpdIso.run(values);
    },
  } satisfies RegisteredModel;
  return { model, runs: () => runs };
}

describe("Compare in the session", () => {
  it("starts off, with slot 1 alone compared and slots 2 and 3 holding nothing", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);

    expect(session.compare).toBe(false);
    expect(session.slots[1]).toBeNull();
    expect(session.slots[2]).toBeNull();
    expect(positionsAskedAbout(outputs)).toEqual([0]);
    expect(outputs.slots[0].result).not.toBeNull();
  });

  it("enables slots 1 and 2 at the first switch-on, slot 2 holding what slot 1 holds, entry modes and options included", () => {
    const session = new Session(pmvPpdAshrae);
    const [option] = pmvPpdAshrae.options;
    session.slots[0].setOption(option, !option.default);
    session.slots[0].setTemperatureMode(temperatureMode.operative, session.model);
    session.slots[0].setHumidityMode(humidityMode.dewPoint, DEFAULT_ATMOSPHERIC_PRESSURE);
    session.slots[0].setEntered(q.clo, 0.8);

    session.setCompare(true);

    expect(session.compare).toBe(true);
    expect(slotPositions.map((position) => session.isSlotEnabled(position))).toEqual([true, true, false]);
    expect(shapeOf(heldSlot(session, 1))).toEqual(shapeOf(session.slots[0]));
    expect(session.slots[2]).toBeNull();
    expect(positionsAskedAbout(new Outputs(session))).toEqual([0, 1]);
  });

  it("keeps which slots were enabled and what each holds when Compare is switched off and on again", () => {
    const session = new Session(pmvPpdIso);
    session.setCompare(true);
    session.setSlotEnabled(1, false);
    session.setSlotEnabled(2, true);
    heldSlot(session, 2).setEntered(q.tdb, 22);
    const held = session.slots.map((slot) => (slot ? shapeOf(slot) : null));

    session.setCompare(false);
    expect(positionsAskedAbout(new Outputs(session))).toEqual([0]);
    session.setCompare(true);

    expect(slotPositions.map((position) => session.isSlotEnabled(position))).toEqual([true, false, true]);
    expect(session.slots.map((slot) => (slot ? shapeOf(slot) : null))).toEqual(held);
    expect(positionsAskedAbout(new Outputs(session))).toEqual([0, 2]);
  });

  it("compares slot 1 whatever else is enabled or off", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);

    session.setCompare(true);
    session.setSlotEnabled(1, false);
    expect(session.isSlotEnabled(0)).toBe(true);
    expect(positionsAskedAbout(outputs)).toEqual([0]);

    session.setCompare(false);
    expect(session.isSlotEnabled(0)).toBe(true);
    expect(positionsAskedAbout(outputs)).toEqual([0]);
  });

  it("gives a slot enabled again what it held, not a new copy of slot 1", () => {
    const session = new Session(pmvPpdIso);
    session.setCompare(true);
    heldSlot(session, 1).setEntered(q.tdb, 22);
    session.setSlotEnabled(1, false);
    session.slots[0].setEntered(q.tdb, 27);

    session.setSlotEnabled(1, true);

    expect(heldSlot(session, 1).values.get(q.tdb)).toBe(22);
  });

  it("gives slot 3, first enabled after slot 1 has changed, what slot 1 holds then", () => {
    const session = new Session(pmvPpdIso);
    session.setCompare(true);
    session.slots[0].setEntered(q.tdb, 27);

    session.setSlotEnabled(2, true);

    expect(shapeOf(heldSlot(session, 2))).toEqual(shapeOf(session.slots[0]));
    expect(heldSlot(session, 1).values.get(q.tdb)).not.toBe(27);
  });
});

describe("the outputs of the compared slots", () => {
  it("give each compared slot its own result, the one a session holding that slot alone gives", () => {
    const session = sessionComparingThreeSlots(pmvPpdIso);
    const outputs = new Outputs(session);
    heldSlot(session, 1).setEntered(q.tdb, 22);
    heldSlot(session, 2).setEntered(q.clo, 1);

    expect(positionsAskedAbout(outputs)).toEqual([0, 1, 2]);
    expect(outputs.slots[0].result).toEqual(resultAlone(new Map<Quantity, number>()));
    expect(outputs.slots[1].result).toEqual(resultAlone(new Map<Quantity, number>([[q.tdb, 22]])));
    expect(outputs.slots[2].result).toEqual(resultAlone(new Map<Quantity, number>([[q.clo, 1]])));
    expect(outputs.slots[1].result).not.toEqual(outputs.slots[0].result);
  });

  it("give a slot that is not compared no result, and do not run the model for it", () => {
    const { model, runs } = modelCountingRuns();
    const session = new Session(model);
    const outputs = new Outputs(session);
    session.setCompare(true);
    session.setSlotEnabled(1, false);
    void outputs.slots.map((slot) => slot.result);
    const before = runs();

    heldSlot(session, 1).setEntered(q.tdb, 22);
    void outputs.slots.map((slot) => slot.result);

    expect(positionsAskedAbout(outputs)).toEqual([0]);
    expect(runs()).toBe(before);
  });

  it("keep an out-of-range slot's last valid result and name its quantities, while slot 1 is calculated", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    session.setCompare(true);
    const kept = outputs.slots[1].result;

    // 35 °C is past ISO 7730's 30 °C.
    heldSlot(session, 1).setEntered(q.tdb, 35);
    session.slots[0].setEntered(q.tdb, 24);

    expect(outputs.slots[1].notCalculated).toBe(true);
    expect(outputs.slots[1].outOfRangeQuantities).toEqual([q.tdb]);
    expect(outputs.slots[1].result).toBe(kept);
    expect(outputs.slots[0].notCalculated).toBe(false);
    expect(outputs.slots[0].outOfRangeQuantities).toEqual([]);
    expect(outputs.slots[0].result).toEqual(resultAlone(new Map<Quantity, number>([[q.tdb, 24]])));
  });

  it("calculate no compared slot while the atmospheric pressure is out of range", () => {
    const session = sessionComparingThreeSlots(pmvPpdIso);
    const outputs = new Outputs(session);

    session.atmosphericPressure = 1;

    expect(outputs.slots.map((slot) => slot.notCalculated)).toEqual([true, true, true]);
  });

  it("run the model once for an edit to one slot, for that slot", () => {
    const { model, runs } = modelCountingRuns();
    const session = new Session(model);
    const outputs = new Outputs(session);
    session.setCompare(true);
    session.setSlotEnabled(2, true);
    void outputs.slots.map((slot) => slot.result);
    const first = outputs.slots[0].result;
    const third = outputs.slots[2].result;
    const before = runs();

    heldSlot(session, 1).setEntered(q.tdb, 22);
    void outputs.slots.map((slot) => slot.result);

    expect(runs()).toBe(before + 1);
    expect(outputs.slots[0].result).toBe(first);
    expect(outputs.slots[2].result).toBe(third);
  });

  // While a model switch rehearses slot 1 alone, a compared slot can lack
  // what the new model runs on; the gate stops it rather than the model
  // throwing.
  it("do not calculate a compared slot that lacks what the model runs on", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    session.setCompare(true);

    session.setModel(pmvPpdAshrae);

    expect(outputs.slots[0].notCalculated).toBe(false);
    expect(outputs.slots[1].notCalculated).toBe(true);
    expect(outputs.slots[1].result).toBeNull();
  });
});

/** A zone of either kind: a traced polygon, or a contour of a scanned field. */
type ZoneTrace = PathTrace | ContourZoneTrace;

/** The zones slot `position`'s hue draws on `chart`, in drawing order, as shapes a comparison can be made against. */
function zoneShapesOf(chart: ChartSpec | null, position: SlotPosition) {
  return (chart?.traces ?? [])
    .filter(
      (trace): trace is ZoneTrace =>
        (trace.kind === "contourZone" || (trace.kind === "path" && trace.fill !== undefined)) &&
        trace.color === slotBadges[position].hue.zoneLine,
    )
    .map((zone) => (zone.kind === "path" ? { x: zone.x, y: zone.y } : { z: zone.z, lower: zone.lower, upper: zone.upper }));
}

/** Where slot `position`'s marker is on `chart`, or `undefined` for none. */
function markerAt(chart: ChartSpec | null, position: SlotPosition) {
  const marker = chart?.traces.find(
    (trace): trace is PointTrace => trace.kind === "point" && trace.color === slotBadges[position].hue.marker,
  );
  return marker && { x: marker.x, y: marker.y };
}

/** The chart a session holding only a slot entered with `entries` draws, as slot 1. */
function chartAlone(entries: ReadonlyMap<Quantity, number>): ChartSpec | null {
  const session = new Session(pmvPpdIso);
  for (const [quantity, value] of entries) {
    session.slots[0].setEntered(quantity, value);
  }
  return new Outputs(session).chart;
}

describe("the charts of the compared slots", () => {
  const moreClothing = new Map<Quantity, number>([[q.clo, 1]]);

  it("draw two slots that differ in clothing as two zones that differ, and two markers at their own values", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    session.setCompare(true);
    heldSlot(session, 1).setEntered(q.clo, 1);

    const alone = chartAlone(moreClothing);
    expect(zoneShapesOf(outputs.chart, 1)).toEqual(zoneShapesOf(alone, 0));
    expect(zoneShapesOf(outputs.chart, 1)).not.toEqual(zoneShapesOf(outputs.chart, 0));
    expect(markerAt(outputs.chart, 1)).toEqual(markerAt(alone, 0));
    expect(markerAt(outputs.chart, 0)).toEqual(markerAt(chartAlone(new Map()), 0));
  });

  it("draw a slot out of range at its last valid run", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    session.setCompare(true);
    heldSlot(session, 1).setEntered(q.clo, 1);
    const zones = zoneShapesOf(outputs.chart, 1);
    const marker = markerAt(outputs.chart, 1);
    expect(zones).not.toEqual([]);

    // 35 °C is past ISO 7730's 30 °C.
    heldSlot(session, 1).setEntered(q.tdb, 35);

    expect(outputs.slots[1].notCalculated).toBe(true);
    expect(zoneShapesOf(outputs.chart, 1)).toEqual(zones);
    expect(markerAt(outputs.chart, 1)).toEqual(marker);
  });

  it("draw no zone and no marker of a slot that is disabled", () => {
    const session = sessionComparingThreeSlots(pmvPpdIso);
    const outputs = new Outputs(session);
    expect(markerAt(outputs.chart, 2)).toBeDefined();

    session.setSlotEnabled(2, false);

    expect(zoneShapesOf(outputs.chart, 2)).toEqual([]);
    expect(markerAt(outputs.chart, 2)).toBeUndefined();
    expect(markerAt(outputs.chart, 1)).toBeDefined();
  });

  it("draw a slot kept from a run at another pressure at the chart's one pressure, slot 1's", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    session.setCompare(true);
    // Read, as the page reads it, so slot 2 has a run to keep.
    void outputs.chart;
    heldSlot(session, 1).setEntered(q.tdb, 35);

    session.atmosphericPressure = 90_000;

    expect(outputs.slots[1].notCalculated).toBe(true);
    expect(outputs.slots[1].lastValid?.atmosphericPressure).toBe(DEFAULT_ATMOSPHERIC_PRESSURE);
    const alone = new Session(pmvPpdIso);
    alone.atmosphericPressure = 90_000;
    const chartAtPressure = new Outputs(alone).chart;
    expect(outputs.chart?.layout).toEqual(chartAtPressure?.layout);
    // Slot 2 holds what slot 1 holds but for its kept temperature, so at one
    // pressure its marker sits where slot 1's does.
    expect(markerAt(outputs.chart, 1)?.y).toBe(markerAt(chartAtPressure, 0)?.y);
  });

  describe("on the dynamic chart", () => {
    /** The model runs a session on `model` makes to show one slot, its result and its scan, from nothing. */
    function onePassOf(model: RegisteredModel, runs: () => number): number {
      const session = new Session(model);
      session.chart.type = chartType.dynamic;
      const before = runs();
      const outputs = new Outputs(session);
      void outputs.slots[0].result;
      void outputs.chart;
      return runs() - before;
    }

    function twoSlotsOnTheDynamicChart() {
      const { model, runs } = modelCountingRuns();
      const onePass = onePassOf(model, runs);
      const session = new Session(model);
      session.chart.type = chartType.dynamic;
      session.setCompare(true);
      const outputs = new Outputs(session);
      const readEverything = () => {
        void outputs.slots.map((slot) => slot.result);
        void outputs.chart;
      };
      readEverything();
      return { session, outputs, runs, onePass, readEverything };
    }

    it("scan once for an edit to one slot", () => {
      const { session, outputs, runs, onePass, readEverything } = twoSlotsOnTheDynamicChart();
      const first = zoneShapesOf(outputs.chart, 0);
      const before = runs();

      heldSlot(session, 1).setEntered(q.clo, 1);
      readEverything();

      expect(runs()).toBe(before + onePass);
      expect(zoneShapesOf(outputs.chart, 0)).toEqual(first);
      expect(zoneShapesOf(outputs.chart, 1)).not.toEqual(first);
    });

    it("scan once per compared slot for an edit to the atmospheric pressure", () => {
      const { session, runs, onePass, readEverything } = twoSlotsOnTheDynamicChart();
      const before = runs();

      session.atmosphericPressure = 90_000;
      readEverything();

      expect(runs()).toBe(before + 2 * onePass);
    });

    it("scan nothing for a change of unit system", () => {
      const { session, runs, readEverything } = twoSlotsOnTheDynamicChart();
      const before = runs();

      session.unitSystem = unitSystem.ip;
      readEverything();

      expect(runs()).toBe(before);
    });
  });
});
