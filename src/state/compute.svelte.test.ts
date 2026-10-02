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
import { temperatureMode } from "$lib/core/entryModes";
import type { RegisteredModel, Values } from "$lib/core/modelDeclaration";
import { quantities } from "$lib/core/quantities";
import { unitSystem } from "$lib/core/unitSystem";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Outputs } from "./compute.svelte";
import { Session } from "./session.svelte";
import { resultValueOf } from "./sessionTestReaders";

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

/**
 * A session whose valid run also breaks an applicability row, so that "the
 * rows are kept too" is an assertion about something rather than about an
 * empty array. No entry breaks a bound; at 95 % the vapour pressure the model
 * derives passes ISO 7730's limit of 2700 Pa, at the slot's 25 °C and at 26 °C,
 * which the library reports on the result.
 */
function sessionBreakingOneRow(): Session {
  const session = new Session(pmvPpdIso);
  session.slots[0].setEntered(q.rh, 95);
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

    expect(outputs.slots[0].outOfRangeQuantities).toEqual([]);
    expect(resultValueOf(outputs.slots[0].result, q.pmv)).toBeTypeOf("number");
    expect(outputs.chart?.traces.length).toBeGreaterThan(0);
  });

  it("keeps the last valid result, rows and chart while an entry is out of range, and names the quantity", () => {
    const session = sessionBreakingOneRow();
    const outputs = new Outputs(session);
    const result = outputs.slots[0].result;
    const violations = outputs.slots[0].violations;
    const chart = outputs.chart;
    expect(result).not.toBeNull();
    expect(violations.map((row) => row.quantity)).toEqual([q.pa]);

    // 35 °C is past ISO 7730's 30 °C, so the gate blocks the run.
    session.slots[0].setEntered(q.tdb, 35);

    expect(outputs.slots[0].outOfRangeQuantities).toEqual([q.tdb]);
    expect(outputs.slots[0].result).toBe(result);
    expect(outputs.slots[0].violations).toBe(violations);
    expect(outputs.chart).toBe(chart);
  });

  it("updates the result, rows and chart again when the value comes back into range", () => {
    const session = sessionBreakingOneRow();
    const outputs = new Outputs(session);
    const kept = outputs.slots[0].result;
    const keptChart = outputs.chart;

    session.slots[0].setEntered(q.tdb, 35);
    // Read while blocked, so this is the round trip and not one jump.
    expect(outputs.slots[0].outOfRangeQuantities).toEqual([q.tdb]);
    session.slots[0].setEntered(q.tdb, 26);

    expect(outputs.slots[0].outOfRangeQuantities).toEqual([]);
    expect(outputs.slots[0].result).not.toBe(kept);
    expect(resultValueOf(outputs.slots[0].result, q.pmv)).not.toBe(resultValueOf(kept, q.pmv));
    expect(outputs.slots[0].violations.map((row) => row.quantity)).toEqual([q.pa]);
    expect(outputs.chart).not.toBe(keptChart);
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

  it("converts the kept chart to the new unit system while an entry is out of range", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    const result = outputs.slots[0].result;
    const title = outputs.chart?.layout.x.title;
    const range = outputs.chart?.layout.x.range;

    session.slots[0].setEntered(q.tdb, 35);
    expect(outputs.slots[0].outOfRangeQuantities).toEqual([q.tdb]);
    session.unitSystem = unitSystem.ip;

    expect(outputs.chart?.layout.x.title).not.toBe(title);
    expect(outputs.chart?.layout.x.range).not.toEqual(range);
    expect(outputs.slots[0].result).toBe(result);
  });

  it("follows the chart type and the chosen axes while an entry is out of range", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    const result = outputs.slots[0].result;

    session.slots[0].setEntered(q.tdb, 35);
    expect(outputs.slots[0].outOfRangeQuantities).toEqual([q.tdb]);
    session.chart.type = chartType.dynamic;

    // The dynamic chart starts on the air speed, the psychrometric one on the humidity ratio.
    expect(outputs.chart?.layout.y.title).toContain(q.v.label);
    const yTitle = outputs.chart?.layout.y.title;

    session.chart.setAxes({ y: q.rh });

    expect(outputs.chart?.layout.y.title).not.toBe(yTitle);
    expect(outputs.chart?.layout.y.title).toContain(q.rh.label);
    expect(outputs.slots[0].result).toBe(result);
  });

  it("offers the axes of the dynamic chart it draws, in the slot's entry mode while the gate is open", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    session.chart.type = chartType.dynamic;

    expect(outputs.drawnAxes?.selected).toEqual({ x: q.tdb, y: q.v });
    expect(outputs.drawnAxes?.choices).toContain(q.tdb);

    session.setTemperatureMode(temperatureMode.operative);

    expect(outputs.slots[0].outOfRangeQuantities).toEqual([]);
    expect(outputs.drawnAxes?.selected).toEqual({ x: q.operative_tmp, y: q.v });
    expect(outputs.drawnAxes?.choices).toContain(q.operative_tmp);
    expect(outputs.drawnAxes?.choices).not.toContain(q.tdb);
    expect(outputs.chart?.layout.x.title).toContain(q.operative_tmp.label);
  });

  // The axes are the session's entry mode's, not the kept run's (ADR-0002
  // decision 51): the kept slot is drawn converted into it.
  it("offers the session's entry mode's axes, and draws the chart on them, while an entry is out of range", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    session.chart.type = chartType.dynamic;
    expect(outputs.chart?.layout.x.title).toContain(q.tdb.label);

    // 3 clo is past ISO 7730's 2 clo, and no temperature switch moves it.
    session.slots[0].setEntered(q.clo, 3);
    expect(outputs.slots[0].outOfRangeQuantities).toEqual([q.clo]);
    session.setTemperatureMode(temperatureMode.operative);
    expect(outputs.slots[0].outOfRangeQuantities).toEqual([q.clo]);

    expect(outputs.slots[0].lastValid?.slot.temperature.mode).toBe(temperatureMode.separate);
    expect(outputs.chart?.layout.x.title).toContain(q.operative_tmp.label);
    expect(outputs.drawnAxes?.selected).toEqual({ x: q.operative_tmp, y: q.v });
    expect(outputs.drawnAxes?.choices).toContain(q.operative_tmp);
    expect(outputs.drawnAxes?.choices).not.toContain(q.tdb);

    // An axis picked while the gate is closed moves the chart and the picker alike.
    session.chart.setAxes({ y: q.rh });

    expect(outputs.chart?.layout.y.title).toContain(q.rh.label);
    expect(outputs.drawnAxes?.selected).toEqual({ x: q.operative_tmp, y: q.rh });
  });

  it("offers no axes when no dynamic chart is drawn", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    session.chart.type = chartType.psychrometric;

    expect(outputs.chart).not.toBeNull();
    expect(outputs.drawnAxes).toBeNull();

    session.chart.type = chartType.dynamic;
    expect(outputs.drawnAxes).not.toBeNull();
    // ISO 7730's default temperature is below the Rothfusz regression's floor,
    // so the new model has no valid run and no chart.
    session.setModel(heatIndexRothfusz);

    expect(outputs.chart).toBeNull();
    expect(outputs.drawnAxes).toBeNull();
  });

  it("marks the last valid inputs, not the out-of-range entry", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    const marker = markerOf(outputs.chart);

    session.slots[0].setEntered(q.tdb, 35);

    expect(outputs.slots[0].outOfRangeQuantities).toEqual([q.tdb]);
    expect(markerOf(outputs.chart)?.x).toBe(marker?.x);
    expect(markerOf(outputs.chart)?.x).not.toBe(35);
  });

  it("runs neither the model nor the scan again while the gate stays closed", () => {
    const { model, runs } = modelCountingRuns();
    const session = new Session(model);
    // The 51×51 scan is the expensive half of the claim; either chart scans,
    // and the dynamic one is taken here.
    session.chart.type = chartType.dynamic;
    const outputs = new Outputs(session);
    readEverything(outputs);
    const before = runs();
    // A contour zone is cut from the scan, so `before` counts a whole scan.
    expect(outputs.chart?.traces.some((trace) => trace.kind === "contourZone")).toBe(true);
    expect(before).toBeGreaterThan(0);

    session.slots[0].setEntered(q.tdb, 35);
    expect(outputs.slots[0].outOfRangeQuantities).toEqual([q.tdb]);
    readEverything(outputs);
    session.slots[0].setEntered(q.tdb, 36);
    expect(outputs.slots[0].outOfRangeQuantities).toEqual([q.tdb]);
    readEverything(outputs);

    expect(runs()).toBe(before);
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

  it("keeps nothing of the previous model when a model is set with an entry out of range", () => {
    const session = sessionBreakingOneRow();
    const outputs = new Outputs(session);
    expect(outputs.slots[0].result).not.toBeNull();
    expect(outputs.slots[0].violations).not.toEqual([]);

    // The address's own way in, which never asks and never adjusts: ISO
    // 7730's own default temperature is below the Rothfusz regression's floor.
    session.setModel(heatIndexRothfusz);

    expect(outputs.slots[0].outOfRangeQuantities).toEqual([q.tdb]);
    const resultPerSlot = session.slots.map(
      (_, position) => outputs.slots.find((slot) => slot.position === position)?.result ?? null,
    );
    expect(resultPerSlot).toEqual([null, null, null]);
    expect(outputs.slots[0].violations).toEqual([]);
    expect(outputs.chart).toBeNull();
  });

  it("shows the new model's own result once it has a valid run of its own", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    void outputs.slots[0].result;

    session.setModel(heatIndexRothfusz);
    session.slots[0].setEntered(q.tdb, 30);

    expect(outputs.slots[0].outOfRangeQuantities).toEqual([]);
    expect(resultValueOf(outputs.slots[0].result, q.hi)).toBeTypeOf("number");
    expect(resultValueOf(outputs.slots[0].result, q.pmv)).toBeUndefined();
    expect(outputs.chart?.traces.length).toBeGreaterThan(0);
  });
});
