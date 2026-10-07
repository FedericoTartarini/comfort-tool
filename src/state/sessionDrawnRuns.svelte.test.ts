/**
 * The drawn runs (ADR-0002 decision 64, rule 3): the compared slots the chart
 * is drawn of, each as its last valid run left it, which the Input summary
 * lists. Asserted at the seam the other session tests use — a session in, its
 * outputs out, with no component — and nothing flushes, for the reason
 * `compute.svelte.test.ts` gives.
 */
import { describe, expect, it } from "vitest";
import { temperatureMode } from "$lib/core/entryModes";
import { inputSummary } from "$lib/core/inputSummary";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities, type Quantity } from "$lib/core/quantities";
import { slotBadges } from "$lib/core/slotBadge";
import { displayUnitFor, labelWithUnit } from "$lib/core/units";
import { unitSystem } from "$lib/core/unitSystem";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Outputs } from "./compute.svelte";
import { Session } from "./session.svelte";
import { heldSlot, sessionComparingThreeSlots, shapeOf } from "./sessionTestReaders";

const q = quantities;
/** Far above any model's `tdb` bound. */
const OUT_OF_RANGE_TDB = 200;
const LOWER_PRESSURE = 90_000;

/** The line of `quantity` at `value`, as the panel labels it in SI. */
function lineOf(quantity: Quantity, value: number): string {
  return `${labelWithUnit(quantity, displayUnitFor(quantity, unitSystem.si))}: ${value}`;
}

/** The lines of `outputs`' drawn runs on `session`'s model, in SI, as Standard gives them. */
function summaryLinesOf(session: Session, outputs: Outputs): string[] {
  return inputSummary({ model: session.model, runs: outputs.drawnRuns, unitSystem: unitSystem.si, bands: null }).flat();
}

/** A session on `pmvPpdIso` whose slot 1 ran on its defaults and then took a `tdb` out of range. */
function sessionKeepingItsRun() {
  const session = new Session(pmvPpdIso);
  const outputs = new Outputs(session);
  const ran = outputs.drawnRuns;
  session.slots[0].setEntered(q.tdb, OUT_OF_RANGE_TDB);
  return { session, outputs, ran };
}

describe("Outputs.drawnRuns", () => {
  it("is slot 1's run alone for a session on its defaults", () => {
    const session = new Session(pmvPpdIso);
    const runs = new Outputs(session).drawnRuns;
    expect(runs).toHaveLength(1);
    expect(runs[0].name).toBe(slotBadges[0].name);
    expect(runs[0].slot).toEqual(shapeOf(session.slots[0]));
    expect(runs[0].atmosphericPressure).toBe(DEFAULT_ATMOSPHERIC_PRESSURE);
  });

  it("is each of three compared slots' run in slot order, and leaves out a compared slot never calculated", () => {
    const session = sessionComparingThreeSlots(pmvPpdIso);
    expect(new Outputs(session).drawnRuns.map((run) => run.name)).toEqual(slotBadges.map((badge) => badge.name));

    const neverCalculated = sessionComparingThreeSlots(pmvPpdIso);
    heldSlot(neverCalculated, 2).setEntered(q.tdb, OUT_OF_RANGE_TDB);
    expect(new Outputs(neverCalculated).drawnRuns.map((run) => run.name)).toEqual([slotBadges[0].name, slotBadges[1].name]);
  });

  it("keeps a slot's run while a value is out of range, so the summary lists the earlier value and not the entry", () => {
    const { session, outputs, ran } = sessionKeepingItsRun();
    expect(outputs.slots[0].notCalculated).toBe(true);
    expect(outputs.drawnRuns).toEqual(ran);
    const lines = summaryLinesOf(session, outputs);
    expect(lines).toContain(lineOf(q.tdb, 25));
    expect(lines.some((line) => line.includes(String(OUT_OF_RANGE_TDB)))).toBe(false);
  });

  it("keeps a slot's run in the entry mode it was calculated in when the mode changes while it is out of range", () => {
    const { session, outputs } = sessionKeepingItsRun();
    session.setTemperatureMode(temperatureMode.operative);
    expect(outputs.slots[0].notCalculated).toBe(true);
    expect(outputs.drawnRuns[0].slot.temperature.mode).toBe(temperatureMode.separate);
    const lines = summaryLinesOf(session, outputs);
    expect(lines).toContain(lineOf(q.tdb, 25));
    expect(lines).toContain(lineOf(q.tr, 25));
    expect(lines.some((line) => line.startsWith(q.operative_tmp.label))).toBe(false);
  });

  it("keeps a slot's run at its own pressure when the pressure changes while it is out of range", () => {
    const { session, outputs } = sessionKeepingItsRun();
    session.atmosphericPressure = LOWER_PRESSURE;
    expect(outputs.drawnRuns[0].atmosphericPressure).toBe(DEFAULT_ATMOSPHERIC_PRESSURE);
    expect(summaryLinesOf(session, outputs)).toContain(lineOf(q.p_atm, DEFAULT_ATMOSPHERIC_PRESSURE));
  });

  it("drops the runs of the model left at a model switch", () => {
    const { session, outputs } = sessionKeepingItsRun();
    session.setModel(pmvPpdAshrae);
    expect(outputs.drawnRuns).toEqual([]);
  });
});
