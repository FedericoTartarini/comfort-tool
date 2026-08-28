import { afterEach, describe, expect, it, vi } from "vitest";
import { PhysicalQuantityId } from "../../catalog/quantities";

import { ModelId } from "../../catalog/modelIds";
import {
  PhsPosture,
  PhsSegmentPreset,
  type PhsSimulationResult,
  type PhsTimeSeriesDraft,
} from "../../catalog/phs";
import { UnitSystem } from "../../catalog/units";
import { chartFigure } from "../../testSupport/modelChartTestHelpers";
import { createTimeSeriesSession } from "./createTimeSeriesSession.svelte";
import { timeSeriesModelOrder } from "./modelConfigs";

function getDraft(session: ReturnType<typeof createTimeSeriesSession>) {
  return session.input.draftByModel[ModelId.Phs2023] as PhsTimeSeriesDraft;
}

function getResult(session: ReturnType<typeof createTimeSeriesSession>) {
  return session.output.resultByModel[ModelId.Phs2023] as
    | PhsSimulationResult
    | null;
}

async function waitForReady(
  session: ReturnType<typeof createTimeSeriesSession>,
) {
  await vi.waitFor(() => {
    expect(session.results.status).toBe("ready");
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createTimeSeriesSession", () => {
  it("seeds generic registry-keyed state and calculates on start", async () => {
    const session = createTimeSeriesSession({ debounceMs: 0 });
    const draft = getDraft(session);

    expect(session.setting.unitSystem).toBe(UnitSystem.SI);
    expect(Object.keys(session.input.draftByModel)).toEqual(timeSeriesModelOrder);
    expect(Object.keys(session.output.resultByModel)).toEqual(timeSeriesModelOrder);
    expect(Object.keys(session.output.statusByModel)).toEqual(timeSeriesModelOrder);
    expect(session.inputPanel.modelItems).toEqual([{
      name: "Predicted Heat Strain (PHS)",
      value: ModelId.Phs2023,
    }]);
    expect(draft.segments).toEqual([
      expect.objectContaining({
        name: "CBE reference exposure",
        durationMinutes: 480,
        tdb: 35,
        tr: 35,
        v: 0.1,
        rh: 71,
        met: 2.6,
        clo: 0.5,
      }),
    ]);
    expect(draft.person).toEqual(expect.objectContaining({ [PhysicalQuantityId.BodyWeight]: 75, [PhysicalQuantityId.Height]: 1.8, posture: PhsPosture.Standing }));

    session.actions.start();
    await waitForReady(session);
    expect(getResult(session)?.totalDurationMinutes).toBe(480);
    session.actions.dispose();
  });

  it("debounces valid edits, commits only the latest revision, and keeps stale results", async () => {
    vi.useFakeTimers();
    const session = createTimeSeriesSession({ debounceMs: 300 });
    session.actions.start();
    await waitForReady(session);
    const successfulResult = getResult(session);

    expect(session.actions.updateSegmentDuration("phs-segment-1", "30"))
      .toBe(true);
    expect(session.actions.updateSegmentDuration("phs-segment-1", "45"))
      .toBe(true);
    expect(session.results.status).toBe("waiting");
    expect(session.results.hasStaleResult).toBe(true);
    expect(getResult(session)).toBe(successfulResult);

    await vi.advanceTimersByTimeAsync(299);
    expect(getResult(session)).toBe(successfulResult);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => {
      expect(session.results.status).toBe("ready");
    });
    expect(getResult(session)?.totalDurationMinutes).toBe(45);
    expect(session.output.revisionByModel[ModelId.Phs2023]).toBe(3);

    session.actions.updateSegmentDuration("phs-segment-1", "0");
    expect(session.results.status).toBe("waiting");
    expect(session.results.errors[0]).toContain("positive whole number");
    expect(getResult(session)?.totalDurationMinutes).toBe(45);
    session.actions.dispose();
  });

  it("adds, duplicates, removes, and orders model-owned presets", () => {
    const session = createTimeSeriesSession({ debounceMs: 0 });
    session.actions.updateSegmentDuration("phs-segment-1", "60");
    session.actions.addSegment(PhsSegmentPreset.Rest);
    const draft = getDraft(session);
    const rest = draft.segments[1];

    expect(rest).toEqual(expect.objectContaining({
      name: "Rest",
      durationMinutes: 15,
      tdb: 35,
      met: 1.2,
    }));
    session.actions.duplicateSegment(rest.id);
    expect(draft.segments[2].name).toBe("Rest copy");
    session.actions.moveSegment(draft.segments[2].id, -1);
    expect(draft.segments[1].name).toBe("Rest copy");
    session.actions.removeSegment(draft.segments[1].id);
    expect(draft.segments).toHaveLength(2);
    session.actions.dispose();
  });

  it("round-trips generic editor values in IP while canonical drafts stay SI", () => {
    const session = createTimeSeriesSession({ debounceMs: 0 });
    session.actions.toggleUnitSystem();
    let editor = session.inputPanel.editor;
    const airTemperature = editor.segments[0].controls.find(
      ({ label }) => label === "Air temperature",
    )!;
    const weight = editor.settingsSections[0].controls.find(
      ({ label }) => label === "Body weight",
    )!;
    const height = editor.settingsSections[0].controls.find(
      ({ label }) => label === "Body height",
    )!;

    expect(airTemperature.value).toBeCloseTo(95, 8);
    expect(weight.kind === "number" ? weight.value : Number.NaN)
      .toBeCloseTo(165.3467, 3);
    expect(session.actions.updateSegmentControl(
      "phs-segment-1",
      airTemperature.id,
      "100.4",
    )).toBe(true);
    expect(session.actions.updateSettingControl(height.id, "6")).toBe(true);

    expect(getDraft(session).segments[0].tdb).toBeCloseTo(38, 8);
    expect(getDraft(session).person[PhysicalQuantityId.Height]).toBeCloseTo(1.8288, 8);
    editor = session.inputPanel.editor;
    expect(editor.segments[0].controls.find(
      ({ label }) => label === "Air temperature",
    )?.value).toBeCloseTo(100.4, 8);
    session.actions.dispose();
  });

  it("does not calculate for units or phase-name presentation changes", async () => {
    const session = createTimeSeriesSession({ debounceMs: 0 });
    session.actions.start();
    await waitForReady(session);
    const revision = session.output.revisionByModel[ModelId.Phs2023];
    const result = getResult(session);

    session.actions.toggleUnitSystem();
    session.actions.updateSegmentName("phs-segment-1", "Renamed phase");

    expect(session.output.revisionByModel[ModelId.Phs2023]).toBe(revision);
    expect(getResult(session)).toBe(result);
    expect(chartFigure(session.results.charts[0].chart)?.traces[0].customdata?.[0])
      .toEqual(["Renamed phase"]);
    session.actions.dispose();
  });

  it("calculates scenarios beyond the Analysis compliance horizon", async () => {
    const session = createTimeSeriesSession({ debounceMs: 0 });
    session.actions.updateSegmentDuration("phs-segment-1", "600");
    session.actions.start();
    await waitForReady(session);

    expect(session.results.errors).toEqual([]);
    expect(session.inputPanel.totalDurationMinutes).toBe(600);
    expect(getResult(session)?.totalDurationMinutes).toBe(600);
    session.actions.dispose();
  });

  it("reset restores defaults and schedules automatic replacement", async () => {
    const session = createTimeSeriesSession({ debounceMs: 0 });
    session.actions.updateSegmentDuration("phs-segment-1", "30");
    session.actions.start();
    await waitForReady(session);
    expect(getResult(session)?.totalDurationMinutes).toBe(30);

    session.actions.reset();
    expect(getDraft(session).segments[0].durationMinutes).toBe(480);
    await waitForReady(session);
    expect(getResult(session)?.totalDurationMinutes).toBe(480);
    session.actions.dispose();
  });
});
