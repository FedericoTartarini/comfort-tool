/**
 * The drawn runs (ADR-0002 decision 64, rule 3): the compared slots the chart
 * is drawn of, each as it is, which the Input summary lists. Asserted at the seam the other session tests use — a session in, its
 * outputs out, with no component — and nothing flushes, for the reason
 * `compute.svelte.test.ts` gives.
 */
import { describe, expect, it } from "vitest";
import { inputSummary } from "$lib/core/inputSummary";
import { page } from "$lib/core/page";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities, type Quantity } from "$lib/core/quantities";
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

/** A session on `pmvPpdIso` whose slot 1 was read on its defaults and then written a `tdb` past every bound. */
function sessionWrittenOutOfRange() {
  const session = new Session(pmvPpdIso);
  const outputs = new Outputs(session);
  void outputs.drawnRuns;
  session.slots[0].setEntered(q.tdb, OUT_OF_RANGE_TDB);
  return { session, outputs };
}

describe("Outputs.drawnRuns", () => {
  it("is slot 1's run alone for a session on its defaults", () => {
    const session = new Session(pmvPpdIso);
    const runs = new Outputs(session).drawnRuns;
    expect(runs).toHaveLength(1);
    expect(runs[0].name).toBeUndefined();
    expect(runs[0].slot).toEqual(shapeOf(session.slots[0]));
    expect(runs[0].atmosphericPressure).toBe(DEFAULT_ATMOSPHERIC_PRESSURE);
  });

  it("is each of three compared slots' run in slot order, one written out of range too", () => {
    const session = sessionComparingThreeSlots(pmvPpdIso);
    expect(new Outputs(session).drawnRuns.map((run) => run.name)).toEqual(["Input 1", "Input 2", "Input 3"]);

    heldSlot(session, 2).setEntered(q.tdb, OUT_OF_RANGE_TDB);
    expect(new Outputs(session).drawnRuns.map((run) => run.name)).toEqual(["Input 1", "Input 2", "Input 3"]);
  });

  it("names each run as its slot's badge does: unnamed with Compare off, named with it on whatever is drawn", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    const namesOf = () => outputs.drawnRuns.map((run) => run.name);
    const badgeNames = () => outputs.slots.map((slot) => slot.badge.name);

    session.setCompare(true);
    session.setSlotEnabled(1, false);
    expect(namesOf()).toEqual(["Input 1"]);
    expect(namesOf()).toEqual(badgeNames());

    session.setCompare(false);
    expect(namesOf()).toEqual([undefined]);
    expect(namesOf()).toEqual(badgeNames());
  });

  it("names no run on Explore, whatever Compare holds", () => {
    const session = sessionComparingThreeSlots(pmvPpdIso);
    session.setAddress({ page: page.explore, model: pmvPpdIso });
    expect(new Outputs(session).drawnRuns.map((run) => run.name)).toEqual([undefined]);
  });

  it("is the slot as it is, so the summary lists a value written out of range", () => {
    const { session, outputs } = sessionWrittenOutOfRange();
    expect(outputs.drawnRuns[0].slot).toEqual(shapeOf(session.slots[0]));
    expect(summaryLinesOf(session, outputs)).toContain(lineOf(q.tdb, OUT_OF_RANGE_TDB));
  });

  it("is at the session's pressure", () => {
    const { session, outputs } = sessionWrittenOutOfRange();
    session.atmosphericPressure = LOWER_PRESSURE;
    expect(outputs.drawnRuns[0].atmosphericPressure).toBe(LOWER_PRESSURE);
    expect(summaryLinesOf(session, outputs)).toContain(lineOf(q.p_atm, LOWER_PRESSURE));
  });

  it("is the slot the new model runs on after a model switch", () => {
    const { session, outputs } = sessionWrittenOutOfRange();
    session.setModel(pmvPpdAshrae);
    expect(outputs.drawnRuns.map((run) => run.slot)).toEqual([shapeOf(session.slots[0])]);
  });
});
