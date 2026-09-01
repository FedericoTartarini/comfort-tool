import { describe, expect, it } from "vitest";
import { PhysicalQuantityId } from "../../catalog/quantities";

import { ModelId } from "../../catalog/modelIds";
import { InputId } from "../../catalog/inputSlots";

import {
  PHS_COMPLIANCE_HORIZON_MINUTES,
  PhsLimitingCriterion,
  defaultPhsPersonSettings,
  phsReferenceEnvironment,
  type PhsHistorySample,
  type PhsTimeSeriesDraft,
  type PhsTimeSeriesSegment,
} from "../../catalog/phs";
import { UnitSystem } from "../../catalog/units";
import {
  calculatePhs,
  calculatePhsTimeSeries,
  getPhsWaterLossLimitG,
  personFromModelInputs,
  simulatePhs,
  validatePhsEnvironment,
  validatePhsTimeSeries,
} from "./calculation";
import { phsModelConfig } from "./phs";
import { requiredControlIdsByModel } from "../../testSupport/requiredModelControls";
import { getModelSimulationOutput } from "../../state/modelRegistry";
import { resolveSimulationChartBuild } from "../../engines/comfort/charts/kinds/simulation";
import { phsTimeSeriesModelDefinition } from "./timeSeries";
import { downsamplePhsHistorySamples } from "./timeSeriesCharts";
import { buildChartPlotly, chartFigure } from "../../testSupport/modelChartTestHelpers";
import { FieldChartProfileKind } from "../../catalog/fieldChartProfile";
function segment(
  id: string,
  durationMinutes: number,
  overrides: Partial<PhsTimeSeriesSegment> = {},
): PhsTimeSeriesSegment {
  return {
    id,
    name: id,
    durationMinutes,
    ...phsReferenceEnvironment,
    ...overrides,
  };
}

function analysisResult() {
  return simulatePhs({
    segments: [segment("analysis", PHS_COMPLIANCE_HORIZON_MINUTES)],
    person: defaultPhsPersonSettings,
    recordHistory: true,
  });
}

