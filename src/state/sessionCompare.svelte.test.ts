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
import { dynamicScanFrameFor } from "$lib/core/charts/dynamicChart";
import { psychrometricScanFrameFor } from "$lib/core/charts/psychrometricChart";
import { scannedField, type ScanFrame } from "$lib/core/charts/specParts";
import { chartType } from "$lib/core/chartType";
import { airSpeedMode, clothingMode, humidityMode, temperatureMode } from "$lib/core/entryModes";
import type { RegisteredModel, Values } from "$lib/core/modelDeclaration";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities, type Quantity } from "$lib/core/quantities";
import { entryModesOf, type ValueEntryModes } from "$lib/core/slot";
import { slotBadges } from "$lib/core/slotBadge";
import { unitSystem } from "$lib/core/unitSystem";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Outputs } from "./compute.svelte";
import { Session, slotPositions, type SlotPosition } from "./session.svelte";
import { heldSlot, sessionComparingThreeSlots, shapeOf, withBounds } from "./sessionTestReaders";

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
    session.setTemperatureMode(temperatureMode.operative);
    session.setHumidityMode(humidityMode.dewPoint);
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

  // A switch seeds every slot that holds values, so a compared slot holds
  // what the new model runs on: here PMV (ASHRAE 55)'s option.
  it("calculate every compared slot after a switch to a model they held nothing of", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    session.setCompare(true);

    session.setModel(pmvPpdAshrae);

    expect(outputs.slots.map((slot) => slot.notCalculated)).toEqual([false, false]);
    expect(outputs.slots[1].result).toEqual(outputs.slots[0].result);
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

    it("scan once for a slot first enabled, the slot enabled", () => {
      const { session, runs, onePass, readEverything } = twoSlotsOnTheDynamicChart();
      const before = runs();

      session.setSlotEnabled(2, true);
      readEverything();

      expect(runs()).toBe(before + onePass);
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

/**
 * An entry mode is the session's (ADR-0002 decision 51): a change converts
 * every slot that holds values, each as a session holding that slot alone
 * converts it.
 */
describe("the session's entry modes", () => {
  /** The slot a session holding only a slot entered with `entries` holds after `change`. */
  function convertedAlone(model: RegisteredModel, entries: ReadonlyMap<Quantity, number>, change: (session: Session) => void) {
    const session = new Session(model);
    for (const [quantity, value] of entries) {
      session.slots[0].setEntered(quantity, value);
    }
    change(session);
    return shapeOf(session.slots[0]);
  }

  /** Three different slots, each entered with its own entries, all compared. */
  const entriesOfSlot: readonly ReadonlyMap<Quantity, number>[] = [
    new Map<Quantity, number>([[q.tdb, 24]]),
    new Map<Quantity, number>([
      [q.tdb, 21],
      [q.tr, 27],
      [q.v, 0.1],
    ]),
    new Map<Quantity, number>([
      [q.tdb, 28],
      [q.tr, 22],
      [q.v, 0.8],
      [q.rh, 60],
    ]),
  ];

  function threeDifferentSlots(model: RegisteredModel): Session {
    const session = sessionComparingThreeSlots(model);
    slotPositions.forEach((position) => {
      for (const [quantity, value] of entriesOfSlot[position]) {
        heldSlot(session, position).setEntered(quantity, value);
      }
    });
    return session;
  }

  it("converts slots 1, 2 and 3 at a change of the temperature entry mode, each as a session holding it alone does", () => {
    const session = threeDifferentSlots(pmvPpdAshrae);
    const toOperative = (changed: Session) => changed.setTemperatureMode(temperatureMode.operative);

    toOperative(session);

    expect(session.temperatureMode).toBe(temperatureMode.operative);
    slotPositions.forEach((position) => {
      expect(shapeOf(heldSlot(session, position))).toEqual(convertedAlone(pmvPpdAshrae, entriesOfSlot[position], toOperative));
    });
  });

  it("converts each slot's humidity at its own dry-bulb temperature", () => {
    const session = threeDifferentSlots(pmvPpdIso);
    const toDewPoint = (changed: Session) => changed.setHumidityMode(humidityMode.dewPoint);

    toDewPoint(session);

    expect(session.humidityMode).toBe(humidityMode.dewPoint);
    slotPositions.forEach((position) => {
      expect(shapeOf(heldSlot(session, position))).toEqual(convertedAlone(pmvPpdIso, entriesOfSlot[position], toDewPoint));
    });
    expect(heldSlot(session, 1).humidity?.value).not.toBe(heldSlot(session, 2).humidity?.value);
  });

  it("converts a slot that holds values and is not compared, which is in the session's entry modes when next enabled", () => {
    const session = threeDifferentSlots(pmvPpdIso);
    session.setSlotEnabled(2, false);
    const toOperativeDewPoint = (changed: Session) => {
      changed.setTemperatureMode(temperatureMode.operative);
      changed.setHumidityMode(humidityMode.dewPoint);
    };

    toOperativeDewPoint(session);
    session.setSlotEnabled(2, true);

    expect(shapeOf(heldSlot(session, 2))).toEqual(convertedAlone(pmvPpdIso, entriesOfSlot[2], toOperativeDewPoint));
  });

  it("converts no slot never enabled, which holds slot 1's entry modes when first enabled", () => {
    const session = new Session(pmvPpdIso);
    session.setCompare(true);

    session.setTemperatureMode(temperatureMode.operative);
    session.setHumidityMode(humidityMode.humidityRatio);
    expect(session.slots[2]).toBeNull();
    session.setSlotEnabled(2, true);

    expect(heldSlot(session, 2).temperature.mode).toBe(temperatureMode.operative);
    expect(heldSlot(session, 2).humidity?.mode).toBe(humidityMode.humidityRatio);
  });

  // The invariant ADR-0002 decision 51's amendment names, which the session's
  // readers of the entry modes rest on. A value is entered where the input
  // panel offers it: in a row of the entry modes the slot is in.
  it("keeps every slot that holds values in slot 1's entry modes after every operation", () => {
    const session = new Session(pmvPpdIso);
    // Operative entry stands in for the dry-bulb temperature, so the default
    // 25 °C breaks this bound and a request for the model asks.
    const cooler = withBounds({ tdb: { min: 10, max: 20 } });
    const steps: readonly ((changed: Session) => void)[] = [
      (changed) => changed.slots[0].setEntered(q.tdb, 23),
      (changed) => changed.setTemperatureMode(temperatureMode.operative),
      (changed) => changed.setCompare(true),
      (changed) => heldSlot(changed, 1).setEntered(q.operative_tmp, 27),
      (changed) => changed.setAirSpeedMode(airSpeedMode.corrected),
      (changed) => heldSlot(changed, 1).setEntered(q.vr, 0.3),
      (changed) => changed.setClothingMode(clothingMode.corrected),
      (changed) => heldSlot(changed, 1).setEntered(q.clo_dynamic, 0.9),
      (changed) => changed.setHumidityMode(humidityMode.wetBulb),
      (changed) => heldSlot(changed, 1).setEntered(q.wet_bulb_tmp, 18),
      (changed) => changed.setSlotEnabled(1, false),
      (changed) => changed.setTemperatureMode(temperatureMode.separate),
      (changed) => changed.setSlotEnabled(2, true),
      (changed) => heldSlot(changed, 2).setEntered(q.tr, 29),
      (changed) => changed.setHumidityMode(humidityMode.vapourPressure),
      (changed) => changed.setCompare(false),
      (changed) => changed.setAirSpeedMode(airSpeedMode.uncorrected),
      (changed) => changed.setClothingMode(clothingMode.uncorrected),
      (changed) => changed.setTemperatureMode(temperatureMode.operative),
      (changed) => changed.setSlotEnabled(1, true),
      (changed) => changed.setCompare(true),
      (changed) => changed.setModel(heatIndexRothfusz),
      (changed) => changed.setModel(adaptiveAshrae),
      (changed) => changed.requestModel(pmvPpdIso),
      (changed) => changed.setHumidityMode(humidityMode.dewPoint),
      (changed) => changed.setTemperatureMode(temperatureMode.operative),
      (changed) => changed.setAirSpeedMode(airSpeedMode.corrected),
      (changed) => changed.setClothingMode(clothingMode.corrected),
      (changed) => {
        changed.requestModel(cooler);
        expect(changed.pendingSwitch).not.toBeNull();
      },
      (changed) => changed.declineSwitch(),
      (changed) => changed.requestModel(cooler),
      (changed) => {
        changed.acceptSwitch();
        expect(changed.model).toBe(cooler);
      },
    ];

    for (const step of steps) {
      step(session);
      const held = session.slots.filter((slot) => slot !== null);
      expect(held.map(entryModesOf)).toEqual(held.map(() => session.entryModes));
      expect(held.map((slot) => slot.humidity?.mode)).toEqual(held.map(() => session.humidityMode));
    }
    expect(session.slots.every((slot) => slot !== null)).toBe(true);
    // The switch kept the modes the last steps before it set.
    expect(session.airSpeedMode).toBe(airSpeedMode.corrected);
    expect(session.clothingMode).toBe(clothingMode.corrected);
  });

  // A slot started on Adaptive holds no humidity, and one started on Heat
  // Index no mean radiant temperature, until a switch seeds every slot that
  // holds values; the conversion then finds what it reads in slot 2 as well.
  it.each([
    { from: adaptiveAshrae, change: (changed: Session) => changed.setHumidityMode(humidityMode.dewPoint) },
    { from: heatIndexRothfusz, change: (changed: Session) => changed.setTemperatureMode(temperatureMode.operative) },
  ])("converts slot 2 after a switch from $from.info.label, as a session holding it alone does", ({ from, change }) => {
    const session = new Session(from);
    session.setCompare(true);
    session.setModel(pmvPpdIso);
    const alone = new Session(from);
    alone.setModel(pmvPpdIso);
    change(alone);

    change(session);

    expect(shapeOf(session.slots[0])).toEqual(shapeOf(alone.slots[0]));
    expect(shapeOf(heldSlot(session, 1))).toEqual(shapeOf(alone.slots[0]));
  });

  it("resolves the chart's axes and the picker's choices from the session's entry mode, whichever slot's gate is closed", () => {
    const session = new Session(pmvPpdAshrae);
    session.chart.type = chartType.dynamic;
    const outputs = new Outputs(session);
    session.setCompare(true);
    void outputs.chart;
    // 3 clo is past ASHRAE 55's 2 clo, and no entry-mode change moves it.
    session.slots[0].setEntered(q.clo, 3);

    session.setTemperatureMode(temperatureMode.operative);

    expect(outputs.slots[0].notCalculated).toBe(true);
    expect(outputs.slots[0].lastValid?.slot.temperature.mode).toBe(temperatureMode.separate);
    const alone = new Session(pmvPpdAshrae);
    alone.chart.type = chartType.dynamic;
    alone.setTemperatureMode(temperatureMode.operative);
    const aloneOutputs = new Outputs(alone);
    expect(outputs.drawnAxes).toEqual(aloneOutputs.drawnAxes);
    expect(outputs.chart?.layout).toEqual(aloneOutputs.chart?.layout);
  });

  it("marks a slot whose gate is closed on the new axis, at the value the conversion gives its last valid inputs", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    session.setCompare(true);
    const lastValid = new Map<Quantity, number>([
      [q.tdb, 24],
      [q.tr, 28],
    ]);
    for (const [quantity, value] of lastValid) {
      heldSlot(session, 1).setEntered(quantity, value);
    }
    void outputs.chart;
    // 3 clo is past ISO 7730's 2 clo, and no entry-mode change moves it.
    // Slot 1's gate is closed as well, so no slot's run is in the new mode.
    heldSlot(session, 1).setEntered(q.clo, 3);
    session.slots[0].setEntered(q.clo, 3);

    session.setTemperatureMode(temperatureMode.operative);

    expect(outputs.slots.map((slot) => slot.notCalculated)).toEqual([true, true]);
    const alone = new Session(pmvPpdIso);
    for (const [quantity, value] of lastValid) {
      alone.slots[0].setEntered(quantity, value);
    }
    alone.setTemperatureMode(temperatureMode.operative);
    const aloneChart = new Outputs(alone).chart;
    expect(outputs.chart?.layout).toEqual(aloneChart?.layout);
    expect(markerAt(outputs.chart, 1)).toEqual(markerAt(aloneChart, 0));
  });

  it("moves no marker off the value its slot's input shows while every gate is open", () => {
    const session = threeDifferentSlots(pmvPpdIso);
    const outputs = new Outputs(session);

    for (const mode of [temperatureMode.operative, temperatureMode.separate]) {
      session.setTemperatureMode(mode);
      slotPositions.forEach((position) => {
        expect(outputs.slots[position].notCalculated).toBe(false);
        expect(markerAt(outputs.chart, position)?.x).toBe(heldSlot(session, position).values.get(mode.axis));
      });
    }
  });
});

describe("the compared slots' scans", () => {
  /** The slot's scan in `frameOf`'s frame, of its own last valid run. */
  function expectScansOf(outputs: Outputs, frameOf: (modes: ValueEntryModes, pressure: number) => ScanFrame): void {
    for (const slot of outputs.slots) {
      const last = slot.lastValid;
      if (!last) {
        throw new Error(`${slot.badge.name} has no run`);
      }
      expect(slot.scan).toEqual(scannedField(frameOf(entryModesOf(last.slot), last.atmosphericPressure), last.slot));
    }
  }

  it("are each drawn slot's own of the psychrometric chart while it is on screen", () => {
    const session = sessionComparingThreeSlots(pmvPpdIso);
    heldSlot(session, 1).setEntered(q.tdb, 28);
    session.chart.type = chartType.psychrometric;
    const outputs = new Outputs(session);

    expect(positionsAskedAbout(outputs)).toEqual([0, 1, 2]);
    expectScansOf(outputs, (modes, pressure) => psychrometricScanFrameFor(pmvPpdIso, modes, pressure));
  });

  it("are each drawn slot's own of the dynamic chart while it is on screen", () => {
    const session = sessionComparingThreeSlots(pmvPpdIso);
    heldSlot(session, 1).setEntered(q.tdb, 28);
    session.chart.type = chartType.dynamic;
    const outputs = new Outputs(session);

    expectScansOf(outputs, (modes, pressure) => dynamicScanFrameFor(pmvPpdIso, session.chart.axes, modes, pressure));
  });

  it("are none while a polygons chart is on screen", () => {
    const session = new Session(adaptiveAshrae);
    const outputs = new Outputs(session);

    expect(outputs.chart).not.toBeNull();
    expect(() => outputs.slots[0].scan).toThrow();
  });

  it("change for an edit to slot 1 on its own, the others' kept as the same objects", () => {
    const session = sessionComparingThreeSlots(pmvPpdIso);
    session.chart.type = chartType.psychrometric;
    const outputs = new Outputs(session);
    void outputs.chart;
    const before = outputs.slots.map((slot) => slot.scan);

    session.slots[0].setEntered(q.tdb, 27);
    void outputs.chart;

    const after = outputs.slots.map((slot) => slot.scan);
    expect(after[0]).not.toBe(before[0]);
    expect(after.slice(1)).toEqual(before.slice(1));
    after.slice(1).forEach((scan, index) => expect(scan).toBe(before[index + 1]));
  });
});
