/**
 * The session is built from a written session and reads itself out as one
 * (ADR-0002 decision 63, rules 1 and 10), asserted at the seam the other
 * session tests use: a session in, its state and its outputs out, with no
 * component and no router. The expected state after a round trip is the
 * session's own state before it, read through its public readers, so a
 * field the read-out drops is caught even where building would drop it too.
 *
 * Nothing flushes, for the reason `compute.svelte.test.ts` gives.
 */
import { describe, expect, it } from "vitest";
import { chartType } from "$lib/core/chartType";
import { airSpeedMode, clothingMode, humidityMode, temperatureMode } from "$lib/core/entryModes";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities } from "$lib/core/quantities";
import { unitSystem } from "$lib/core/unitSystem";
import { startingSession } from "$lib/core/writtenSession";
import { registeredModels } from "$lib/models";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Outputs } from "./compute.svelte";
import { Session, slotPositions, type ChartState } from "./session.svelte";
import { expectEverySlotInSessionEntryModes, heldSlot, sessionComparingThreeSlots, shapeOf } from "./sessionTestReaders";

const q = quantities;
const [airSpeedControl] = pmvPpdAshrae.options;
/** A pressure below the bound's 30 000 Pa (ADR-0002 decision 49). */
const PRESSURE_OUT_OF_RANGE = 20000;

/** A new session built from what `session` reads itself out as. */
function rebuilt(session: Session): Session {
  return new Session(session.toWrittenSession());
}

/** A chart's settings, read through its public readers. */
function settingsOf(chart: ChartState) {
  return { type: chart.type, axes: chart.axes, bands: chart.bands };
}

/** Everything the session holds that a page reads, through its public readers. */
function stateOf(session: Session) {
  return {
    page: session.page,
    model: session.model,
    unitSystem: session.unitSystem,
    atmosphericPressure: session.atmosphericPressure,
    compare: session.compare,
    enabled: slotPositions.map((position) => session.isSlotEnabled(position)),
    slots: session.slots.map((slot) => slot && shapeOf(slot)),
    chart: settingsOf(session.chart),
    pendingSwitch: session.pendingSwitch,
  };
}

/** What the page shows of the outputs: each compared slot's result, gate and rows, and the chart. */
function shownOf(outputs: Outputs) {
  return {
    atmosphericPressureOutOfRange: outputs.atmosphericPressureOutOfRange,
    slots: outputs.slots.map((slot) => ({
      position: slot.position,
      result: slot.result,
      notCalculated: slot.notCalculated,
      outOfRangeQuantities: slot.outOfRangeQuantities,
      violations: slot.violations,
    })),
    chart: outputs.chart,
  };
}

/**
 * Three slots holding different values with Compare on, every entry group off
 * its default mode, an option ticked, an entered value and the pressure out
 * of range, IP, and the chart type, the axes and an edited Band list on PMV
 * (ASHRAE 55), left for PMV (ISO 7730), and on PMV (ISO 7730).
 */
function editedSession(): Session {
  const session = sessionComparingThreeSlots(pmvPpdAshrae);
  heldSlot(session, 1).setOption(airSpeedControl, true);
  session.chart.type = chartType.dynamic;
  session.chart.setAxes({ y: q.rh });
  session.chart.moveBandEdge(3, 0.4);
  session.chart.setBandColor(1, undefined);
  session.setModel(pmvPpdIso);
  session.chart.type = chartType.dynamic;
  session.chart.setAxes({ x: q.met });
  session.chart.addBand(2);
  session.chart.setBandLabel(0, "Freezing");
  session.setTemperatureMode(temperatureMode.operative);
  session.setAirSpeedMode(airSpeedMode.corrected);
  session.setClothingMode(clothingMode.corrected);
  session.setHumidityMode(humidityMode.dewPoint);
  heldSlot(session, 1).setEntered(q.operative_tmp, 27);
  heldSlot(session, 2).setEntered(q.met, 1.4);
  // Past PMV (ISO 7730)'s 30 °C: the gate closes on slot 3.
  heldSlot(session, 2).setEntered(q.operative_tmp, 60);
  session.unitSystem = unitSystem.ip;
  session.atmosphericPressure = PRESSURE_OUT_OF_RANGE;
  return session;
}

describe("a session built on a model alone", () => {
  it("is the session built on the model's starting written session, and reads itself out as that, for every registered model", () => {
    for (const model of registeredModels) {
      const onModel = new Session(model);
      const onStart = new Session(startingSession(model));

      expect(stateOf(onStart), model.info.label).toEqual(stateOf(onModel));
      expect(shownOf(new Outputs(onStart)), model.info.label).toEqual(shownOf(new Outputs(onModel)));
      expect(onModel.toWrittenSession(), model.info.label).toEqual(startingSession(model));
    }
  });
});