describe("PHS ISO 7933:2023", () => {
  it("builds person settings from model inputs with PHS person defaults", () => {
    expect(personFromModelInputs({})).toEqual(defaultPhsPersonSettings);
    expect(personFromModelInputs({
      [PhysicalQuantityId.BodyWeight]: 80,
    })[PhysicalQuantityId.BodyWeight]).toBe(80);
  });

  it("matches the selected-library reference calculation", () => {
    const result = calculatePhs({
      ...phsReferenceEnvironment,
      person: defaultPhsPersonSettings,
      durationMinutes: PHS_COMPLIANCE_HORIZON_MINUTES,
    });

    expect(result.valid).toBe(true);
    expect(result.tRe).toBeCloseTo(41.42377, 4);
    expect(result.firstRectalLimitMinute).toBe(54);
    expect(result.firstWaterLossLimitMinute).toBe(165);
    expect(result.limitingExposureTimeMinutes).toBe(54);
    expect(result.limitingCriterion).toBe(
      PhsLimitingCriterion.RectalTemperature,
    );
    expect(result.sweatLossG).toBeCloseTo(8918.95, 1);
    expect(result.samples).toBeUndefined();
  });

  it("returns an explicit out-of-range result", () => {
    const issues = validatePhsEnvironment(
      { ...phsReferenceEnvironment, tdb: 14, clo: 1.1 },
      defaultPhsPersonSettings,
    );
    const result = calculatePhs({
      ...phsReferenceEnvironment,
      tdb: 14,
      person: defaultPhsPersonSettings,
      durationMinutes: 480,
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.stringContaining("Air temperature"),
      expect.stringContaining("Clothing insulation"),
    ]));
    expect(result.valid).toBe(false);
    expect(result.tRe).toBeNaN();
  });

  it("uses one stateful simulator for one and many segments", () => {
    const oneSegment = calculatePhsTimeSeries(
      [segment("one", 120)],
      defaultPhsPersonSettings,
    );
    const twoSegments = calculatePhsTimeSeries(
      [segment("first", 60), segment("second", 60)],
      defaultPhsPersonSettings,
    );
    const direct = calculatePhs({
      ...phsReferenceEnvironment,
      person: defaultPhsPersonSettings,
      durationMinutes: 120,
    });

    expect(twoSegments.samples).toHaveLength(121);
    expect(twoSegments.samples?.[60].segmentId).toBe("first");
    expect(twoSegments.samples?.[61].segmentId).toBe("second");
    expect(twoSegments.tRe).toBeCloseTo(oneSegment.tRe, 10);
    expect(twoSegments.tRe).toBeCloseTo(direct.tRe, 10);
    expect(twoSegments.sweatLossG).toBeCloseTo(oneSegment.sweatLossG, 8);
  });

  it("preserves physiological continuity when conditions change", () => {
    const sequence = calculatePhsTimeSeries(
      [
        segment("work", 60),
        segment("rest", 60, { met: 1.2, tdb: 25, tr: 25, rh: 50 }),
      ],
      defaultPhsPersonSettings,
    );
    const restOnly = calculatePhsTimeSeries(
      [segment("rest", 60, { met: 1.2, tdb: 25, tr: 25, rh: 50 })],
      defaultPhsPersonSettings,
    );

    expect(sequence.samples?.[61].tRe).toBeGreaterThan(
      restOnly.samples?.[1].tRe ?? Infinity,
    );
    expect(sequence.tRe).not.toBeCloseTo(restOnly.tRe, 4);
  });

  it("detects both limiting criteria and accepts histories beyond eight hours", () => {
    const result = calculatePhsTimeSeries(
      [segment("reference", 600)],
      defaultPhsPersonSettings,
    );

    expect(validatePhsTimeSeries(
      [segment("one", 300), segment("two", 301)],
      defaultPhsPersonSettings,
    )).toEqual([]);
    expect(result.totalDurationMinutes).toBe(600);
    expect(result.samples).toHaveLength(601);
    expect(result.firstRectalLimitMinute).toBe(54);
    expect(result.firstWaterLossLimitMinute).toBe(165);
    expect(result.limitingMinute).toBe(54);
    expect(result.waterLossLimitG).toBe(getPhsWaterLossLimitG(defaultPhsPersonSettings));
  });

  it("still validates positive whole-minute durations and applicability", () => {
    expect(validatePhsTimeSeries(
      [segment("fraction", 1.5)],
      defaultPhsPersonSettings,
    )[0]).toContain("positive whole number");
    expect(validatePhsTimeSeries(
      [segment("cold", 60, { tdb: 10 })],
      defaultPhsPersonSettings,
    )[0]).toContain("cold: Air temperature");
  });

  it("declares exposure history first and retains the 31 by 31 field chart", () => {
    const result = analysisResult();
    const resultsByInput = {
      [InputId.Input1]: result,
      [InputId.Input2]: null,
      [InputId.Input3]: null,
    };
    const chartSource = {
      inputs: { [InputId.Input1]: phsReferenceEnvironment },
    };
    const complianceContext = {
      unitSystem: UnitSystem.SI,
      baselineInputId: InputId.Input1,
      fieldChartConfig: { profileKind: FieldChartProfileKind.Compliance, xField: PhysicalQuantityId.DryBulbTemperature, yField: PhysicalQuantityId.RelativeHumidity, zOutput: PhysicalQuantityId.LimitingExposureTime, bands: phsModelConfig.complianceProfile!.bands },
    } as const;
    const exposureChart = buildChartPlotly(phsModelConfig,
      "body-temperature",
      chartSource,
      resultsByInput,
      complianceContext,
    );
    const fieldChart = buildChartPlotly(phsModelConfig,
      "dynamic",
      chartSource,
      resultsByInput,
      complianceContext,
    );

    expect(phsModelConfig.id).toBe(ModelId.Phs2023);
    expect(phsModelConfig.controls.map(({ id }) => id)).toEqual([
      ...requiredControlIdsByModel[ModelId.Phs2023],
    ]);
    expect(phsModelConfig.chartInstances.defaultInstanceId).toBe("body-temperature");
    expect(phsModelConfig.chartInstances.entries.map(({ instanceId }) => instanceId)).toEqual([
      "body-temperature",
      "dynamic",
    ]);
    expect(exposureChart?.traces.map(({ name }) => name)).toEqual([
      "Rectal temperature",
      "Core temperature",
      "Maximum rectal temperature",
      "First rectal-temperature limit",
      "Input 1",
    ]);
    expect(exposureChart?.traces[1].visible).toBe("legendonly");
    expect(fieldChart?.traces[0].type).toBe("scatter");
    expect(fieldChart?.traces[0].fill).toBe("toself");
    expect(fieldChart?.traces.some((trace) => trace.type === "contour")).toBe(false);
  });

  it("uses an edited Explore rectal-temperature threshold on exposure history", () => {
    const result = analysisResult();
    const chart = buildChartPlotly(phsModelConfig,
      "body-temperature",
      { inputs: { [InputId.Input1]: phsReferenceEnvironment } },
      {
        [InputId.Input1]: result,
        [InputId.Input2]: null,
        [InputId.Input3]: null,
      },
      {
        unitSystem: UnitSystem.SI,
        baselineInputId: InputId.Input1,
        fieldChartConfig: {
          profileKind: FieldChartProfileKind.Explore,
          xField: PhysicalQuantityId.DryBulbTemperature,
          yField: PhysicalQuantityId.RelativeHumidity,
          zOutput: PhysicalQuantityId.RectalTemperature,
          bands: [
            { min: -Infinity, max: 37.5, label: "Below", color: "#bbf7d0" },
            { min: 37.5, max: Infinity, label: "Above", color: "#fecaca" },
          ],
        },
      },
    );

    expect(chart?.traces[2].name).toBe("Editable rectal-temperature threshold");
    expect(chart?.traces[2].y).toEqual([37.5, 37.5]);
    expect(chart?.traces[3].name).toBe("First editable-threshold crossing");
  });

  it("builds synchronized Time-series charts from the same history", () => {
    const draft: PhsTimeSeriesDraft = {
      segments: [segment("reference", 60)],
      person: { ...defaultPhsPersonSettings },
    };
    const result = calculatePhsTimeSeries(draft.segments, draft.person);
    const temperature = chartFigure(resolveSimulationChartBuild(
      getModelSimulationOutput(ModelId.Phs2023)!.charts[0],
      result,
      draft,
      UnitSystem.SI,
    ));
    const waterLoss = chartFigure(resolveSimulationChartBuild(
      getModelSimulationOutput(ModelId.Phs2023)!.charts[1],
      result,
      draft,
      UnitSystem.SI,
    ));

    expect(temperature?.traces.map(({ name }) => name)).toEqual([
      "Rectal temperature",
      "Core temperature",
      "Maximum rectal temperature",
    ]);
    expect(temperature?.traces[1].visible).toBe("legendonly");
    expect(waterLoss?.traces[1].name).toBe("5% body-mass limit");
  });

  it("draws matching phase boundaries on both Time-series charts", () => {
    const draft: PhsTimeSeriesDraft = {
      segments: [segment("work", 30), segment("rest", 30, { met: 1.2 })],
      person: { ...defaultPhsPersonSettings },
    };
    const result = calculatePhsTimeSeries(draft.segments, draft.person);
    draft.segments[0].durationMinutes = 5;
    draft.person.drinkingAllowed = false;
    const charts = getModelSimulationOutput(ModelId.Phs2023)!.charts.map((chart) => (
      chartFigure(resolveSimulationChartBuild(chart, result, draft, UnitSystem.SI))
    ));

    for (const chart of charts) {
      const boundaries = chart?.traces.find(
        ({ name }) => name === "Segment boundaries",
      );
      expect(boundaries?.x).toEqual([0.5, 0.5, Number.NaN]);
    }
    expect(charts[1]?.traces[1].name).toBe("5% body-mass limit");
  });

  it("reports asynchronous progress and honors cancellation", async () => {
    const draft = phsTimeSeriesModelDefinition.createDefaultDraft();
    draft.segments[0].durationMinutes = 5;
    const progress: number[] = [];
    const completedController = new AbortController();

    const result = await phsTimeSeriesModelDefinition.simulate(draft, {
      signal: completedController.signal,
      onProgress: (value) => progress.push(value),
    });

    expect(result.totalDurationMinutes).toBe(5);
    expect(progress[progress.length - 1]).toBe(1);

    const cancelledController = new AbortController();
    cancelledController.abort();
    await expect(phsTimeSeriesModelDefinition.simulate(draft, {
      signal: cancelledController.signal,
      onProgress: () => undefined,
    })).rejects.toThrow("PHS simulation cancelled");
  });

  it("downsamples large histories without losing boundaries, peaks, crossings, or final points", () => {
    const samples: PhsHistorySample[] = Array.from({ length: 5_001 }, (_, minute) => ({
      minute,
      hours: minute / 60,
      segmentId: minute <= 2_500 ? "one" : "two",
      segmentName: minute <= 2_500 ? "One" : "Two",
      tRe: minute === 1_234 ? 41 : 36.8 + minute / 10_000,
      tCr: 36.8 + Math.sin(minute / 100),
      tSk: 34,
      sweatLossG: minute * 2,
    }));
    const reduced = downsamplePhsHistorySamples(samples, {
      maxPoints: 120,
      temperatureThresholdsC: [38],
      waterLossThresholdsG: [3_750],
    });
    const retainedMinutes = new Set(reduced.map(({ minute }) => minute));

    expect(reduced.length).toBeLessThanOrEqual(120);
    expect(retainedMinutes.has(1_234)).toBe(true);
    expect(retainedMinutes.has(2_500)).toBe(true);
    expect(retainedMinutes.has(2_501)).toBe(true);
    expect(retainedMinutes.has(5_000)).toBe(true);
    expect(reduced.some(({ sweatLossG }) => sweatLossG >= 3_750)).toBe(true);
  });
});
