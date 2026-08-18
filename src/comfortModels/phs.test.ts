import { describe, expect, it } from "vitest";

import { ChartId } from "../models/chartOptions";
import { ComfortModel } from "../models/comfortModels";
import { FieldKey } from "../models/fieldKeys";
import { InputId } from "../models/inputSlots";
import { ChartMode, ModelOutputKey } from "../models/modelCapabilities";
import {
  PHS_MAX_DURATION_MINUTES,
  PhsLimitingCriterion,
  phsReferenceEnvironment,
  phsReferencePerson,
  type PhsTimeSeriesSegment,
} from "../models/phs";
import { UnitSystem } from "../models/units";
import {
  calculatePhs,
  calculatePhsTimeSeries,
  getPhsWaterLossLimitG,
  validatePhsEnvironment,
  validatePhsTimeSeries,
} from "./phsCalculation";
import { phsModelConfig } from "./phs";
import { phsTimeSeriesModelDefinition } from "./phsTimeSeries";

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

describe("PHS ISO 7933:2023", () => {
  it("matches the selected-library reference calculation", () => {
    const result = calculatePhs({
      ...phsReferenceEnvironment,
      person: phsReferencePerson,
      durationMinutes: PHS_MAX_DURATION_MINUTES,
    });

    expect(result.valid).toBe(true);
    expect(result.tRe).toBeCloseTo(41.42377, 4);
    expect(result.dLimTreMinutes).toBe(54);
    expect(result.dLimWaterLossMinutes).toBe(165);
    expect(result.limitingExposureTimeMinutes).toBe(54);
    expect(result.limitingCriterion).toBe(
      PhsLimitingCriterion.RectalTemperature,
    );
    expect(result.sweatLossG).toBeCloseTo(8918.95, 1);
  });

  it("returns an explicit out-of-range result", () => {
    const issues = validatePhsEnvironment(
      { ...phsReferenceEnvironment, tdb: 14, clo: 1.1 },
      phsReferencePerson,
    );
    const result = calculatePhs({
      ...phsReferenceEnvironment,
      tdb: 14,
      person: phsReferencePerson,
      durationMinutes: 480,
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.stringContaining("Air temperature"),
      expect.stringContaining("Clothing insulation"),
    ]));
    expect(result.valid).toBe(false);
    expect(result.tRe).toBeNaN();
  });

  it("carries physiological state across segments", () => {
    const oneSegment = calculatePhsTimeSeries(
      [segment("one", 120)],
      phsReferencePerson,
    );
    const twoSegments = calculatePhsTimeSeries(
      [segment("first", 60), segment("second", 60)],
      phsReferencePerson,
    );
    const direct = calculatePhs({
      ...phsReferenceEnvironment,
      person: phsReferencePerson,
      durationMinutes: 120,
    });

    expect(twoSegments.points).toHaveLength(121);
    expect(twoSegments.points[60].segmentId).toBe("first");
    expect(twoSegments.points[61].segmentId).toBe("second");
    expect(twoSegments.points[120].tRe).toBeCloseTo(oneSegment.points[120].tRe, 10);
    expect(twoSegments.points[120].tRe).toBeCloseTo(direct.tRe, 10);
    expect(twoSegments.points[120].sweatLossG)
      .toBeCloseTo(oneSegment.points[120].sweatLossG, 8);
  });

  it("detects the first temperature and water-loss limits", () => {
    const result = calculatePhsTimeSeries(
      [segment("reference", 480)],
      phsReferencePerson,
    );

    expect(result.firstRectalLimitMinute).toBe(54);
    expect(result.firstWaterLossLimitMinute).toBe(165);
    expect(result.limitingMinute).toBe(54);
    expect(result.limitingCriterion).toBe(
      PhsLimitingCriterion.RectalTemperature,
    );
    expect(result.waterLossLimitG).toBe(getPhsWaterLossLimitG(phsReferencePerson));
  });

  it("validates total duration and per-segment applicability", () => {
    expect(validatePhsTimeSeries(
      [segment("one", 300), segment("two", 181)],
      phsReferencePerson,
    )).toContain("Total scenario duration cannot exceed 480 minutes.");
    expect(validatePhsTimeSeries(
      [segment("cold", 60, { tdb: 10 })],
      phsReferencePerson,
    )[0]).toContain("cold: Air temperature");
  });

  it("declares Compliance and Explore and builds a bounded 31 by 31 grid", () => {
    const result = calculatePhs({
      ...phsReferenceEnvironment,
      person: phsReferencePerson,
      durationMinutes: 480,
    });
    const chart = phsModelConfig.buildChartResult(
      ChartId.PhsDynamic,
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
          mode: ChartMode.Compliance,
          xField: FieldKey.DryBulbTemperature,
          yField: FieldKey.RelativeHumidity,
          zOutput: ModelOutputKey.PhsLimitingExposureTime,
          bands: phsModelConfig.complianceSpec!.bands,
        },
      },
    );

    expect(phsModelConfig.id).toBe(ComfortModel.Phs2023);
    expect(phsModelConfig.modes).toEqual([ChartMode.Compliance, ChartMode.Explore]);
    expect(chart?.traces[0].type).toBe("contour");
    expect(chart?.traces[0].z).toHaveLength(31);
    expect(chart?.traces[0].z?.[0]).toHaveLength(31);
    expect(chart?.traces.some(({ type }) => type === "scatter")).toBe(true);
    expect(phsModelConfig.complianceSpec?.getFeedback(result).passes).toBe(false);
  });

  it("builds the CBE-style temperature chart and water-loss extension", () => {
    const result = calculatePhsTimeSeries(
      [segment("reference", 60)],
      phsReferencePerson,
    );
    const charts = phsTimeSeriesModelDefinition.buildCharts(result, UnitSystem.SI);

    expect(charts.primary.traces.map(({ name }) => name)).toEqual([
      "Rectal temperature",
      "Core temperature",
      "Maximum rectal temperature",
    ]);
    expect(charts.primary.traces[0].line?.color).toBe("#3BBDED");
    expect(charts.primary.traces[1].line?.color).toBe("#1B679B");
    expect(charts.primary.traces[1].visible).toBe("legendonly");
    expect(charts.primary.traces[2].line?.color).toBe("#ed3b3b");
    expect(charts.secondary.traces[1].name).toBe("Water-loss limit");
  });
});
