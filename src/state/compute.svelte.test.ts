/**
 * The state layer's one genuinely stateful rule: while the pre-call gate
 * reports an out-of-range entry, the last valid result, its applicability rows
 * and the last chart stay on screen (ADR-0002 decision 29; spec "Testing
 * Decisions → State"). It is observable nowhere lower — `core/` is pure — so
 * this is the seam a session goes into and the outputs come out of, with no
 * component and no router.
 *
 * Nothing flushes: the outputs are a derivation, so reading one after a change
 * is what recomputes it, and a test that needed a flush would mean an effect
 * had come back.
 */
import { describe, expect, it } from "vitest";
import { resultValue } from "$lib/core/libraryInputs";
import type { ModelResult } from "$lib/core/modelDeclaration";
import { quantities } from "$lib/core/quantities";
import { unitSystem } from "$lib/core/unitSystem";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Outputs } from "./compute.svelte";
import { Session } from "./session.svelte";

const q = quantities;

/** The `pmv` the result table would show, read through the app's own accessor. */
function pmvOf(result: ModelResult | null): number | string | undefined {
  return result === null ? undefined : resultValue(result, q.pmv);
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

describe("Outputs", () => {
  it("derives a result and a chart from a valid session", () => {
    const outputs = new Outputs(new Session(pmvPpdIso));

    expect(outputs.outOfRange).toEqual([]);
    expect(pmvOf(outputs.perSlot[0])).toBeTypeOf("number");
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
    expect(pmvOf(outputs.perSlot[0])).not.toBe(pmvOf(kept));
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
});
