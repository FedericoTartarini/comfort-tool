/**
 * The computation keeps nothing (ADR-0002 decision 84, rule 9): each run's
 * outputs, the violation rows and the chart are derived from the slots as they
 * are, and a value a writer let through is run, the library's rows showing it
 * as a violation. This is the seam a session goes into and the computation
 * comes out of, with no component and no router.
 *
 * Nothing flushes: the computation is a derivation, so reading it after a
 * change is what recomputes it, and a test that needed a flush would mean an
 * effect had come back.
 */
import { describe, expect, it } from "vitest";
import { violationRows, warningFor } from "$lib/core/applicability";
import type { ChartSpec, PointTrace } from "$lib/core/charts/chartSpec";
import { chartType } from "$lib/core/chartType";
import { airSpeedMode, temperatureMode } from "$lib/core/entryModes";
import type { LibraryInputs, ModelDeclaration } from "$lib/core/modelDeclaration";
import { runOn } from "$lib/core/modelRun";
import { quantities } from "$lib/core/quantities";
import { unitSystem } from "$lib/core/unitSystem";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Computation, type SlotComputation } from "./compute.svelte";
import { Session } from "./session.svelte";
import { heldSlot, outputValueOf } from "./sessionTestReaders";

const q = quantities;

/** Read everything the page reads, which is what makes a derivation recompute. */
function readEverything(computation: Computation): void {
  void computation.slots[0].outputs;
  void computation.slots[0].violations;
  void computation.chart;
}

/** The slot marker the chart draws, which every chart of a slot carries. */
function markerOf(chart: ChartSpec | null): PointTrace | undefined {
  return chart?.traces.find((trace): trace is PointTrace => trace.kind === "point");
}

/** `pmvPpdIso`, counting every call the computation makes of it — for a slot's outputs and for the chart. */
function modelCountingRuns(): { model: ModelDeclaration; runs: () => number } {
  let runs = 0;
  const model = {
    ...pmvPpdIso,
    run: (inputs: LibraryInputs) => {
      runs += 1;
      return pmvPpdIso.run(inputs);
    },
  } satisfies ModelDeclaration;
  return { model, runs: () => runs };
}

/** The model's run on the session's slot 1 as it is now, made apart from the computation. */
function runOfFirstSlot(session: Session) {
  return runOn(heldSlot(session, 0).toSlot(), session.model, session.atmosphericPressure);
}

/** The sentences a slot's violation rows show in its limits popover. */
function sentencesOf(slot: SlotComputation): string[] {
  return slot.violations.map((row) => warningFor(row, unitSystem.si));
}

/**
 * PMV (ASHRAE 55) at 0.9 m/s, past what the standard allows occupants without local control of the air speed:
 * 0.64 m/s at the defaults' 25 °C operative temperature.
 */
function ashraeWithoutControlAt09(): { session: Session; computation: Computation } {
  const session = new Session(pmvPpdAshrae);
  const computation = new Computation(session);
  session.commitEntry(0, q.v, 0.9);
  return { session, computation };
}

