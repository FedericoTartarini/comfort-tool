import { describe, expect, it } from "vitest";

import {
  adaptiveAshraeDeclaration,
  adaptiveAshraeModelConfig,
  adaptiveAshraeZonesList,
} from "../../../comfortModels/adaptiveAshrae";
import {
  adaptiveEnDeclaration,
  adaptiveEnModelConfig,
  adaptiveEnZonesList,
} from "../../../comfortModels/adaptiveEn";
import {
  buildAdaptiveChart,
  buildAdaptiveDynamicChart,
  calculateAdaptive,
  tryEvaluateAdaptiveForChart,
  type AdaptiveLevelResult,
  type AdaptiveModelDeclaration,
  type AdaptiveRequestDto,
} from "../../../comfortModels/adaptiveShared";
import type { PlotlyChartResponseDto } from "../../../models/comfortDtos";
import { FieldKey, type FieldKey as FieldKeyType } from "../../../models/fieldKeys";
import { InputId } from "../../../models/inputSlots";
import {
  ChartMode,
  findBandForValue,
  ModelOutputKey,
  type ChartBuildContext,
  type InputsSi,
} from "../../../models/modelCapabilities";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../../models/units";
import { convertFieldValueFromSi } from "../../units";

const baselineRequest: AdaptiveRequestDto = {
  tdb: 24,
  tr: 24,
  trm: 20.16,
  v: 0.1,
};

function createContext(
  xAxis: FieldKeyType,
  yAxis: FieldKeyType,
  unitSystem: UnitSystemType = UnitSystem.SI,
  declaration: AdaptiveModelDeclaration = adaptiveAshraeDeclaration,
): ChartBuildContext {
  return {
    unitSystem,
    dynamicAxes: { xAxis, yAxis },
    baselineInputId: InputId.Input1,
    fieldChartConfig: {
      mode: ChartMode.Compliance,
      xField: xAxis,
      yField: yAxis,
      zOutput: declaration.complianceSpec.output,
      bands: declaration.complianceSpec.bands,
    },
  };
}

function buildFixedChart(
  declaration: AdaptiveModelDeclaration,
  request: AdaptiveRequestDto = baselineRequest,
  unitSystem: UnitSystemType = UnitSystem.SI,
): PlotlyChartResponseDto {
  const result = calculateAdaptive(declaration, request);
  return buildAdaptiveChart(
    declaration,
    { inputs: { [InputId.Input1]: request } },
    { [InputId.Input1]: result },
    createContext(
      FieldKey.PrevailingMeanOutdoorTemperature,
      FieldKey.OperativeTemperature,
      unitSystem,
      declaration,
    ),
  );
}

function buildDynamicChart(
  declaration: AdaptiveModelDeclaration,
  xAxis: FieldKeyType,
  yAxis: FieldKeyType,
  unitSystem: UnitSystemType = UnitSystem.SI,
  request: AdaptiveRequestDto = baselineRequest,
): PlotlyChartResponseDto {
  const result = calculateAdaptive(declaration, request);
  return buildAdaptiveDynamicChart(
    declaration,
    { inputs: { [InputId.Input1]: request } },
    { [InputId.Input1]: result },
    createContext(xAxis, yAxis, unitSystem, declaration),
  );
}

function getLevel(result: ReturnType<typeof calculateAdaptive>, id: string): AdaptiveLevelResult {
  const level = result.levels.find((candidate) => candidate.id === id);
  if (!level) throw new Error(`Missing test level: ${id}`);
  return level;
}

function getBoundaryPoint(
  chart: PlotlyChartResponseDto,
  traceName: string,
  targetOutdoorTemperature: number,
  side: "lower" | "upper",
): { outdoorTemperature: number; operativeTemperature: number } {
  const trace = chart.traces.find(({ name }) => name === traceName);
  if (!trace) throw new Error(`Missing boundary trace: ${traceName}`);
  const edgePointCount = Math.floor(trace.x.length / 2);
  const xValues = side === "lower"
    ? trace.x.slice(0, edgePointCount)
    : trace.x.slice(edgePointCount);
  const yValues = side === "lower"
    ? trace.y.slice(0, edgePointCount)
    : trace.y.slice(edgePointCount);
  const closestIndex = xValues.reduce((bestIndex, value, index) => (
    Math.abs(value - targetOutdoorTemperature)
      < Math.abs(xValues[bestIndex] - targetOutdoorTemperature)
      ? index
      : bestIndex
  ), 0);

  return {
    outdoorTemperature: xValues[closestIndex],
    operativeTemperature: yValues[closestIndex],
  };
}

