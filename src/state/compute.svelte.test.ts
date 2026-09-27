/**
 * The state layer's one genuinely stateful rule: while the pre-call gate
 * reports an out-of-range entry, the last valid inputs are kept, and the
 * result, the applicability rows and the chart derived from them stay on
 * screen (ADR-0002 decisions 29 and 33; spec "Testing Decisions → State"). It
 * is observable nowhere lower — `core/` is pure — so this is the seam a
 * session goes into and the outputs come out of, with no component and no
 * router.
 *
 * Nothing flushes: the outputs are a derivation, so reading one after a change
 * is what recomputes it, and a test that needed a flush would mean an effect
 * had come back.
 */
import { describe, expect, it } from "vitest";
import type { ChartSpec, PointTrace } from "$lib/core/charts/chartSpec";
import { chartType } from "$lib/core/chartType";
import { resultValue } from "$lib/core/libraryInputs";
import type { ModelResult, RegisteredModel, Values } from "$lib/core/modelDeclaration";
import { quantities, type Quantity } from "$lib/core/quantities";
import { unitSystem } from "$lib/core/unitSystem";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Outputs } from "./compute.svelte";
import { Session } from "./session.svelte";

const q = quantities;

/** What the result table would show for `quantity`, read through the app's own accessor. */
function shownValueOf(result: ModelResult | null, quantity: Quantity): number | string | undefined {
  return result === null ? undefined : resultValue(result, quantity);
}

/** Read everything the page reads, which is what makes a derivation recompute. */
function readEverything(outputs: Outputs): void {
  void outputs.perSlot[0];
  void outputs.violations;
  void outputs.chart;
}

/** The slot marker the chart draws, which every chart of a slot carries. */
function markerOf(chart: ChartSpec | null): PointTrace | undefined {
  return chart?.traces.find((trace): trace is PointTrace => trace.kind === "point");
}

/**
 * A session whose valid run also breaks an applicability row, so that "the
 * rows are kept too" is an assertion about something rather than about an
 * empty array. Entered `v` has no bound of its own; at `met` 2.5 the `vr` the
 * model derives from it passes ISO 7730's limit of 1 m/s, which the library
 * reports on the result and `core/applicability.ts` maps back onto `v`.
 */