describe("Computation", () => {
  it("derives outputs and a chart from a valid session", () => {
    const computation = new Computation(new Session(pmvPpdIso));

    expect(outputValueOf(computation.slots[0].outputs, q.pmv)).toBeTypeOf("number");
    expect(computation.chart?.traces.length).toBeGreaterThan(0);
  });

  it("after any commit, the outputs and the violation rows are the run of the slot as it is", () => {
    const session = new Session(pmvPpdIso);
    const computation = new Computation(session);
    void computation.slots[0].outputs;

    // Written as it is, then cut to ISO 7730's 30 °C, then a humidity that breaks the vapour-pressure row.
    for (const [quantity, value] of [[q.tdb, 26], [q.tdb, 35], [q.rh, 95]] as const) {
      expect(session.commitEntry(0, quantity, value).kind).not.toBe("refused");
      const run = runOfFirstSlot(session);

      expect(computation.slots[0].outputs).toEqual(run);
      expect(computation.slots[0].violations).toEqual(violationRows(session.model, run, session.entryModes));
    }
    expect(heldSlot(session, 0).values.get(q.tdb)).toBe(30);
    expect(computation.slots[0].violations.map((row) => row.quantity)).toEqual([q.pa]);
  });

  it("calculates a run that breaks PMV (ASHRAE 55)'s air-speed rule without local control, with its violation rows", () => {
    const { computation } = ashraeWithoutControlAt09();

    expect(outputValueOf(computation.slots[0].outputs, q.pmv)).toBeTypeOf("number");
    expect(computation.slots[0].violations.map(({ quantity, bounded }) => [quantity, bounded])).toEqual([[q.v, q.vr]]);
    expect(computation.chart?.traces.length).toBeGreaterThan(0);
  });

  it("runs a value a writer let through, and the library's rows show it as a violation", () => {
    const session = new Session(pmvPpdIso);
    const computation = new Computation(session);
    void computation.slots[0].outputs;

    // Past ISO 7730's 30 °C, written past the commit's judgement.
    session.slots[0].setEntered(q.tdb, 35);

    expect(computation.slots[0].outputs).toEqual(runOfFirstSlot(session));
    expect(outputValueOf(computation.slots[0].outputs, q.pmv)).toBeTypeOf("number");
    expect(computation.slots[0].violations.map((row) => row.quantity)).toContain(q.tdb);
  });

  it("changes the chart's axis range and not the outputs when the unit system changes", () => {
    const session = new Session(pmvPpdIso);
    const computation = new Computation(session);
    const before = computation.slots[0].outputs;
    const range = computation.chart?.layout.x.range;

    session.unitSystem = unitSystem.ip;

    expect(computation.chart?.layout.x.range).not.toEqual(range);
    expect(computation.slots[0].outputs).toEqual(before);
  });

  it("follows the chart type and the chosen axes, and not the outputs", () => {
    const session = new Session(pmvPpdIso);
    const computation = new Computation(session);
    const before = computation.slots[0].outputs;

    session.chart.type = chartType.dynamic;

    // The dynamic chart starts on the air speed, the psychrometric one on the humidity ratio.
    expect(computation.chart?.layout.y.title).toContain(q.v.label);
    const yTitle = computation.chart?.layout.y.title;

    session.chart.setAxes({ y: q.rh });

    expect(computation.chart?.layout.y.title).not.toBe(yTitle);
    expect(computation.chart?.layout.y.title).toContain(q.rh.label);
    expect(computation.slots[0].outputs).toBe(before);
  });

  it("offers the axes of the dynamic chart it draws, in the slot's entry mode", () => {
    const session = new Session(pmvPpdIso);
    const computation = new Computation(session);
    session.chart.type = chartType.dynamic;

    expect(computation.drawnAxes?.selected).toEqual({ x: q.tdb, y: q.v });
    expect(computation.drawnAxes?.choices).toContain(q.tdb);

    session.setTemperatureMode(temperatureMode.operative);

    expect(computation.drawnAxes?.selected).toEqual({ x: q.operative_tmp, y: q.v });
    expect(computation.drawnAxes?.choices).toContain(q.operative_tmp);
    expect(computation.drawnAxes?.choices).not.toContain(q.tdb);
    expect(computation.chart?.layout.x.title).toContain(q.operative_tmp.label);
  });

  it("offers no axes when no dynamic chart is drawn", () => {
    const session = new Session(pmvPpdIso);
    const computation = new Computation(session);
    session.chart.type = chartType.psychrometric;

    expect(computation.chart).not.toBeNull();
    expect(computation.drawnAxes).toBeNull();

    session.chart.type = chartType.dynamic;
    expect(computation.drawnAxes).not.toBeNull();
  });

  it("marks the slot as it is", () => {
    const session = new Session(pmvPpdIso);
    const computation = new Computation(session);
    void computation.chart;

    session.commitEntry(0, q.tdb, 27);

    expect(markerOf(computation.chart)?.x).toBe(27);
  });

  /**
   * Entering lands a whole slot, setting keys to values they already hold;
   * the reactive map raises nothing for those, so one value costs one pass.
   */
  it("runs the model and the scan once for an entered value, and not at all for a value the slot already holds", () => {
    const { model, runs } = modelCountingRuns();
    const session = new Session(model);
    session.chart.type = chartType.dynamic;
    const computation = new Computation(session);
    readEverything(computation);
    const onePass = runs();

    session.slots[0].setEntered(q.tdb, 24);
    readEverything(computation);
    expect(runs()).toBe(2 * onePass);

    session.slots[0].setEntered(q.tdb, 24);
    readEverything(computation);
    expect(runs()).toBe(2 * onePass);
  });

  it("reads no run of the previous model when a model is set", () => {
    const session = new Session(pmvPpdIso);
    session.slots[0].setEntered(q.rh, 95);
    const computation = new Computation(session);
    expect(computation.slots[0].violations.map((row) => row.quantity)).toEqual([q.pa]);

    // Setting the model, which never asks and never adjusts: ISO 7730's own
    // default temperature is below the Rothfusz regression's floor, and is run.
    session.setModel(heatIndexRothfusz);

    expect(computation.slots[0].outputs).toEqual(runOfFirstSlot(session));
    expect(outputValueOf(computation.slots[0].outputs, q.pmv)).toBeUndefined();
    expect(computation.slots[0].violations.map((row) => row.quantity)).toEqual([q.tdb]);
    expect(computation.chart).not.toBeNull();
  });

  it("shows the new model's own outputs after a commit", () => {
    const session = new Session(pmvPpdIso);
    const computation = new Computation(session);
    void computation.slots[0].outputs;

    session.setModel(heatIndexRothfusz);
    session.commitEntry(0, q.tdb, 30);

    expect(computation.slots[0].violations).toEqual([]);
    expect(outputValueOf(computation.slots[0].outputs, q.hi)).toBeTypeOf("number");
    expect(outputValueOf(computation.slots[0].outputs, q.pmv)).toBeUndefined();
    expect(computation.chart?.traces.length).toBeGreaterThan(0);
  });
});