function createBandInputs(relativeAirSpeed: number): InputsSi {
  const inputs = Object.fromEntries(
    Object.values(FieldKey).map((field) => [field, 0]),
  ) as Record<FieldKeyType, number>;
  inputs[FieldKey.RelativeAirSpeed] = relativeAirSpeed;
  return inputs;
}

describe("adaptive model mechanics", () => {
  it("applies ASHRAE elevated-air-speed cooling only to qualifying upper bounds", () => {
    const result = calculateAdaptive(adaptiveAshraeDeclaration, {
      tdb: 25.5,
      tr: 25.5,
      trm: 15,
      v: 0.6,
    });
    const level80 = getLevel(result, "acceptability-80");
    const level90 = getLevel(result, "acceptability-90");

    expect(level80.accepted).toBe(true);
    expect(level90.accepted).toBe(false);
    expect(level90.upper).toBeCloseTo(24.95, 2);
    expect(level80.upper).toBeCloseTo(27.15, 2);
  });

  it("applies EN cooling independently for each category", () => {
    const result = calculateAdaptive(adaptiveEnDeclaration, {
      tdb: 25.2,
      tr: 25.2,
      trm: 12,
      v: 0.6,
    });
    const categoryI = getLevel(result, "category-i");
    const categoryII = getLevel(result, "category-ii");

    expect(categoryI.accepted).toBe(false);
    expect(categoryII.accepted).toBe(true);
    expect(categoryI.upper).toBeCloseTo(24.76, 2);
    expect(categoryII.upper).toBeCloseTo(26.96, 2);
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
    const outside = {
      ...baselineRequest,
      trm: 5,
    };

    expect(getLevel(cold, "acceptability-80").status)
      .toBe(adaptiveAshraeZonesList[0].label);
    expect(getLevel(accepted, "acceptability-80").status)
      .toBe(adaptiveAshraeZonesList[1].label);
    expect(getLevel(warm, "acceptability-80").status)
      .toBe(adaptiveAshraeZonesList[3].label);
    expect(calculateAdaptive(adaptiveAshraeDeclaration, outside).isApplicable).toBe(false);
    expect(tryEvaluateAdaptiveForChart(adaptiveAshraeDeclaration, outside)).toBeNull();
  });

  it("keeps the two standard declarations isolated", () => {
    const request = { ...baselineRequest, trm: 20 };
    const ashrae = calculateAdaptive(adaptiveAshraeDeclaration, request);
    const en = calculateAdaptive(adaptiveEnDeclaration, request);

    expect(ashrae.standard).toBe(adaptiveAshraeDeclaration.resultStandard);
    expect(en.standard).toBe(adaptiveEnDeclaration.resultStandard);
    expect(ashrae.levels.map(({ id }) => id)).toEqual([
      "acceptability-80",
      "acceptability-90",
    ]);
    expect(en.levels.map(({ id }) => id)).toEqual([
      "category-i",
      "category-ii",
      "category-iii",
    ]);
  });

  it("aligns half-open ASHRAE results and functional compliance bands", () => {
    const baseline = calculateAdaptive(adaptiveAshraeDeclaration, {
      ...baselineRequest,
      tdb: 24,
      tr: 24,
      trm: 20,
    });
    const level80 = getLevel(baseline, "acceptability-80");
    const level90 = getLevel(baseline, "acceptability-90");
    const bands = adaptiveAshraeModelConfig.complianceSpec!.bands;
    const inputsSi = createBandInputs(0.1);
    const cases = [
      [level80.lower, bands[1], true, false],
      [level90.lower, bands[2], true, true],
      [level90.upper, bands[3], true, false],
      [level80.upper, bands[4], false, false],
    ] as const;

    cases.forEach(([temperature, expectedBand, accepted80, accepted90]) => {
      if (temperature === null) throw new Error("Expected a finite ASHRAE boundary.");
      const result = calculateAdaptive(adaptiveAshraeDeclaration, {
        ...baselineRequest,
        tdb: temperature,
        tr: temperature,
        trm: 20,
      });
      expect(getLevel(result, "acceptability-80").accepted).toBe(accepted80);
      expect(getLevel(result, "acceptability-90").accepted).toBe(accepted90);
      expect(findBandForValue(bands, temperature, 20, inputsSi)).toBe(expectedBand);
    });
  });

  it("aligns half-open EN results and functional compliance bands", () => {
    const baseline = calculateAdaptive(adaptiveEnDeclaration, {
      ...baselineRequest,
      tdb: 24,
      tr: 24,
      trm: 20,
    });
    const categoryI = getLevel(baseline, "category-i");
    const categoryII = getLevel(baseline, "category-ii");
    const categoryIII = getLevel(baseline, "category-iii");
    const bands = adaptiveEnModelConfig.complianceSpec!.bands;
    const inputsSi = createBandInputs(0.1);
    const cases = [
      [categoryIII.lower, bands[1], [false, false, true]],
      [categoryII.lower, bands[2], [false, true, true]],
      [categoryI.lower, bands[3], [true, true, true]],
      [categoryI.upper, bands[4], [false, true, true]],
      [categoryII.upper, bands[5], [false, false, true]],
      [categoryIII.upper, bands[6], [false, false, false]],
    ] as const;

    cases.forEach(([temperature, expectedBand, expectedAcceptance]) => {
      if (temperature === null) throw new Error("Expected a finite EN boundary.");
      const result = calculateAdaptive(adaptiveEnDeclaration, {
        ...baselineRequest,
        tdb: temperature,
        tr: temperature,
        trm: 20,
      });
      expect(result.levels.map(({ accepted }) => accepted)).toEqual(expectedAcceptance);
      expect(findBandForValue(bands, temperature, 20, inputsSi)).toBe(expectedBand);
    });
  });
});

