import { describe, expect, it } from "vitest";

import { PhsPosture } from "../../models/phs";
import { FieldKey } from "../../models/fieldKeys";
import { PhsSegmentPreset } from "../../models/timeSeries";
import { UnitSystem } from "../../models/units";
import { createTimeSeriesState } from "./createTimeSeriesState.svelte";

describe("createTimeSeriesState", () => {
  it("starts with the editable CBE reference scenario and local SI units", () => {
    const controller = createTimeSeriesState();

    expect(controller.state.unitSystem).toBe(UnitSystem.SI);
    expect(controller.state.segments).toEqual([
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
    expect(controller.state.person).toEqual(expect.objectContaining({
      weightKg: 75,
      heightM: 1.8,
      posture: PhsPosture.Standing,
    }));
    expect(controller.state.lastSuccessfulResult).toBeNull();
  });

  it("updates only on Run and retains a stale successful result", () => {
    const controller = createTimeSeriesState();
    expect(controller.actions.updateSegmentDuration("phs-segment-1", "60"))
      .toBe(true);
    expect(controller.state.lastSuccessfulResult).toBeNull();
    expect(controller.actions.runSimulation()).toBe(true);
    const successfulResult = controller.state.lastSuccessfulResult;

    expect(successfulResult?.totalDurationMinutes).toBe(60);
    expect(controller.state.status).toBe("ready");
    expect(controller.actions.updateSegmentField(
      "phs-segment-1",
      FieldKey.MetabolicRate,
      "2.5",
    )).toBe(true);
    expect(controller.state.status).toBe("dirty");
    expect(controller.selectors.hasStaleResult()).toBe(true);
    expect(controller.state.lastSuccessfulResult).toBe(successfulResult);

    controller.actions.updateSegmentDuration("phs-segment-1", "481");
    expect(controller.actions.runSimulation()).toBe(false);
    expect(controller.state.status).toBe("error");
    expect(controller.state.lastSuccessfulResult).toBe(successfulResult);
    expect(controller.selectors.hasStaleResult()).toBe(true);
  });

  it("adds, duplicates, removes, and orders work/rest segments", () => {
    const controller = createTimeSeriesState();
    controller.actions.updateSegmentDuration("phs-segment-1", "60");
    controller.actions.addSegment(PhsSegmentPreset.Rest);
    const rest = controller.state.segments[1];

    expect(rest).toEqual(expect.objectContaining({
      name: "Rest",
      durationMinutes: 15,
      tdb: 35,
      met: 1.2,
    }));
    controller.actions.duplicateSegment(rest.id);
    expect(controller.state.segments[2].name).toBe("Rest copy");
    controller.actions.moveSegment(controller.state.segments[2].id, -1);
    expect(controller.state.segments[1].name).toBe("Rest copy");
    controller.actions.removeSegment(controller.state.segments[1].id);
    expect(controller.state.segments).toHaveLength(2);
  });

  it("round-trips local IP display values while preserving SI state", () => {
    const controller = createTimeSeriesState();
    controller.actions.toggleUnitSystem();

    expect(controller.selectors.getSegmentDisplayValue(
      controller.state.segments[0],
      FieldKey.DryBulbTemperature,
    )).toBeCloseTo(95, 8);
    expect(controller.selectors.getPersonDisplayValue("weightKg"))
      .toBeCloseTo(165.3467, 3);
    expect(controller.actions.updateSegmentField(
      "phs-segment-1",
      FieldKey.DryBulbTemperature,
      "100.4",
    )).toBe(true);
    expect(controller.state.segments[0].tdb).toBeCloseTo(38, 8);
    expect(controller.actions.updatePersonNumber("heightM", "6"))
      .toBe(true);
    expect(controller.state.person.heightM).toBeCloseTo(1.8288, 8);
  });

  it("builds charts from the last result and resets independently", () => {
    const controller = createTimeSeriesState();
    controller.actions.updateSegmentDuration("phs-segment-1", "30");
    controller.actions.runSimulation();

    expect(controller.selectors.getCharts()?.primary.traces).toHaveLength(3);
    controller.actions.reset();
    expect(controller.selectors.getCharts()).toBeNull();
    expect(controller.state.status).toBe("idle");
    expect(controller.state.segments[0].durationMinutes).toBe(480);
  });
});
