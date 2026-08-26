import { describe, expect, it, vi } from "vitest";

import {
  adaptiveAshraeDeclaration,
  adaptiveAshraeModelConfig,
  adaptiveAshraeZonesList,
} from "../../../declarations/adaptive/ashrae";
import {
  adaptiveEnDeclaration,
  adaptiveEnModelConfig,
} from "../../../declarations/adaptive/en";
import {
  calculateAdaptive,
  createAdaptiveComplianceCaption,
  getCe,
} from "../../../declarations/adaptive/calculation";
import { buildAdaptiveChart } from "../../../declarations/adaptive/charts";
import type {
  AdaptiveLevelResult,
  AdaptiveModelDeclaration,
  AdaptiveRequest,
  AdaptiveResponse,
} from "../../../declarations/adaptive/shared";
import type { ModelChartSource } from "../../../catalog/chartSource";
import type {
  PlotlyChartSpec,
  PlotTrace,
} from "../../plotlyTypes";
import { PhysicalQuantityId } from "../../../catalog/quantities";
import { InputId, type InputId as InputIdType } from "../../../catalog/inputSlots";
import {
  resolveBandEdge,
  type Band,
  type BandInputsSi,
  type ChartBuildContext,
} from "../../../catalog/modelCapabilities";
import { FieldChartProfileKind } from "../../../catalog/output/fieldChartProfile";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../../catalog/units";
import { convertFieldValueFromSi } from "../../units";

const baselineRequest: AdaptiveRequest = {
  tdb: 24,
  tr: 24,
  trm: 20.16,
  v: 0.1,
};

function createContext(
  declaration: AdaptiveModelDeclaration,
  unitSystem: UnitSystemType = UnitSystem.SI,
  baselineInputId: InputIdType = InputId.Input1,
  direction: "default" | "transposed" = "default",
): ChartBuildContext<Band> {
  const xField = direction === "default"
    ? PhysicalQuantityId.PrevailingMeanOutdoorTemperature
    : PhysicalQuantityId.OperativeTemperature;
  const yField = direction === "default"
    ? PhysicalQuantityId.OperativeTemperature
    : PhysicalQuantityId.PrevailingMeanOutdoorTemperature;
  return {
    unitSystem,
    baselineInputId,
    fieldChartConfig: {
      profileKind: FieldChartProfileKind.Compliance,
      xField,
      yField,
      zOutput: declaration.complianceProfile.output,
      bands: declaration.complianceProfile.bands,
    },
  };
}

function buildChart(
  declaration: AdaptiveModelDeclaration,
  requests: Partial<Record<InputIdType, AdaptiveRequest>> = {
    [InputId.Input1]: baselineRequest,
  },
  unitSystem: UnitSystemType = UnitSystem.SI,
  baselineInputId: InputIdType = InputId.Input1,
  direction: "default" | "transposed" = "default",
): PlotlyChartSpec {
  const resultsByInput: Partial<Record<InputIdType, AdaptiveResponse | null>> = {};
  Object.entries(requests).forEach(([inputId, request]) => {
    if (request) {
      resultsByInput[inputId as InputIdType] = calculateAdaptive(declaration, request);
    }
  });

  return buildAdaptiveChart(
    declaration,
    { inputs: requests } as ModelChartSource<AdaptiveRequest>,
    resultsByInput,
    createContext(declaration, unitSystem, baselineInputId, direction),
  );
}

function getLevel(
  result: AdaptiveResponse,
  id: string,
): AdaptiveLevelResult {
  const level = result.levels.find((candidate) => candidate.id === id);
  if (!level) throw new Error(`Missing test level: ${id}`);
  return level;
}

function getRegionTraces(chart: PlotlyChartSpec): PlotTrace[] {
  return chart.traces.filter(
    ({ type, fill }) => type === "scatter" && fill === "toself",
  );
}

function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function summarizeRegions(chart: PlotlyChartSpec) {
  return getRegionTraces(chart).map((trace) => ({
    name: trace.name,
    color: trace.fillcolor,
    points: trace.x.length,
    xRange: [round(Math.min(...trace.x)), round(Math.max(...trace.x))],
    yRange: [round(Math.min(...trace.y)), round(Math.max(...trace.y))],
  }));
}