describe("the violation rows, in the words of the limits popover", () => {
  it("are none at the defaults", () => {
    expect(new Computation(new Session(pmvPpdAshrae)).slots[0].violations).toEqual([]);
  });

  it("name PMV (ASHRAE 55)'s air-speed limit without local control", () => {
    const { computation } = ashraeWithoutControlAt09();

    expect(sentencesOf(computation.slots[0])).toEqual(["Relative air speed must be ≤ 0.64 m/s"]);
  });

  it("name the same limit under relative air speed entry", () => {
    const { session, computation } = ashraeWithoutControlAt09();

    session.setAirSpeedMode(airSpeedMode.corrected);

    expect(sentencesOf(computation.slots[0])).toEqual(["Relative air speed must be ≤ 0.64 m/s"]);
  });

  it("name PMV (ISO 7730)'s vapour pressure over 2 700 Pa, which has no row on the panel", () => {
    const session = new Session(pmvPpdIso);
    const computation = new Computation(session);
    session.commitEntry(0, q.rh, 95);

    expect(sentencesOf(computation.slots[0])).toEqual(["Water vapour partial pressure must be 0 – 2.7 kPa"]);
  });

  it("name an output's broken bound, as an input's", () => {
    const session = new Session(pmvPpdIso);
    const computation = new Computation(session);
    for (const [quantity, value] of [[q.tdb, 30], [q.tr, 40], [q.met, 2], [q.clo, 1]] as const) {
      session.commitEntry(0, quantity, value);
    }

    expect(sentencesOf(computation.slots[0])).toEqual(["PMV must be -2 – 2"]);
  });

  it("under Compare, are only the rows of the slot whose run broke a bound", () => {
    const session = new Session(pmvPpdIso);
    session.setCompare(true);
    const computation = new Computation(session);

    session.commitEntry(1, q.rh, 95);

    const [first, second] = computation.slots;
    expect(sentencesOf(first)).toEqual([]);
    expect(sentencesOf(second)).toEqual(["Water vapour partial pressure must be 0 – 2.7 kPa"]);
  });
});