describe("adaptive charts", () => {
  it.each([
    [adaptiveAshraeDeclaration, "acceptability-80", "80% Acceptability"],
    [adaptiveEnDeclaration, "category-i", "Category I"],
  ] as const)("keeps %s fixed boundaries aligned with the calculator", (
    declaration,
    levelId,
    traceName,
  ) => {
    const request = { ...baselineRequest, trm: 20 };
    const result = calculateAdaptive(declaration, request);
    const chart = buildFixedChart(declaration, request);
    const level = getLevel(result, levelId);
    const point = getBoundaryPoint(chart, traceName, request.trm, "lower");

    expect(level.lower).not.toBeNull();
    expect(point.operativeTemperature).toBeCloseTo(level.lower!, 1);
    expect(chart.traces.slice(0, declaration.complianceSpec.bands.length).map(({ name }) => name))
      .toEqual(declaration.complianceSpec.bands.map(({ label }) => label));
    expect(chart.traces[declaration.complianceSpec.bands.length].name).toBe("Tooltip Layer");
    expect(chart.traces.some(({ name }) => name === "Input 1")).toBe(true);
    expect(String(chart.layout.xaxis.title)).toContain("temperature");
    expect(String(chart.layout.yaxis.title)).toContain("Operative temperature");
  });

  it("uses the same boundary geometry with outdoor temperature on either axis", () => {
    const chartWithOutdoorX = buildDynamicChart(
      adaptiveAshraeDeclaration,
      FieldKey.PrevailingMeanOutdoorTemperature,
      FieldKey.OperativeTemperature,
    );
    const chartWithOutdoorY = buildDynamicChart(
      adaptiveAshraeDeclaration,
      FieldKey.OperativeTemperature,
      FieldKey.PrevailingMeanOutdoorTemperature,
    );
    const expectedNames = [
      "Too Cool",
      "80% Acceptability",
      "90% Acceptability",
      "80% Acceptability",
      "Too Warm",
    ];
    const getRegionNames = (chart: PlotlyChartResponseDto) => chart.traces
      .filter(({ type, fill }) => type === "scatter" && fill === "toself")
      .map(({ name }) => name);

    expect(getRegionNames(chartWithOutdoorX)).toEqual(expectedNames);
    expect(getRegionNames(chartWithOutdoorY)).toEqual(expectedNames);
    expect(chartWithOutdoorX.traces.slice(0, expectedNames.length).map(({ name }) => name))
      .toEqual(expectedNames);
    expect(chartWithOutdoorY.traces.slice(0, expectedNames.length).map(({ name }) => name))
      .toEqual(expectedNames);
    expect(chartWithOutdoorX.traces[expectedNames.length].name).toBe("Tooltip Layer");
    expect(chartWithOutdoorY.traces[expectedNames.length].name).toBe("Tooltip Layer");
    expect(chartWithOutdoorX.traces.some(({ name }) => name === "Adaptive Zones"))
      .toBe(false);
    expect(chartWithOutdoorY.traces.some(({ name }) => name === "Adaptive Zones"))
      .toBe(false);
  });

  it("uses a grid strategy when neither dynamic axis is outdoor temperature", () => {
    const chart = buildDynamicChart(
      adaptiveAshraeDeclaration,
      FieldKey.DryBulbTemperature,
      FieldKey.RelativeAirSpeed,
    );
    const zoneTrace = chart.traces.find(({ name }) => name === "Adaptive Zones");
    const inputTrace = chart.traces.find(({ name }) => name === "Input 1");

    expect(zoneTrace?.type).toBe("contour");
    expect(zoneTrace?.z).toHaveLength(50);
    expect(zoneTrace?.z?.[0]).toHaveLength(50);
    expect(zoneTrace?.z?.flat().some(Number.isFinite)).toBe(true);
    expect(inputTrace?.x).toEqual([24]);
    expect(inputTrace?.y).toEqual([0.1]);
  });

  it("requires the declared Compliance config for the shared dynamic engine", () => {
    const declaration = adaptiveAshraeDeclaration;
    const result = calculateAdaptive(declaration, baselineRequest);
    const context = createContext(
      FieldKey.DryBulbTemperature,
      FieldKey.RelativeAirSpeed,
      UnitSystem.SI,
      declaration,
    );
    const build = (fieldChartConfig: ChartBuildContext["fieldChartConfig"]) => (
      buildAdaptiveDynamicChart(
        declaration,
        { inputs: { [InputId.Input1]: baselineRequest } },
        { [InputId.Input1]: result },
        { ...context, fieldChartConfig },
      )
    );

    expect(() => build({
      mode: ChartMode.Explore,
      xField: FieldKey.DryBulbTemperature,
      yField: FieldKey.RelativeAirSpeed,
      zOutput: declaration.complianceSpec.output,
      bands: [{ min: -Infinity, max: Infinity, label: "All", color: "#fff" }],
    })).toThrow(/requires a Compliance FieldChartConfig/i);
    expect(() => build({
      ...context.fieldChartConfig!,
      mode: ChartMode.Compliance,
      zOutput: ModelOutputKey.Pmv,
    })).toThrow(/declared locked output and bands/i);
  });

  it.each([
    [FieldKey.DryBulbTemperature, FieldKey.OperativeTemperature],
    [FieldKey.OperativeTemperature, FieldKey.DryBulbTemperature],
    [FieldKey.MeanRadiantTemperature, FieldKey.OperativeTemperature],
    [FieldKey.OperativeTemperature, FieldKey.MeanRadiantTemperature],
  ] as const)("solves coupled axes transactionally for %s / %s", (xAxis, yAxis) => {
    const chart = buildDynamicChart(adaptiveAshraeDeclaration, xAxis, yAxis);
    const contour = chart.traces.find(({ type }) => type === "contour");

    expect(contour?.z?.flat().some(Number.isFinite)).toBe(true);
  });

  it("throws when dynamic axes violate the state invariant", () => {
    expect(() => buildDynamicChart(
      adaptiveAshraeDeclaration,
      FieldKey.DryBulbTemperature,
      FieldKey.DryBulbTemperature,
    )).toThrow(/unsupported adaptive dynamic axis pair/i);
    expect(() => buildDynamicChart(
      adaptiveAshraeDeclaration,
      FieldKey.RelativeHumidity,
      FieldKey.DryBulbTemperature,
    )).toThrow(/unsupported adaptive dynamic axis pair/i);
  });

  it.each([adaptiveAshraeDeclaration, adaptiveEnDeclaration])(
    "builds every declared directed axis pair in SI and IP for $label",
    (declaration) => {
      const config = declaration === adaptiveAshraeDeclaration
        ? adaptiveAshraeModelConfig
        : adaptiveEnModelConfig;
      const pairs = config.dynamicAxisFields.flatMap((xAxis) => (
        config.dynamicAxisFields
          .filter((yAxis) => xAxis !== yAxis)
          .map((yAxis) => ({ xAxis, yAxis }))
      ));

      [UnitSystem.SI, UnitSystem.IP].forEach((unitSystem) => {
        pairs.forEach(({ xAxis, yAxis }) => {
          const chart = buildDynamicChart(
            declaration,
            xAxis,
            yAxis,
            unitSystem,
          );
          expect(chart.traces.length).toBeGreaterThan(0);
        });
      });
    },
  );

  it("converts fixed and dynamic coordinates and hover metadata for IP display", () => {
    const fixed = buildFixedChart(
      adaptiveAshraeDeclaration,
      baselineRequest,
      UnitSystem.IP,
    );
    const dynamic = buildDynamicChart(
      adaptiveAshraeDeclaration,
      FieldKey.PrevailingMeanOutdoorTemperature,
      FieldKey.OperativeTemperature,
      UnitSystem.IP,
    );
    const expectedOutdoor = convertFieldValueFromSi(
      FieldKey.PrevailingMeanOutdoorTemperature,
      baselineRequest.trm,
      UnitSystem.IP,
    );
    const fixedInput = fixed.traces.find(({ name }) => name === "Input 1");
    const dynamicInput = dynamic.traces.find(({ name }) => name === "Input 1");
    const fixedTooltip = fixed.traces.find(({ name }) => name === "Tooltip Layer");
    const dynamicTooltip = dynamic.traces.find(({ name }) => name === "Tooltip Layer");

    expect(fixedInput?.x[0]).toBeCloseTo(expectedOutdoor, 6);
    expect(dynamicInput?.x[0]).toBeCloseTo(expectedOutdoor, 6);
    expect(fixedTooltip?.hovertemplate).toContain("°F");
    expect(dynamicTooltip?.hovertemplate).toContain("°F");
    expect(fixedTooltip?.hovertemplate).not.toContain("°C");
  });

  it("keeps EN boundary bands ordered and contiguous", () => {
    const chart = buildDynamicChart(
      adaptiveEnDeclaration,
      FieldKey.PrevailingMeanOutdoorTemperature,
      FieldKey.OperativeTemperature,
    );
    const regions = chart.traces.filter(
      ({ type, fill }) => type === "scatter" && fill === "toself",
    );

    expect(regions.map(({ name }) => name)).toEqual([
      adaptiveEnZonesList[0].label,
      adaptiveEnZonesList[1].label,
      adaptiveEnZonesList[2].label,
      adaptiveEnZonesList[3].label,
      adaptiveEnZonesList[2].label,
      adaptiveEnZonesList[1].label,
      adaptiveEnZonesList[4].label,
    ]);
    regions.slice(0, -1).forEach((region, index) => {
      const pointCount = region.y.length / 2;
      const next = regions[index + 1];
      const sampleIndex = Math.floor(pointCount / 2);
      const upperValue = region.y[(2 * pointCount) - 1 - sampleIndex];
      expect(upperValue).toBeCloseTo(next.y[sampleIndex], 6);
    });
  });
});