function getBoundaryPoint(
  chart: PlotlyChartSpec,
  traceName: string,
  targetOutdoorTemperature: number,
  side: "lower" | "upper",
  direction: "default" | "transposed" = "default",
): { outdoorTemperature: number; operativeTemperature: number } {
  const trace = getRegionTraces(chart).find(({ name }) => name === traceName);
  if (!trace) throw new Error(`Missing boundary trace: ${traceName}`);
  const edgePointCount = trace.x.length / 2;
  const xValues = side === "lower"
    ? trace.x.slice(0, edgePointCount)
    : trace.x.slice(edgePointCount);
  const yValues = side === "lower"
    ? trace.y.slice(0, edgePointCount)
    : trace.y.slice(edgePointCount);
  const outdoorValues = direction === "default" ? xValues : yValues;
  const operativeValues = direction === "default" ? yValues : xValues;
  const closestIndex = outdoorValues.reduce((bestIndex, value, index) => (
    Math.abs(value - targetOutdoorTemperature)
      < Math.abs(outdoorValues[bestIndex] - targetOutdoorTemperature)
      ? index
      : bestIndex
  ), 0);

  return {
    outdoorTemperature: outdoorValues[closestIndex],
    operativeTemperature: operativeValues[closestIndex],
  };
}

describe("adaptive standard mechanics", () => {
  it("derives compliance caption thresholds from the selected level", () => {
    const caption = createAdaptiveComplianceCaption(
      "Custom shading",
      {
        bandSequence: adaptiveAshraeDeclaration.bandSequence,
        coefficients: adaptiveAshraeDeclaration.coefficients,
        levels: [{
          id: "custom-level",
          label: "Custom Acceptability",
          coolOffset: -4.25,
          warmOffset: 2.75,
        }],
      },
      "custom-level",
    );

    expect(caption).toBe(
      "Custom shading; compliance is the Custom range from t_cmf − 4.25°C to t_cmf + 2.75°C, including the applicable upper-limit cooling adjustment.",
    );
  });

  it("preserves the ASHRAE and EN equations and offsets", () => {
    const ashrae = calculateAdaptive(adaptiveAshraeDeclaration, {
      ...baselineRequest,
      trm: 20,
    });
    const en = calculateAdaptive(adaptiveEnDeclaration, {
      ...baselineRequest,
      trm: 20,
    });

    expect(ashrae.tCmf).toBeCloseTo(24, 10);
    expect(getLevel(ashrae, "acceptability-80"))
      .toEqual(expect.objectContaining({ lower: 20.5, upper: 27.5 }));
    expect(getLevel(ashrae, "acceptability-90"))
      .toEqual(expect.objectContaining({ lower: 21.5, upper: 26.5 }));

    expect(en.tCmf).toBeCloseTo(25.4, 10);
    expect(getLevel(en, "category-i").lower).toBeCloseTo(22.4, 10);
    expect(getLevel(en, "category-i").upper).toBeCloseTo(27.4, 10);
    expect(getLevel(en, "category-ii").lower).toBeCloseTo(21.4, 10);
    expect(getLevel(en, "category-ii").upper).toBeCloseTo(28.4, 10);
    expect(getLevel(en, "category-iii").lower).toBeCloseTo(20.4, 10);
    expect(getLevel(en, "category-iii").upper).toBeCloseTo(29.4, 10);
  });

  it("keeps elevated-air-speed transitions exact at 0.6, 0.9, 1.2 m/s and 25 °C", () => {
    expect(getCe(0.599999, 30)).toBe(0);
    expect(getCe(0.6, 30)).toBe(1.2);
    expect(getCe(0.899999, 30)).toBe(1.2);
    expect(getCe(0.9, 30)).toBe(1.8);
    expect(getCe(1.199999, 30)).toBe(1.8);
    expect(getCe(1.2, 30)).toBe(2.2);
    expect(getCe(1.2, 24.999999)).toBe(0);
    expect(getCe(1.2, 25)).toBe(2.2);
  });

  it("applies cooling independently to each qualifying standard boundary", () => {
    const ashrae = calculateAdaptive(adaptiveAshraeDeclaration, {
      tdb: 25.5,
      tr: 25.5,
      trm: 15,
      v: 0.6,
    });
    const en = calculateAdaptive(adaptiveEnDeclaration, {
      tdb: 25.2,
      tr: 25.2,
      trm: 12,
      v: 0.6,
    });

    expect(getLevel(ashrae, "acceptability-90").upper).toBeCloseTo(24.95, 2);
    expect(getLevel(ashrae, "acceptability-80").upper).toBeCloseTo(27.15, 2);
    expect(getLevel(en, "category-i").upper).toBeCloseTo(24.76, 2);
    expect(getLevel(en, "category-ii").upper).toBeCloseTo(26.96, 2);
  });

  it("reports cold, accepted, warm, and unplottable states directly", () => {
    const cold = calculateAdaptive(adaptiveAshraeDeclaration, {
      ...baselineRequest,
      tdb: 15,
      tr: 15,
      trm: 20,
    });
    const accepted = calculateAdaptive(adaptiveAshraeDeclaration, {
      ...baselineRequest,
      trm: 20,
    });
    const warm = calculateAdaptive(adaptiveAshraeDeclaration, {
      ...baselineRequest,
      tdb: 40,
      tr: 40,
      trm: 20,
    });
    const outside = { ...baselineRequest, trm: 5 };

    expect(getLevel(cold, "acceptability-80").status)
      .toBe(adaptiveAshraeZonesList[0].label);
    expect(getLevel(accepted, "acceptability-80").status)
      .toBe(adaptiveAshraeZonesList[1].label);
    expect(getLevel(warm, "acceptability-80").status)
      .toBe(adaptiveAshraeZonesList[3].label);
    expect(calculateAdaptive(adaptiveAshraeDeclaration, outside).isApplicable).toBe(false);
  });

  it.each([
    [adaptiveAshraeDeclaration, adaptiveAshraeModelConfig],
    [adaptiveEnDeclaration, adaptiveEnModelConfig],
  ] as const)("reuses adjacent functional edges for $label and requires finite SI air speed", (
    declaration,
    config,
  ) => {
    const bands = config.complianceProfile!.bands;
    bands.slice(0, -1).forEach((band, index) => {
      expect(band.max).toBe(bands[index + 1].min);
    });
    const functionalEdge = bands[0].max;
    expect(() => resolveBandEdge(functionalEdge, 20, {})).toThrow(
      /finite canonical-SI relative air speed/i,
    );
    expect(() => resolveBandEdge(functionalEdge, 20, {
      [PhysicalQuantityId.RelativeAirSpeed]: Number.NaN,
    })).toThrow(/finite canonical-SI relative air speed/i);
    expect(resolveBandEdge(functionalEdge, 20, {
      [PhysicalQuantityId.RelativeAirSpeed]: 0.1,
    })).toBeCloseTo(
      Math.min(...calculateAdaptive(
        declaration,
        { ...baselineRequest, trm: 20 },
      ).levels.map(({ lower }) => lower!)),
      10,
    );
  });

  it.each([
    [adaptiveAshraeDeclaration, adaptiveAshraeModelConfig],
    [adaptiveEnDeclaration, adaptiveEnModelConfig],
  ] as const)("keeps $label functional boundaries contiguous", (
    declaration,
    config,
  ) => {
    const result = calculateAdaptive(declaration, { ...baselineRequest, trm: 20 });
    const bands = config.complianceProfile!.bands;
    const inputsSi: BandInputsSi = { [PhysicalQuantityId.RelativeAirSpeed]: 0.1 };

    bands.slice(0, -1).forEach((band, index) => {
      const boundary = resolveBandEdge(band.max, 20, inputsSi);
      expect(resolveBandEdge(bands[index + 1].min, 20, inputsSi)).toBe(boundary);
    });
    result.levels.forEach((level) => {
      expect(level.lower).not.toBeNull();
      expect(level.upper).not.toBeNull();
    });
  });
});

