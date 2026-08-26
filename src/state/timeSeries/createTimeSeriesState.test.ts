import { afterEach, describe, expect, it, vi } from "vitest";

import { ModelId } from "../../models/modelIds";
import {
  PhsPosture,
  PhsQuantityId,
  PhsSegmentPreset,
  type PhsSimulationResult,
  type PhsTimeSeriesDraft,
} from "../../models/phs";
import { UnitSystem } from "../../models/units";
import { createTimeSeriesState } from "./createTimeSeriesState.svelte";
import { timeSeriesModelOrder } from "./modelConfigs";

function getDraft(controller: ReturnType<typeof createTimeSeriesState>) {
  return controller.state.draftByModel[ModelId.Phs2023] as PhsTimeSeriesDraft;
}

function getResult(controller: ReturnType<typeof createTimeSeriesState>) {
  return controller.state.resultByModel[ModelId.Phs2023] as
    | PhsSimulationResult
    | null;
}

async function waitForReady(
  controller: ReturnType<typeof createTimeSeriesState>,
) {
  await vi.waitFor(() => {
    expect(controller.selectors.getStatus()).toBe("ready");
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createTimeSeriesState", () => {
  it("seeds generic registry-keyed state and calculates on start", async () => {
    const controller = createTimeSeriesState({ debounceMs: 0 });
    const draft = getDraft(controller);

    expect(controller.state.unitSystem).toBe(UnitSystem.SI);
    expect(Object.keys(controller.state.draftByModel)).toEqual(timeSeriesModelOrder);
    expect(Object.keys(controller.state.resultByModel)).toEqual(timeSeriesModelOrder);
    expect(Object.keys(controller.state.statusByModel)).toEqual(timeSeriesModelOrder);
    expect(controller.selectors.getModelOptions()).toEqual([{
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
    expect(draft.person).toEqual(expect.objectContaining({
      [PhsQuantityId.BodyWeight]: 75,
      [PhsQuantityId.Height]: 1.8,
      posture: PhsPosture.Standing,
    }));

    controller.actions.start();
    await waitForReady(controller);
    expect(getResult(controller)?.totalDurationMinutes).toBe(480);
    controller.actions.dispose();
  });

  it("debounces valid edits, commits only the latest revision, and keeps stale results", async () => {
    vi.useFakeTimers();
    const controller = createTimeSeriesState({ debounceMs: 300 });
    controller.actions.start();
    await waitForReady(controller);
    const successfulResult = getResult(controller);

    expect(controller.actions.updateSegmentDuration("phs-segment-1", "30"))
      .toBe(true);
    expect(controller.actions.updateSegmentDuration("phs-segment-1", "45"))
      .toBe(true);
    expect(controller.selectors.getStatus()).toBe("waiting");
    expect(controller.selectors.hasStaleResult()).toBe(true);
    expect(getResult(controller)).toBe(successfulResult);

    await vi.advanceTimersByTimeAsync(299);
    expect(getResult(controller)).toBe(successfulResult);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => {
      expect(controller.selectors.getStatus()).toBe("ready");
    });
    expect(getResult(controller)?.totalDurationMinutes).toBe(45);
    expect(controller.state.revisionByModel[ModelId.Phs2023]).toBe(3);

    controller.actions.updateSegmentDuration("phs-segment-1", "0");
    expect(controller.selectors.getStatus()).toBe("waiting");
    expect(controller.selectors.getErrors()[0]).toContain("positive whole number");
    expect(getResult(controller)?.totalDurationMinutes).toBe(45);
    controller.actions.dispose();
  });

  it("adds, duplicates, removes, and orders model-owned presets", () => {
    const controller = createTimeSeriesState({ debounceMs: 0 });
    controller.actions.updateSegmentDuration("phs-segment-1", "60");
    controller.actions.addSegment(PhsSegmentPreset.Rest);
    const draft = getDraft(controller);
    const rest = draft.segments[1];

    expect(rest).toEqual(expect.objectContaining({
      name: "Rest",
      durationMinutes: 15,
      tdb: 35,
      met: 1.2,
    }));
    controller.actions.duplicateSegment(rest.id);
    expect(draft.segments[2].name).toBe("Rest copy");
    controller.actions.moveSegment(draft.segments[2].id, -1);
    expect(draft.segments[1].name).toBe("Rest copy");
    controller.actions.removeSegment(draft.segments[1].id);
    expect(draft.segments).toHaveLength(2);
    controller.actions.dispose();
  });

  it("round-trips generic editor values in IP while canonical drafts stay SI", () => {
    const controller = createTimeSeriesState({ debounceMs: 0 });
    controller.actions.toggleUnitSystem();
    let editor = controller.selectors.getEditor();
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
    expect(controller.actions.updateSegmentControl(
      "phs-segment-1",
      airTemperature.id,
      "100.4",
    )).toBe(true);
    expect(controller.actions.updateSettingControl(height.id, "6")).toBe(true);

    expect(getDraft(controller).segments[0].tdb).toBeCloseTo(38, 8);
    expect(getDraft(controller).person[PhsQuantityId.Height]).toBeCloseTo(1.8288, 8);
    editor = controller.selectors.getEditor();
    expect(editor.segments[0].controls.find(
      ({ label }) => label === "Air temperature",
    )?.value).toBeCloseTo(100.4, 8);
    controller.actions.dispose();
  });

  it("does not calculate for units or phase-name presentation changes", async () => {
    const controller = createTimeSeriesState({ debounceMs: 0 });
    controller.actions.start();
    await waitForReady(controller);
    const revision = controller.state.revisionByModel[ModelId.Phs2023];
    const result = getResult(controller);

    controller.actions.toggleUnitSystem();
    controller.actions.updateSegmentName("phs-segment-1", "Renamed phase");

    expect(controller.state.revisionByModel[ModelId.Phs2023]).toBe(revision);
    expect(getResult(controller)).toBe(result);
    expect(controller.selectors.getCharts()[0].chart?.traces[0].hoverMetadata?.[0])
      .toEqual(["Renamed phase"]);
    controller.actions.dispose();
  });

  it("calculates scenarios beyond the Analysis compliance horizon", async () => {
    const controller = createTimeSeriesState({ debounceMs: 0 });
    controller.actions.updateSegmentDuration("phs-segment-1", "600");
    controller.actions.start();
    await waitForReady(controller);

    expect(controller.selectors.getErrors()).toEqual([]);
    expect(controller.selectors.getTotalDurationMinutes()).toBe(600);
    expect(getResult(controller)?.totalDurationMinutes).toBe(600);
    controller.actions.dispose();
  });

  it("reset restores defaults and schedules automatic replacement", async () => {
    const controller = createTimeSeriesState({ debounceMs: 0 });
    controller.actions.updateSegmentDuration("phs-segment-1", "30");
    controller.actions.start();
    await waitForReady(controller);
    expect(getResult(controller)?.totalDurationMinutes).toBe(30);

    controller.actions.reset();
    expect(getDraft(controller).segments[0].durationMinutes).toBe(480);
    await waitForReady(controller);
    expect(getResult(controller)?.totalDurationMinutes).toBe(480);
    controller.actions.dispose();
  });
});
