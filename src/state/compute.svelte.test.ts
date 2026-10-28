/**
 * The outputs keep nothing (ADR-0002 decision 84, rule 9): the result, the
 * violation rows and the chart are derived from the slots as they are, and a
 * value a writer let through is run, the library's rows showing it as a
 * violation. This is the seam a session goes into and the outputs come out
 * of, with no component and no router.
 *
 * Nothing flushes: the outputs are a derivation, so reading one after a change
 * is what recomputes it, and a test that needed a flush would mean an effect
 * had come back.
 */
import { describe, expect, it } from "vitest";
import { violationRows, warningFor } from "$lib/core/applicability";
import type { ChartSpec, PointTrace } from "$lib/core/charts/chartSpec";
import { chartType } from "$lib/core/chartType";
import { airSpeedMode, temperatureMode } from "$lib/core/entryModes";
import type { RegisteredModel, Values } from "$lib/core/modelDeclaration";
import { runOn } from "$lib/core/modelRun";
import { quantities } from "$lib/core/quantities";
import { unitSystem } from "$lib/core/unitSystem";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Outputs, type SlotOutputs } from "./compute.svelte";
import { Session } from "./session.svelte";
import { heldSlot, resultValueOf } from "./sessionTestReaders";

const q = quantities;

/** Read everything the page reads, which is what makes a derivation recompute. */
function readEverything(outputs: Outputs): void {
  void outputs.slots[0].result;
  void outputs.slots[0].violations;
  void outputs.chart;
}

/** The slot marker the chart draws, which every chart of a slot carries. */
function markerOf(chart: ChartSpec | null): PointTrace | undefined {
  return chart?.traces.find((trace): trace is PointTrace => trace.kind === "point");
}

/** `pmvPpdIso`, counting every call the outputs make of it — the result's and the chart's. */
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

/** The model's run on the session's slot 1 as it is now, made apart from the outputs. */
function runOfFirstSlot(session: Session) {
  return runOn(heldSlot(session, 0).toSlot(), session.model, session.atmosphericPressure);
}

/** The sentences a slot's violation rows show in its limits popover. */
function sentencesOf(slot: SlotOutputs): string[] {
  return slot.violations.map((row) => warningFor(row, unitSystem.si));
}

/**
 * PMV (ASHRAE 55) at 0.9 m/s, past what the standard allows occupants without local control of the air speed:
 * 0.64 m/s at the defaults' 25 °C operative temperature.
 */
function ashraeWithoutControlAt09(): { session: Session; outputs: Outputs } {
  const session = new Session(pmvPpdAshrae);
  const outputs = new Outputs(session);
  session.commitEntry(0, q.v, 0.9);
  return { session, outputs };
}