describe("a session read out and built again", () => {
  it("has the same state, the chart settings of the model it left included", () => {
    const session = editedSession();
    const again = rebuilt(session);

    expect(stateOf(again)).toEqual(stateOf(session));
    expect(again.toWrittenSession()).toEqual(session.toWrittenSession());

    session.setModel(pmvPpdAshrae);
    again.setModel(pmvPpdAshrae);
    expect(stateOf(again)).toEqual(stateOf(session));
  });

  it("gives the same outputs, with the pressure out of range and back in it", () => {
    const session = editedSession();
    const again = rebuilt(session);
    const outputs = new Outputs(session);
    const againOutputs = new Outputs(again);

    expect(shownOf(againOutputs)).toEqual(shownOf(outputs));
    expect(againOutputs.atmosphericPressureOutOfRange).toBe(true);

    session.atmosphericPressure = DEFAULT_ATMOSPHERIC_PRESSURE;
    again.atmosphericPressure = DEFAULT_ATMOSPHERIC_PRESSURE;
    expect(shownOf(againOutputs)).toEqual(shownOf(outputs));
    expect(againOutputs.slots.map((slot) => slot.notCalculated)).toEqual([false, false, true]);
    expect(againOutputs.chart).not.toBeNull();
  });

  it("keeps every slot that holds values in slot 1's entry modes", () => {
    expectEverySlotInSessionEntryModes(rebuilt(editedSession()));
  });

  it("brings slots 2 and 3 back held and enabled, and held and disabled, each holding its own values", () => {
    const session = sessionComparingThreeSlots(pmvPpdIso);
    heldSlot(session, 1).setEntered(q.tdb, 28);
    heldSlot(session, 2).setEntered(q.tdb, 22);
    session.setSlotEnabled(2, false);

    const again = rebuilt(session);

    expect(again.isSlotEnabled(1)).toBe(true);
    expect(again.isSlotEnabled(2)).toBe(false);
    expect(again.comparedPositions).toEqual([0, 1]);
    again.setSlotEnabled(2, true);
    expect(shapeOf(heldSlot(again, 2))).toEqual(shapeOf(heldSlot(session, 2)));
  });

  it("brings a slot never enabled back holding nothing, so that enabling it copies slot 1", () => {
    const session = new Session(pmvPpdIso);
    session.setCompare(true);
    session.slots[0].setEntered(q.tdb, 24);

    const again = rebuilt(session);

    expect(again.slots[2]).toBeNull();
    expect(again.isSlotEnabled(2)).toBe(false);
    again.setSlotEnabled(2, true);
    expect(shapeOf(heldSlot(again, 2))).toEqual(shapeOf(again.slots[0]));
  });

  it("with Compare never switched on enables slot 2 at the first switch-on, as a session on the defaults does", () => {
    const session = new Session(pmvPpdIso);
    session.slots[0].setEntered(q.tdb, 24);

    const again = rebuilt(session);
    again.setCompare(true);

    expect(again.isSlotEnabled(1)).toBe(true);
    expect(shapeOf(heldSlot(again, 1))).toEqual(shapeOf(again.slots[0]));
  });
});

describe("Session.toWrittenSession", () => {
  it("holds no chart settings of a model the session has never been on, which gets its defaults when first opened", () => {
    const session = new Session(pmvPpdIso);
    session.chart.type = chartType.dynamic;

    expect([...session.toWrittenSession().charts.keys()]).toEqual([pmvPpdIso]);
    const again = rebuilt(session);
    again.setModel(pmvPpdAshrae);
    expect(settingsOf(again.chart)).toEqual(settingsOf(new Session(pmvPpdAshrae).chart));
  });

  it("holds every edit after it is made, so that something following it follows the session", () => {
    const session = new Session(pmvPpdAshrae);
    const written = $derived(session.toWrittenSession());
    // Read through a closure, as a derivation elsewhere reads it.
    const followed = () => written;
    const edits: readonly (() => void)[] = [
      () => session.slots[0].setEntered(q.tdb, 28),
      () => session.slots[0].setOption(airSpeedControl, true),
      () => session.setTemperatureMode(temperatureMode.operative),
      () => session.setAirSpeedMode(airSpeedMode.corrected),
      () => session.setClothingMode(clothingMode.corrected),
      () => session.setHumidityMode(humidityMode.dewPoint),
      () => session.setCompare(true),
      () => session.setSlotEnabled(2, true),
      () => session.setSlotEnabled(1, false),
      () => heldSlot(session, 2).setEntered(q.met, 1.4),
      () => (session.unitSystem = unitSystem.ip),
      () => (session.atmosphericPressure = 90000),
      () => (session.chart.type = chartType.dynamic),
      () => session.chart.setAxes({ y: q.met }),
      () => session.chart.moveBandEdge(3, 0.4),
      () => session.setModel(pmvPpdIso),
    ];

    for (const edit of edits) {
      const before = followed();
      edit();
      expect(followed()).not.toEqual(before);
      expect(followed()).toEqual(session.toWrittenSession());
    }
    expect([...followed().charts.keys()]).toEqual([pmvPpdAshrae, pmvPpdIso]);
  });
});