function sessionBreakingOneRow(): Session {
  const session = new Session(pmvPpdIso);
  session.slots[0].values.set(q.met, 2.5);
  session.slots[0].values.set(q.v, 0.9);
  return session;
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

describe("Outputs", () => {
  it("derives a result and a chart from a valid session", () => {
    const outputs = new Outputs(new Session(pmvPpdIso));

    expect(outputs.outOfRange).toEqual([]);
    expect(shownValueOf(outputs.perSlot[0], q.pmv)).toBeTypeOf("number");
    expect(outputs.chart?.traces.length).toBeGreaterThan(0);
  });

  it("keeps the last valid result, rows and chart while an entry is out of range, and names the quantity", () => {
    const session = sessionBreakingOneRow();
    const outputs = new Outputs(session);
    const result = outputs.perSlot[0];
    const violations = outputs.violations;
    const chart = outputs.chart;
    expect(result).not.toBeNull();
    expect(violations.map((row) => row.quantity)).toEqual([q.v]);

    // 35 °C is past ISO 7730's 30 °C, so the gate blocks the run.
    session.slots[0].values.set(q.tdb, 35);

    expect(outputs.outOfRange).toEqual([q.tdb]);
    expect(outputs.perSlot[0]).toBe(result);
    expect(outputs.violations).toBe(violations);
    expect(outputs.chart).toBe(chart);
  });

  it("updates the result, rows and chart again when the value comes back into range", () => {
    const session = sessionBreakingOneRow();
    const outputs = new Outputs(session);
    const kept = outputs.perSlot[0];
    const keptChart = outputs.chart;

    session.slots[0].values.set(q.tdb, 35);
    // Read while blocked, so this is the round trip and not one jump.
    expect(outputs.outOfRange).toEqual([q.tdb]);
    session.slots[0].values.set(q.tdb, 20);

    expect(outputs.outOfRange).toEqual([]);
    expect(outputs.perSlot[0]).not.toBe(kept);
    expect(shownValueOf(outputs.perSlot[0], q.pmv)).not.toBe(shownValueOf(kept, q.pmv));
    expect(outputs.violations.map((row) => row.quantity)).toEqual([q.v]);
    expect(outputs.chart).not.toBe(keptChart);
  });

  it("changes the chart's axis range and not the result when the unit system changes", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    const result = outputs.perSlot[0];
    const range = outputs.chart?.layout.x.range;

    session.unitSystem = unitSystem.ip;

    expect(outputs.chart?.layout.x.range).not.toEqual(range);
    expect(outputs.perSlot[0]).toEqual(result);
  });

  it("converts the kept chart to the new unit system while an entry is out of range", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    const result = outputs.perSlot[0];
    const title = outputs.chart?.layout.x.title;
    const range = outputs.chart?.layout.x.range;

    session.slots[0].values.set(q.tdb, 35);
    expect(outputs.outOfRange).toEqual([q.tdb]);
    session.unitSystem = unitSystem.ip;

    expect(outputs.chart?.layout.x.title).not.toBe(title);
    expect(outputs.chart?.layout.x.range).not.toEqual(range);
    expect(outputs.perSlot[0]).toBe(result);
  });

  it("follows the chart type and the chosen axes while an entry is out of range", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    const result = outputs.perSlot[0];

    session.slots[0].values.set(q.tdb, 35);
    expect(outputs.outOfRange).toEqual([q.tdb]);
    session.chart.setType(chartType.dynamic);

    // The psychrometric chart draws no scanned field, the dynamic one is one.
    expect(outputs.chart?.traces.some((trace) => trace.kind === "bands")).toBe(true);
    const yTitle = outputs.chart?.layout.y.title;

    session.chart.setAxes({ y: q.rh });

    expect(outputs.chart?.layout.y.title).not.toBe(yTitle);
    expect(outputs.chart?.layout.y.title).toContain(q.rh.label);
    expect(outputs.perSlot[0]).toBe(result);
  });

  it("marks the last valid inputs, not the out-of-range entry", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    const marker = markerOf(outputs.chart);

    session.slots[0].values.set(q.tdb, 35);

    expect(outputs.outOfRange).toEqual([q.tdb]);
    expect(markerOf(outputs.chart)?.x).toBe(marker?.x);
    expect(markerOf(outputs.chart)?.x).not.toBe(35);
  });

  it("runs neither the model nor the scan again while the gate stays closed", () => {
    const { model, runs } = modelCountingRuns();
    const session = new Session(model);
    // The dynamic chart, because the 51×51 scan is the expensive half of the
    // claim; the model's default chart solves a zone instead and never scans.
    session.chart.setType(chartType.dynamic);
    const outputs = new Outputs(session);
    readEverything(outputs);
    const before = runs();
    // A bands trace is the scan's own output, so `before` counts a whole scan.
    expect(outputs.chart?.traces.some((trace) => trace.kind === "bands")).toBe(true);
    expect(before).toBeGreaterThan(0);

    session.slots[0].values.set(q.tdb, 35);
    expect(outputs.outOfRange).toEqual([q.tdb]);
    readEverything(outputs);
    session.slots[0].values.set(q.tdb, 36);
    expect(outputs.outOfRange).toEqual([q.tdb]);
    readEverything(outputs);

    expect(runs()).toBe(before);
  });

  it("keeps nothing of the previous model when a model is set with an entry out of range", () => {
    const session = sessionBreakingOneRow();
    const outputs = new Outputs(session);
    expect(outputs.perSlot[0]).not.toBeNull();
    expect(outputs.violations).not.toEqual([]);

    // The address's own way in, which never asks and never adjusts: ISO
    // 7730's own default temperature is below the Rothfusz regression's floor.
    session.setModel(heatIndexRothfusz);

    expect(outputs.outOfRange).toEqual([q.tdb]);
    expect(outputs.perSlot).toEqual([null, null, null]);
    expect(outputs.violations).toEqual([]);
    expect(outputs.chart).toBeNull();
  });

  it("shows the new model's own result once it has a valid run of its own", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    void outputs.perSlot[0];

    session.setModel(heatIndexRothfusz);
    session.slots[0].values.set(q.tdb, 30);

    expect(outputs.outOfRange).toEqual([]);
    expect(shownValueOf(outputs.perSlot[0], q.hi)).toBeTypeOf("number");
    expect(shownValueOf(outputs.perSlot[0], q.pmv)).toBeUndefined();
    expect(outputs.chart?.traces.length).toBeGreaterThan(0);
  });
});
