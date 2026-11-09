/**
 * The drawn runs (ADR-0002 decision 64, rule 3): the compared slots the chart
 * is drawn of, each as it is with the violation rows of its run (decision 84,
 * rule 8), which the Input summary lists. Asserted at the seam the other session tests use — a session in, its
 * computation out, with no component — and nothing flushes, for the reason
 * `compute.svelte.test.ts` gives.
 */
import { describe, expect, it } from "vitest";
import { inputSummary } from "$lib/core/inputSummary";
import { formatNumber } from "$lib/core/numberFormat";
import { page } from "$lib/core/page";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities, type Quantity } from "$lib/core/quantities";
import { displayUnitFor, labelWithUnit } from "$lib/core/units";
import { unitSystem } from "$lib/core/unitSystem";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Computation } from "./compute.svelte";
import { Session } from "./session.svelte";
import { heldSlot, sessionComparingThreeSlots, shapeOf } from "./sessionTestReaders";

const q = quantities;
/** Far above any model's `tdb` bound. */
const DRY_BULB_TEMPERATURE_OUT_OF_RANGE = 200;
const LOWER_ATMOSPHERIC_PRESSURE = 90_000;

/** The line of `quantity` at the SI `value`, as the panel labels and shows it in SI. */
function lineOf(quantity: Quantity, value: number): string {
  const unit = displayUnitFor(quantity, unitSystem.si);
  return `${labelWithUnit(quantity, unit)}: ${formatNumber(unit.fromSi(value))}`;
}

/** The lines of `computation`'s drawn runs on `session`'s model, in SI, as Standard gives them. */
function summaryLinesOf(session: Session, computation: Computation): string[] {
  return inputSummary({ model: session.model, runs: computation.drawnRuns, unitSystem: unitSystem.si, bands: null }).flat();
}

/** A session on `pmvPpdIso` whose slot 1 was read on its defaults and then written a `tdb` past every bound. */
function sessionWrittenOutOfRange() {
  const session = new Session(pmvPpdIso);
  const computation = new Computation(session);
  void computation.drawnRuns;
  session.slots[0].setEntered(q.tdb, DRY_BULB_TEMPERATURE_OUT_OF_RANGE);
  return { session, computation };
}

describe("Computation.drawnRuns", () => {
  it("is slot 1's run alone for a session on its defaults", () => {
    const session = new Session(pmvPpdIso);
    const runs = new Computation(session).drawnRuns;
    expect(runs).toHaveLength(1);
    expect(runs[0].label).toBeUndefined();
    expect(runs[0].slot).toEqual(shapeOf(session.slots[0]));
    expect(runs[0].atmosphericPressure).toBe(DEFAULT_ATMOSPHERIC_PRESSURE);
  });

  it("is each of three compared slots' run in slot order, one written out of range too", () => {
    const session = sessionComparingThreeSlots(pmvPpdIso);
    expect(new Computation(session).drawnRuns.map((run) => run.label)).toEqual(["Input 1", "Input 2", "Input 3"]);

    heldSlot(session, 2).setEntered(q.tdb, DRY_BULB_TEMPERATURE_OUT_OF_RANGE);
    expect(new Computation(session).drawnRuns.map((run) => run.label)).toEqual(["Input 1", "Input 2", "Input 3"]);
  });

  it("names each run as its slot's appearance does: unnamed with Compare off, named with it on whatever is drawn", () => {
    const session = new Session(pmvPpdIso);
    const computation = new Computation(session);
    const labelsOf = () => computation.drawnRuns.map((run) => run.label);
    const appearanceLabels = () => computation.slots.map((slot) => slot.appearance.label);

    session.setCompare(true);
    session.setSlotEnabled(1, false);
    expect(labelsOf()).toEqual(["Input 1"]);
    expect(labelsOf()).toEqual(appearanceLabels());

    session.setCompare(false);
    expect(labelsOf()).toEqual([undefined]);
    expect(labelsOf()).toEqual(appearanceLabels());
  });

  it("names no run on Explore, whatever Compare holds", () => {
    const session = sessionComparingThreeSlots(pmvPpdIso);
    session.setAddress({ page: page.explore, model: pmvPpdIso });
    expect(new Computation(session).drawnRuns.map((run) => run.label)).toEqual([undefined]);
  });

  it("is the slot as it is, so the summary lists a value written out of range", () => {
    const { session, computation } = sessionWrittenOutOfRange();
    expect(computation.drawnRuns[0].slot).toEqual(shapeOf(session.slots[0]));
    expect(summaryLinesOf(session, computation)).toContain(lineOf(q.tdb, DRY_BULB_TEMPERATURE_OUT_OF_RANGE));
  });

  it("is at the session's atmospheric pressure", () => {
    const { session, computation } = sessionWrittenOutOfRange();
    session.atmosphericPressure = LOWER_ATMOSPHERIC_PRESSURE;
    expect(computation.drawnRuns[0].atmosphericPressure).toBe(LOWER_ATMOSPHERIC_PRESSURE);
    expect(summaryLinesOf(session, computation)).toContain(lineOf(q.p_atm, LOWER_ATMOSPHERIC_PRESSURE));
  });

  it("carries each compared slot's violation rows, none for a slot whose run broke nothing", () => {
    const session = sessionComparingThreeSlots(pmvPpdIso);
    const computation = new Computation(session);
    session.commitEntry(1, q.rh, 95);

    const runs = computation.drawnRuns;
    expect(runs.map((run) => run.violations)).toEqual(computation.slots.map((slot) => slot.violations));
    expect(runs.map((run) => run.violations.map((row) => row.bounded))).toEqual([[], [q.pa], []]);
  });

  it("is the slot the new model runs on after a model switch", () => {
    const { session, computation } = sessionWrittenOutOfRange();
    session.setModel(pmvPpdAshrae);
    expect(computation.drawnRuns.map((run) => run.slot)).toEqual([shapeOf(session.slots[0])]);
  });
});