describe("Outputs", () => {
  it("derives a result and a chart from a valid session", () => {
    const outputs = new Outputs(new Session(pmvPpdIso));

    expect(outputs.slots[0].outOfRangeQuantities).toEqual([]);
    expect(resultValueOf(outputs.slots[0].result, q.pmv)).toBeTypeOf("number");
    expect(outputs.chart?.traces.length).toBeGreaterThan(0);
  });

  it("after any commit, the result and the violation rows are the run of the slot as it is", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    void outputs.slots[0].result;

    // Written as it is, then cut to ISO 7730's 30 °C, then a humidity that breaks the vapour-pressure row.
    for (const [quantity, value] of [[q.tdb, 26], [q.tdb, 35], [q.rh, 95]] as const) {
      expect(session.commitEntry(0, quantity, value).kind).not.toBe("refused");
      const run = runOfFirstSlot(session);

      expect(outputs.slots[0].result).toEqual(run);
      expect(outputs.slots[0].violations).toEqual(violationRows(session.model, run, session.entryModes));
    }
    expect(heldSlot(session, 0).values.get(q.tdb)).toBe(30);
    expect(outputs.slots[0].violations.map((row) => row.quantity)).toEqual([q.pa]);
  });

  it("calculates a run that breaks PMV (ASHRAE 55)'s air-speed rule without local control, with its violation rows", () => {
    const { outputs } = ashraeWithoutControlAt09();

    expect(resultValueOf(outputs.slots[0].result, q.pmv)).toBeTypeOf("number");
    expect(outputs.slots[0].violations.map(({ quantity, bounded }) => [quantity, bounded])).toEqual([[q.v, q.vr]]);
    expect(outputs.chart?.traces.length).toBeGreaterThan(0);
  });

  it("runs a value a writer let through, and the library's rows show it as a violation", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    void outputs.slots[0].result;

    // Past ISO 7730's 30 °C, written past the commit's judgement.
    session.slots[0].setEntered(q.tdb, 35);

    expect(outputs.slots[0].result).toEqual(runOfFirstSlot(session));
    expect(resultValueOf(outputs.slots[0].result, q.pmv)).toBeTypeOf("number");
    expect(outputs.slots[0].violations.map((row) => row.quantity)).toContain(q.tdb);
  });

  it("changes the chart's axis range and not the result when the unit system changes", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    const result = outputs.slots[0].result;
    const range = outputs.chart?.layout.x.range;

    session.unitSystem = unitSystem.ip;

    expect(outputs.chart?.layout.x.range).not.toEqual(range);
    expect(outputs.slots[0].result).toEqual(result);
  });

  it("follows the chart type and the chosen axes, and not the result", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    const result = outputs.slots[0].result;

    session.chart.type = chartType.dynamic;

    // The dynamic chart starts on the air speed, the psychrometric one on the humidity ratio.
    expect(outputs.chart?.layout.y.title).toContain(q.v.label);
    const yTitle = outputs.chart?.layout.y.title;

    session.chart.setAxes({ y: q.rh });

    expect(outputs.chart?.layout.y.title).not.toBe(yTitle);
    expect(outputs.chart?.layout.y.title).toContain(q.rh.label);
    expect(outputs.slots[0].result).toBe(result);
  });

  it("offers the axes of the dynamic chart it draws, in the slot's entry mode", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    session.chart.type = chartType.dynamic;

    expect(outputs.drawnAxes?.selected).toEqual({ x: q.tdb, y: q.v });
    expect(outputs.drawnAxes?.choices).toContain(q.tdb);

    session.setTemperatureMode(temperatureMode.operative);

    expect(outputs.drawnAxes?.selected).toEqual({ x: q.operative_tmp, y: q.v });
    expect(outputs.drawnAxes?.choices).toContain(q.operative_tmp);
    expect(outputs.drawnAxes?.choices).not.toContain(q.tdb);
    expect(outputs.chart?.layout.x.title).toContain(q.operative_tmp.label);
  });

  it("offers no axes when no dynamic chart is drawn", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    session.chart.type = chartType.psychrometric;

    expect(outputs.chart).not.toBeNull();
    expect(outputs.drawnAxes).toBeNull();

    session.chart.type = chartType.dynamic;
    expect(outputs.drawnAxes).not.toBeNull();
  });

  it("marks the slot as it is", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    void outputs.chart;

    session.commitEntry(0, q.tdb, 27);

    expect(markerOf(outputs.chart)?.x).toBe(27);
  });

  /**
   * Entering lands a whole slot, setting keys to values they already hold;
   * the reactive map raises nothing for those, so one value costs one pass.
   */
  it("runs the model and the scan once for an entered value, and not at all for a value the slot already holds", () => {
    const { model, runs } = modelCountingRuns();
    const session = new Session(model);
    session.chart.type = chartType.dynamic;
    const outputs = new Outputs(session);
    readEverything(outputs);
    const onePass = runs();

    session.slots[0].setEntered(q.tdb, 24);
    readEverything(outputs);
    expect(runs()).toBe(2 * onePass);

    session.slots[0].setEntered(q.tdb, 24);
    readEverything(outputs);
    expect(runs()).toBe(2 * onePass);
  });

  it("reads no run of the previous model when a model is set", () => {
    const session = new Session(pmvPpdIso);
    session.slots[0].setEntered(q.rh, 95);
    const outputs = new Outputs(session);
    expect(outputs.slots[0].violations.map((row) => row.quantity)).toEqual([q.pa]);

    // Setting the model, which never asks and never adjusts: ISO 7730's own
    // default temperature is below the Rothfusz regression's floor, and is run.
    session.setModel(heatIndexRothfusz);

    expect(outputs.slots[0].result).toEqual(runOfFirstSlot(session));
    expect(resultValueOf(outputs.slots[0].result, q.pmv)).toBeUndefined();
    expect(outputs.slots[0].violations.map((row) => row.quantity)).toEqual([q.tdb]);
    expect(outputs.chart).not.toBeNull();
  });

  it("shows the new model's own result after a commit", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    void outputs.slots[0].result;

    session.setModel(heatIndexRothfusz);
    session.commitEntry(0, q.tdb, 30);

    expect(outputs.slots[0].violations).toEqual([]);
    expect(resultValueOf(outputs.slots[0].result, q.hi)).toBeTypeOf("number");
    expect(resultValueOf(outputs.slots[0].result, q.pmv)).toBeUndefined();
    expect(outputs.chart?.traces.length).toBeGreaterThan(0);
  });
});

describe("the violation rows, in the words of the limits popover", () => {
  it("are none at the defaults", () => {
    expect(new Outputs(new Session(pmvPpdAshrae)).slots[0].violations).toEqual([]);
  });

  it("name PMV (ASHRAE 55)'s air-speed limit without local control", () => {
    const { outputs } = ashraeWithoutControlAt09();

    expect(sentencesOf(outputs.slots[0])).toEqual(["Relative air speed must be ≤ 0.64 m/s"]);
  });

  it("name the same limit under relative air speed entry", () => {
    const { session, outputs } = ashraeWithoutControlAt09();

    session.setAirSpeedMode(airSpeedMode.corrected);

    expect(sentencesOf(outputs.slots[0])).toEqual(["Relative air speed must be ≤ 0.64 m/s"]);
  });

  it("name PMV (ISO 7730)'s vapour pressure over 2 700 Pa, which has no row on the panel", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    session.commitEntry(0, q.rh, 95);

    expect(sentencesOf(outputs.slots[0])).toEqual(["Water vapour partial pressure must be 0 – 2.7 kPa"]);
  });

  it("name an output's broken bound, as an input's", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    for (const [quantity, value] of [[q.tdb, 30], [q.tr, 40], [q.met, 2], [q.clo, 1]] as const) {
      session.commitEntry(0, quantity, value);
    }

    expect(sentencesOf(outputs.slots[0])).toEqual(["PMV must be -2 – 2"]);
  });

  it("under Compare, are only the rows of the slot whose run broke a bound", () => {
    const session = new Session(pmvPpdIso);
    session.setCompare(true);
    const outputs = new Outputs(session);

    session.commitEntry(1, q.rh, 95);

    const [first, second] = outputs.slots;
    expect(sentencesOf(first)).toEqual([]);
    expect(sentencesOf(second)).toEqual(["Water vapour partial pressure must be 0 – 2.7 kPa"]);
  });
});