describe("single Adaptive Compliance chart", () => {
  it("keeps polygons geometric and evaluates hover points only on the tooltip grid", () => {
    const evaluateApplicability = vi.fn(
      adaptiveAshraeDeclaration.evaluateApplicability,
    );
    const declaration: AdaptiveModelDeclaration = {
      ...adaptiveAshraeDeclaration,
      evaluateApplicability,
    };
    const result = calculateAdaptive(adaptiveAshraeDeclaration, baselineRequest);
    const chart = buildAdaptiveChart(
      declaration,
      { inputs: { [InputId.Input1]: baselineRequest } },
      { [InputId.Input1]: result },
      createContext(declaration),
    );
    const regions = getRegionTraces(chart);
    const tooltip = chart.traces.find(({ name }) => name === "Tooltip Layer");
    const tooltipPointCount = tooltip?.z?.reduce(
      (count, row) => count + row.length,
      0,
    ) ?? 0;

    expect(regions.length).toBeGreaterThan(0);
    expect(regions.every(({ hoverinfo }) => hoverinfo === "skip")).toBe(true);
    expect(regions.every(({ hoverMetadata }) => hoverMetadata === undefined)).toBe(true);
    expect(tooltipPointCount).toBeGreaterThan(0);
    expect(tooltip?.hoverMetadata).toBeDefined();
    expect(evaluateApplicability).toHaveBeenCalledTimes(tooltipPointCount);
  });

  it("builds deterministic ASHRAE regions on the default SI axes", () => {
    const chart = buildChart(adaptiveAshraeDeclaration);

    expect(summarizeRegions(chart)).toEqual([
      { name: "Too Cool", color: "#3b82f6", points: 480, xRange: [10, 33.5], yRange: [10, 24.685] },
      { name: "80% Acceptability", color: "#86efac", points: 480, xRange: [10, 33.5], yRange: [17.4, 25.685] },
      { name: "90% Acceptability", color: "#22c55e", points: 480, xRange: [10, 33.5], yRange: [18.4, 30.685] },
      { name: "80% Acceptability", color: "#86efac", points: 480, xRange: [10, 33.5], yRange: [23.4, 31.685] },
      { name: "Too Warm", color: "#ef4444", points: 480, xRange: [10, 33.5], yRange: [24.4, 40] },
    ]);
    expect(chart.layout.xaxis).toEqual(expect.objectContaining({
      title: "Prevailing mean outdoor temperature (°C)",
      range: [10, 33.5],
    }));
    expect(chart.layout.yaxis).toEqual(expect.objectContaining({
      title: "Operative temperature (°C)",
      range: [10, 40],
    }));
  });

  it.each([
    adaptiveAshraeDeclaration,
    adaptiveEnDeclaration,
  ] as const)("transposes the same $label geometry onto operative-X/outdoor-Y", (
    declaration,
  ) => {
    const direct = summarizeRegions(buildChart(declaration));
    const transposedChart = buildChart(
      declaration,
      { [InputId.Input1]: baselineRequest },
      UnitSystem.SI,
      InputId.Input1,
      "transposed",
    );

    expect(summarizeRegions(transposedChart)).toEqual(direct.map((region) => ({
      ...region,
      xRange: region.yRange,
      yRange: region.xRange,
    })));
    expect(transposedChart.layout.xaxis).toEqual(expect.objectContaining({
      title: "Operative temperature (°C)",
      range: [10, 40],
    }));
    expect(transposedChart.layout.yaxis.title).toBe(
      `${declaration.outdoorTemperatureLabel} (°C)`,
    );
  });

  it("builds deterministic EN regions on the fixed SI axes", () => {
    const chart = buildChart(adaptiveEnDeclaration);

    expect(summarizeRegions(chart)).toEqual([
      { name: "Too Cool", color: "#3b82f6", points: 480, xRange: [10, 30], yRange: [10, 23.7] },
      { name: "Category III", color: "#fde047", points: 480, xRange: [10, 30], yRange: [17.1, 24.7] },
      { name: "Category II", color: "#86efac", points: 480, xRange: [10, 30], yRange: [18.1, 25.7] },
      { name: "Category I", color: "#22c55e", points: 480, xRange: [10, 30], yRange: [19.1, 30.7] },
      { name: "Category II", color: "#86efac", points: 480, xRange: [10, 30], yRange: [24.1, 31.7] },
      { name: "Category III", color: "#fde047", points: 480, xRange: [10, 30], yRange: [25.1, 32.7] },
      { name: "Too Warm", color: "#ef4444", points: 480, xRange: [10, 30], yRange: [26.1, 40] },
    ]);
    expect(chart.layout.xaxis).toEqual(expect.objectContaining({
      title: "Running mean outdoor temperature (°C)",
      range: [10, 30],
    }));
    expect(chart.traces.some(({ name }) => name === "Adaptive Zones")).toBe(false);
  });

  it.each([
    [adaptiveAshraeDeclaration, "acceptability-80", "80% Acceptability"],
    [adaptiveEnDeclaration, "category-i", "Category I"],
  ] as const)("keeps $label polygon edges aligned with calculator results", (
    declaration,
    levelId,
    traceName,
  ) => {
    const request = { ...baselineRequest, trm: 20 };
    const result = calculateAdaptive(declaration, request);
    (["default", "transposed"] as const).forEach((direction) => {
      const point = getBoundaryPoint(buildChart(
        declaration,
        { [InputId.Input1]: request },
        UnitSystem.SI,
        InputId.Input1,
        direction,
      ), traceName, request.trm, "lower", direction);

      expect(point.outdoorTemperature).toBeCloseTo(request.trm, 1);
      expect(point.operativeTemperature).toBeCloseTo(
        getLevel(result, levelId).lower!,
        1,
      );
    });
  });

  it("brackets cooling-effect discontinuities in both axis directions", () => {
    const request = { ...baselineRequest, v: 0.6 };
    const transition = (
      25 - 2.5 - adaptiveAshraeDeclaration.coefficients.intercept
    ) / adaptiveAshraeDeclaration.coefficients.slope;

    (["default", "transposed"] as const).forEach((direction) => {
      const chart = buildChart(
        adaptiveAshraeDeclaration,
        { [InputId.Input1]: request },
        UnitSystem.SI,
        InputId.Input1,
        direction,
      );
      const trace = getRegionTraces(chart).find(
        ({ name }) => name === "90% Acceptability",
      );
      if (!trace) throw new Error("Missing ASHRAE 90% region.");
      const pointCount = trace.x.length / 2;
      const outdoorValues = (direction === "default" ? trace.x : trace.y)
        .slice(pointCount);
      const operativeValues = (direction === "default" ? trace.y : trace.x)
        .slice(pointCount);
      const upperEdge = outdoorValues.map((outdoor, index) => ({
        outdoor,
        operative: operativeValues[index],
      }));
      const before = upperEdge.find(({ outdoor }) => (
        Math.abs(outdoor - (transition - 0.001)) < 1e-7
      ));
      const after = upperEdge.find(({ outdoor }) => (
        Math.abs(outdoor - (transition + 0.001)) < 1e-7
      ));

      expect(trace.x).toHaveLength(488);
      expect(before).toBeDefined();
      expect(after).toBeDefined();
      expect(after!.operative - before!.operative).toBeGreaterThan(1);
    });
  });

  it("orders regions, shared tooltip, and every comparison marker", () => {
    const input1 = { ...baselineRequest, v: 0.1 };
    const input2 = { ...baselineRequest, tdb: 26, tr: 26, v: 1.2 };
    const requests = {
      [InputId.Input1]: input1,
      [InputId.Input2]: input2,
    };
    const input1Baseline = buildChart(
      adaptiveAshraeDeclaration,
      requests,
      UnitSystem.SI,
      InputId.Input1,
    );
    const input2Baseline = buildChart(
      adaptiveAshraeDeclaration,
      requests,
      UnitSystem.SI,
      InputId.Input2,
    );
    const transposed = buildChart(
      adaptiveAshraeDeclaration,
      requests,
      UnitSystem.SI,
      InputId.Input2,
      "transposed",
    );
    const expectedRegionNames = adaptiveAshraeDeclaration.complianceProfile.bands.map(
      ({ label }) => label,
    );

    expect(input2Baseline.traces.map(({ name }) => name)).toEqual([
      ...expectedRegionNames,
      "Tooltip Layer",
      "Input 1",
      "Input 2",
    ]);
    const input1Regions = getRegionTraces(input1Baseline);
    const input2Regions = getRegionTraces(input2Baseline);
    expect(input2Regions[input2Regions.length - 1]?.y)
      .not.toEqual(input1Regions[input1Regions.length - 1]?.y);
    expect(input2Baseline.traces.filter(({ mode }) => mode === "markers").map(({ name }) => name))
      .toEqual(["Input 1", "Input 2"]);
    expect(transposed.traces.map(({ name }) => name)).toEqual(
      input2Baseline.traces.map(({ name }) => name),
    );
    const transposedInput1 = transposed.traces.find(({ name }) => name === "Input 1");
    const transposedTooltip = transposed.traces.find(({ name }) => name === "Tooltip Layer");
    const input1Result = calculateAdaptive(adaptiveAshraeDeclaration, input1);
    expect(transposedInput1?.x[0]).toBeCloseTo(input1Result.operativeTemperature, 8);
    expect(transposedInput1?.y[0]).toBeCloseTo(input1.trm, 8);
    expect(transposedTooltip?.hovertemplate).toContain("Operative temperature: %{x");
    expect(transposedTooltip?.hovertemplate).toContain(
      "Prevailing mean outdoor temperature: %{y",
    );
  });

  it("converts SI axes, polygons, markers, results, and hover metadata to IP", () => {
    const result = calculateAdaptive(adaptiveAshraeDeclaration, baselineRequest);
    const chart = buildChart(
      adaptiveAshraeDeclaration,
      { [InputId.Input1]: baselineRequest },
      UnitSystem.IP,
    );
    const transposed = buildChart(
      adaptiveAshraeDeclaration,
      { [InputId.Input1]: baselineRequest },
      UnitSystem.IP,
      InputId.Input1,
      "transposed",
    );
    const input = chart.traces.find(({ name }) => name === "Input 1");
    const tooltip = chart.traces.find(({ name }) => name === "Tooltip Layer");
    const firstRegion = getRegionTraces(chart)[0];
    const metadata = input?.hoverMetadata as unknown[];
    const level90 = getLevel(result, "acceptability-90");

    expect(chart.layout.xaxis.title).toBe("Prevailing mean outdoor temperature (°F)");
    expect(chart.layout.yaxis.title).toBe("Operative temperature (°F)");
    const xRange = chart.layout.xaxis.range as number[];
    const yRange = chart.layout.yaxis.range as number[];
    expect(xRange[0]).toBeCloseTo(50, 8);
    expect(xRange[1]).toBeCloseTo(92.3, 8);
    expect(yRange).toEqual([50, 104]);
    expect(firstRegion.x[0]).toBeCloseTo(50, 8);
    expect(firstRegion.y[0]).toBeCloseTo(50, 8);
    expect(input?.x[0]).toBeCloseTo(convertFieldValueFromSi(
      PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
      baselineRequest.trm,
      UnitSystem.IP,
    ), 8);
    expect(input?.y[0]).toBeCloseTo(convertFieldValueFromSi(
      PhysicalQuantityId.OperativeTemperature,
      result.operativeTemperature,
      UnitSystem.IP,
    ), 8);
    expect(metadata[1]).toBeCloseTo(round(convertFieldValueFromSi(
      PhysicalQuantityId.DryBulbTemperature,
      level90.lower!,
      UnitSystem.IP,
    ), 1), 8);
    expect(tooltip?.hovertemplate).toContain("°F");
    expect(tooltip?.hovertemplate).not.toContain("°C");
    const transposedInput = transposed.traces.find(({ name }) => name === "Input 1");
    const transposedRegion = getRegionTraces(transposed)[0];
    expect(transposed.layout.xaxis.title).toBe("Operative temperature (°F)");
    expect(transposed.layout.yaxis.title).toBe(
      "Prevailing mean outdoor temperature (°F)",
    );
    expect(transposedRegion.x[0]).toBeCloseTo(50, 8);
    expect(transposedRegion.y[0]).toBeCloseTo(50, 8);
    expect(transposedInput?.x[0]).toBeCloseTo(convertFieldValueFromSi(
      PhysicalQuantityId.OperativeTemperature,
      result.operativeTemperature,
      UnitSystem.IP,
    ), 8);
    expect(transposedInput?.y[0]).toBeCloseTo(convertFieldValueFromSi(
      PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
      baselineRequest.trm,
      UnitSystem.IP,
    ), 8);
  });
});
