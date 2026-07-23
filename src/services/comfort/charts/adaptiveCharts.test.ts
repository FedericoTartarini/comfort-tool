import { describe, expect, it } from "vitest";

import { AdaptiveStandardMode } from "../../../models/inputModes";
import { FieldKey } from "../../../models/fieldKeys";
import { InputId } from "../../../models/inputSlots";
import { findBandForValue, type InputsSi } from "../../../models/modelCapabilities";
import { UnitSystem } from "../../../models/units";
import {
  adaptiveAshraeModelConfig,
  adaptiveEnModelConfig,
  calculateAdaptive,
  buildAdaptiveChart,
  buildAdaptiveDynamicChart,
} from "../../../comfortModels/adaptive";
import { convertFieldValueFromSi, convertFieldValueToSi } from "../../units";

const ashraePayload = {
  tdb: 24,
  tr: 24,
  trm: 20.16,
  v: 0.1,
  units: UnitSystem.SI,
};

function createBandInputsSi(relativeAirSpeed: number): InputsSi {
  const inputsSi = Object.fromEntries(
    Object.values(FieldKey).map((fieldKey) => [fieldKey, 0]),
  ) as Record<(typeof FieldKey)[keyof typeof FieldKey], number>;
  inputsSi[FieldKey.RelativeAirSpeed] = relativeAirSpeed;
  return inputsSi;
}

function calculateAtOperativeTemperature(
  operativeTemperature: number,
  standardMode: AdaptiveStandardMode,
) {
  return calculateAdaptive({
    tdb: operativeTemperature,
    tr: operativeTemperature,
    trm: 20,
    v: 0.1,
    units: UnitSystem.SI,
  }, standardMode);
}

function getBoundaryPoint(chart: any, traceName: string, targetTrm: number, side: "lower" | "upper") {
  const trace = chart.traces.find((candidate: any) => candidate.name === `Input 1 ${traceName}`);
  expect(trace).toBeDefined();

  const lowerPointCount = Math.floor(trace!.x.length / 2);
  const xValues = side === "lower"
    ? trace!.x.slice(0, lowerPointCount)
    : trace!.x.slice(lowerPointCount);
  const yValues = side === "lower"
    ? trace!.y.slice(0, lowerPointCount)
    : trace!.y.slice(lowerPointCount);
  const closestIndex = xValues.reduce((bestIndex: number, x: number, index: number) => (
    Math.abs(x - targetTrm) < Math.abs(xValues[bestIndex] - targetTrm) ? index : bestIndex
  ), 0);

  return {
    trm: xValues[closestIndex],
    operativeTemperature: yValues[closestIndex],
  };
}

function getBoundaryTargetTemperature(
  trm: number,
  speed: number,
  standardMode: AdaptiveStandardMode,
  boundaryIndex: number,
): number {
  const result = calculateAdaptive({
    tdb: 25,
    tr: 25,
    trm,
    v: speed,
    units: UnitSystem.SI,
  }, standardMode);
  const boundaries = standardMode === AdaptiveStandardMode.Ashrae
    ? [
      result.tmp_cmf_80_low,
      result.tmp_cmf_90_low,
      result.tmp_cmf_90_up,
      result.tmp_cmf_80_up,
    ]
    : [
      result.tmp_cmf_cat_iii_low,
      result.tmp_cmf_cat_ii_low,
      result.tmp_cmf_cat_i_low,
      result.tmp_cmf_cat_i_up,
      result.tmp_cmf_cat_ii_up,
      result.tmp_cmf_cat_iii_up,
    ];
  const boundary = boundaries[boundaryIndex];

  expect(boundary).toBeTypeOf("number");
  expect(Number.isFinite(boundary)).toBe(true);
  return boundary!;
}

function getOutdoorBoundaryFromDynamicChart({
  standardMode,
  targetSpeed,
  targetOperativeTemperature,
  expectedOutdoorTemperature,
  outdoorAxis,
  unitSystem,
}: {
  standardMode: AdaptiveStandardMode;
  targetSpeed: number;
  targetOperativeTemperature: number;
  expectedOutdoorTemperature: number;
  outdoorAxis: "x" | "y";
  unitSystem: UnitSystem;
}) {
  const chart = buildAdaptiveDynamicChart(
    {
      inputs: {
        [InputId.Input1]: {
          tdb: targetOperativeTemperature,
          tr: targetOperativeTemperature,
          trm: 20,
          v: targetSpeed,
          units: UnitSystem.SI,
        } as any,
      },
    },
    standardMode,
    unitSystem,
    outdoorAxis === "x" ? FieldKey.PrevailingMeanOutdoorTemperature : FieldKey.RelativeAirSpeed,
    outdoorAxis === "x" ? FieldKey.RelativeAirSpeed : FieldKey.PrevailingMeanOutdoorTemperature,
  );
  const targetSpeedDisplay = convertFieldValueFromSi(
    FieldKey.RelativeAirSpeed,
    targetSpeed,
    unitSystem,
  );
  const expectedOutdoorDisplay = convertFieldValueFromSi(
    FieldKey.PrevailingMeanOutdoorTemperature,
    expectedOutdoorTemperature,
    unitSystem,
  );
  const candidates = chart.traces
    .filter((trace) => trace.type === "scatter" && trace.fill === "toself")
    .flatMap((trace) => {
      const pointCount = Math.floor((trace.x?.length ?? 0) / 2);
      return [
        {
          x: (trace.x as number[]).slice(0, pointCount),
          y: (trace.y as number[]).slice(0, pointCount),
        },
        {
          x: (trace.x as number[]).slice(pointCount),
          y: (trace.y as number[]).slice(pointCount),
        },
      ];
    })
    .map((edge) => {
      const variableValues = outdoorAxis === "x" ? edge.y : edge.x;
      const boundaryValues = outdoorAxis === "x" ? edge.x : edge.y;
      const closestIndex = variableValues.reduce((bestIndex, value, index) => (
        Math.abs(value - targetSpeedDisplay) < Math.abs(variableValues[bestIndex] - targetSpeedDisplay)
          ? index
          : bestIndex
      ), 0);

      expect(variableValues[closestIndex]).toBeCloseTo(targetSpeedDisplay, 4);
      return boundaryValues[closestIndex];
    });
  const closestCandidate = candidates.reduce((best, candidate) => (
    Math.abs(candidate - expectedOutdoorDisplay) < Math.abs(best - expectedOutdoorDisplay)
      ? candidate
      : best
  ), candidates[0]);

  expect(closestCandidate).toBeDefined();
  return convertFieldValueToSi(
    FieldKey.PrevailingMeanOutdoorTemperature,
    closestCandidate,
    unitSystem,
  );
}

function getBoundaryBandTraces(chart: any) {
  return chart.traces.filter((trace: any) => (
    trace.type === "scatter" && trace.fill === "toself"
  ));
}

function getBandSpan(trace: any, boundaryCoordinate: "x" | "y") {
  const values = trace[boundaryCoordinate] as number[];
  const pointCount = values.length / 2;
  const index = Math.floor(pointCount / 2);

  return {
    lower: values[index],
    upper: values[(2 * pointCount) - 1 - index],
  };
}

function expectIpBoundaryHover(trace: any) {
  expect(trace).toBeDefined();
  expect(trace!.hovertemplate).toContain("°F");
  expect(trace!.hovertemplate).not.toContain("°C");
}

function expectIpBoundaryMetadata(metadata: any[] | undefined) {
  expect(metadata).toBeDefined();
  expect(metadata![1]).toBeGreaterThan(40);
  expect(metadata![2]).toBeGreaterThan(40);
}

describe("adaptive charts", () => {
  it("keeps ASHRAE static chart boundaries within jsthermalcomfort rounding tolerance", () => {
    const chart = buildAdaptiveChart(
      {
        inputs: {
          [InputId.Input1]: ashraePayload as any,
        },
      },
      AdaptiveStandardMode.Ashrae,
    );
    const lower80 = getBoundaryPoint(chart, "80% Acceptability", ashraePayload.trm, "lower");
    const upper80 = getBoundaryPoint(chart, "80% Acceptability", ashraePayload.trm, "upper");
    const lower90 = getBoundaryPoint(chart, "90% Acceptability", ashraePayload.trm, "lower");
    const upper90 = getBoundaryPoint(chart, "90% Acceptability", ashraePayload.trm, "upper");
    const result = calculateAdaptive(
      {
        ...ashraePayload,
        trm: lower80.trm,
      } as any,
      AdaptiveStandardMode.Ashrae,
    );

    expect(lower80.operativeTemperature).toBeCloseTo(result.tmp_cmf_80_low!, 1);
    expect(upper80.operativeTemperature).toBeCloseTo(result.tmp_cmf_80_up!, 1);
    expect(lower90.operativeTemperature).toBeCloseTo(result.tmp_cmf_90_low!, 1);
    expect(upper90.operativeTemperature).toBeCloseTo(result.tmp_cmf_90_up!, 1);
    expect(chart.traces[0].name).toBe("Tooltip Layer");
    expect(chart.traces.slice(1, 3).map((trace) => trace.name)).toEqual([
      "Input 1 80% Acceptability",
      "Input 1 90% Acceptability",
    ]);
    expect(chart.traces[1].isZone).toBe(true);
    expect(chart.traces[2].isZone).toBe(true);
    expect(chart.traces[0].z).toHaveLength(40);
    expect(chart.traces[0].z?.[0]).toHaveLength(40);
    expect(chart.traces.some((trace) => trace.type === "scatter" && trace.name === "Input 1")).toBe(true);
    expect(String(chart.layout.xaxis.title)).toContain("Prevailing");
    expect(String(chart.layout.yaxis.title)).toContain("Operative temperature");
  });

  it("renders mean-outdoor-temperature dynamic charts as smooth bands instead of grid contours", () => {
    const chart = buildAdaptiveDynamicChart(
      {
        inputs: {
          [InputId.Input1]: ashraePayload as any,
        },
      },
      AdaptiveStandardMode.Ashrae,
      UnitSystem.SI,
      FieldKey.PrevailingMeanOutdoorTemperature,
      FieldKey.OperativeTemperature,
    );

    const tooltipLayer = chart.traces.find((trace) => trace.name === "Tooltip Layer");
    const visibleContourTraces = chart.traces.filter((trace) => trace.type === "contour" && trace.name !== "Tooltip Layer");
    const inputTraceIndex = chart.traces.findIndex((trace) => trace.type === "scatter" && trace.name === "Input 1");
    const firstBoundaryIndex = chart.traces.findIndex((trace) => trace.type === "scatter" && trace.fill === "toself");
    const boundaryNames = chart.traces
      .filter((trace) => trace.type === "scatter" && trace.fill === "toself")
      .map((trace) => trace.name);

    expect(tooltipLayer?.type).toBe("contour");
    expect(tooltipLayer?.contours?.coloring).toBe("none");
    expect(tooltipLayer?.z).toHaveLength(40);
    expect(tooltipLayer?.z?.[0]).toHaveLength(40);
    expect(visibleContourTraces).toHaveLength(0);
    expect(chart.traces.some((trace) => trace.type === "scatter" && trace.fill === "toself")).toBe(true);
    expect(boundaryNames).toEqual([
      "Too Cool",
      "80% Acceptability",
      "90% Acceptability",
      "80% Acceptability",
      "Too Warm",
    ]);
    expect(firstBoundaryIndex).toBeGreaterThan(0);
    expect(inputTraceIndex).toBeGreaterThan(firstBoundaryIndex);
  });

  it("keeps boundary bands when mean outdoor temperature is the dynamic y-axis", () => {
    const chart = buildAdaptiveDynamicChart(
      {
        inputs: {
          [InputId.Input1]: ashraePayload as any,
        },
      },
      AdaptiveStandardMode.Ashrae,
      UnitSystem.SI,
      FieldKey.OperativeTemperature,
      FieldKey.PrevailingMeanOutdoorTemperature,
    );

    const visibleContourTraces = chart.traces.filter((trace) => trace.type === "contour" && trace.name !== "Tooltip Layer");
    const inputTrace = chart.traces.find((trace) => trace.type === "scatter" && trace.name === "Input 1");
    const boundaryTrace = chart.traces.find((trace) => trace.type === "scatter" && trace.fill === "toself");

    expect(chart.traces[0].name).toBe("Tooltip Layer");
    expect(visibleContourTraces).toHaveLength(0);
    expect(boundaryTrace?.x.length).toBeGreaterThan(0);
    expect(boundaryTrace?.y.length).toBeGreaterThan(0);
    expect(Math.min(...(boundaryTrace?.y as number[]))).toBeCloseTo(10, 1);
    expect(Math.max(...(boundaryTrace?.y as number[]))).toBeCloseTo(33.5, 1);
    expect(inputTrace?.x).toEqual([24]);
    expect(inputTrace?.y).toEqual([20.16]);
    expect(String(chart.layout.xaxis.title)).toContain("Operative temperature");
    expect(String(chart.layout.yaxis.title)).toContain("Mean outdoor temperature");
  });

  it("renders non-outdoor adaptive dynamic charts as grid contours", () => {
    const chart = buildAdaptiveDynamicChart(
      {
        inputs: {
          [InputId.Input1]: ashraePayload as any,
        },
      },
      AdaptiveStandardMode.Ashrae,
      UnitSystem.SI,
      FieldKey.DryBulbTemperature,
      FieldKey.RelativeAirSpeed,
    );
    const zoneContour = chart.traces.find((trace) => trace.name === "Adaptive Zones");
    const inputTrace = chart.traces.find((trace) => trace.type === "scatter" && trace.name === "Input 1");

    expect(zoneContour?.type).toBe("contour");
    expect(zoneContour?.isBackgroundZone).toBe(true);
    expect(zoneContour?.z).toHaveLength(50);
    expect(zoneContour?.z?.[0]).toHaveLength(50);
    expect(inputTrace?.x).toEqual([24]);
    expect(inputTrace?.y).toEqual([0.1]);
    expect(String(chart.layout.xaxis.title)).toContain("Air temperature");
    expect(String(chart.layout.yaxis.title)).toContain("Air speed");
  });

  it.each([
    { xAxis: FieldKey.DryBulbTemperature, yAxis: FieldKey.OperativeTemperature },
    { xAxis: FieldKey.OperativeTemperature, yAxis: FieldKey.DryBulbTemperature },
    { xAxis: FieldKey.MeanRadiantTemperature, yAxis: FieldKey.OperativeTemperature },
    { xAxis: FieldKey.OperativeTemperature, yAxis: FieldKey.MeanRadiantTemperature },
    { xAxis: FieldKey.RelativeAirSpeed, yAxis: FieldKey.WindSpeed },
    { xAxis: FieldKey.WindSpeed, yAxis: FieldKey.RelativeAirSpeed },
  ])("rejects coupled adaptive axes $xAxis / $yAxis", ({ xAxis, yAxis }) => {
    const chart = buildAdaptiveDynamicChart(
      {
        inputs: {
          [InputId.Input1]: ashraePayload as any,
        },
      },
      AdaptiveStandardMode.Ashrae,
      UnitSystem.SI,
      xAxis,
      yAxis,
    );

    expect(chart.traces).toEqual([]);
    expect(chart.layout.title).toBe("Invalid Axes Selection");
  });

  it("renders EN static chart boundary regions and input markers", () => {
    const chart = buildAdaptiveChart(
      {
        inputs: {
          [InputId.Input1]: ashraePayload as any,
        },
      },
      AdaptiveStandardMode.En,
    );
    const boundaryNames = chart.traces
      .filter((trace) => trace.type === "scatter" && trace.fill === "toself")
      .map((trace) => trace.name);

    expect(chart.traces[0].name).toBe("Tooltip Layer");
    expect(String(chart.layout.title)).toContain("EN 16798-1");
    expect(boundaryNames.some((name) => name.includes("Category I"))).toBe(true);
    expect(boundaryNames.some((name) => name.includes("Category II"))).toBe(true);
    expect(boundaryNames.some((name) => name.includes("Category III"))).toBe(true);
    expect(chart.traces.some((trace) => trace.type === "scatter" && trace.name === "Input 1")).toBe(true);
  });

  it.each([UnitSystem.SI, UnitSystem.IP])(
    "keeps EN Category I/II/III cool-side boundaries aligned with calculation results in %s",
    (unitSystem) => {
      const payload = {
        ...ashraePayload,
        trm: 20,
      };
      const result = calculateAdaptive(payload, AdaptiveStandardMode.En);
      const chart = buildAdaptiveChart(
        { inputs: { [InputId.Input1]: payload as any } },
        AdaptiveStandardMode.En,
        unitSystem,
      );
      const targetTrm = convertFieldValueFromSi(
        FieldKey.PrevailingMeanOutdoorTemperature,
        payload.trm,
        unitSystem,
      );
      const boundaries = [
        ["Category I", result.tmp_cmf_cat_i_low, 22.4],
        ["Category II", result.tmp_cmf_cat_ii_low, 21.4],
        ["Category III", result.tmp_cmf_cat_iii_low, 20.4],
      ] as const;

      boundaries.forEach(([label, calculatedBoundary, expectedSi]) => {
        expect(calculatedBoundary).toBeCloseTo(expectedSi, 6);
        const chartPoint = getBoundaryPoint(chart, label, targetTrm, "lower");
        const expectedDisplay = convertFieldValueFromSi(
          FieldKey.DryBulbTemperature,
          calculatedBoundary!,
          unitSystem,
        );
        expect(chartPoint.operativeTemperature).toBeCloseTo(expectedDisplay, 1);
      });
    },
  );

  it.each([
    {
      standardMode: AdaptiveStandardMode.Ashrae,
      expectedNames: [
        "Too Cool",
        "80% Acceptability",
        "90% Acceptability",
        "80% Acceptability",
        "Too Warm",
      ],
      expectedColors: ["#3b82f6", "#86efac", "#22c55e", "#86efac", "#ef4444"],
    },
    {
      standardMode: AdaptiveStandardMode.En,
      expectedNames: [
        "Too Cool",
        "Category III",
        "Category II",
        "Category I",
        "Category II",
        "Category III",
        "Too Warm",
      ],
      expectedColors: [
        "#3b82f6",
        "#fde047",
        "#86efac",
        "#22c55e",
        "#86efac",
        "#fde047",
        "#ef4444",
      ],
    },
  ])("keeps complete ordered $standardMode boundary bands and reverses inverse air-speed bands", ({
    standardMode,
    expectedNames,
    expectedColors,
  }) => {
    const temperatureChart = buildAdaptiveDynamicChart(
      { inputs: { [InputId.Input1]: ashraePayload as any } },
      standardMode,
      UnitSystem.SI,
      FieldKey.PrevailingMeanOutdoorTemperature,
      FieldKey.OperativeTemperature,
    );
    const temperatureBands = getBoundaryBandTraces(temperatureChart);

    expect(temperatureBands.map((trace: any) => trace.name)).toEqual(expectedNames);
    expect(temperatureBands.map((trace: any) => trace.fillcolor)).toEqual(expectedColors);
    const temperatureSpans = temperatureBands.map((trace: any) => getBandSpan(trace, "y"));
    temperatureSpans.forEach((span: { lower: number; upper: number }) => {
      expect(span.lower).toBeLessThanOrEqual(span.upper);
    });
    temperatureSpans.slice(0, -1).forEach((span: { upper: number }, index: number) => {
      expect(span.upper).toBeCloseTo(temperatureSpans[index + 1].lower, 6);
    });

    const inverseChart = buildAdaptiveDynamicChart(
      { inputs: { [InputId.Input1]: ashraePayload as any } },
      standardMode,
      UnitSystem.SI,
      FieldKey.PrevailingMeanOutdoorTemperature,
      FieldKey.RelativeAirSpeed,
    );
    const inverseBands = getBoundaryBandTraces(inverseChart);

    const inverseNames = inverseBands.map((trace: any) => trace.name);
    const inverseColors = inverseBands.map((trace: any) => trace.fillcolor);
    const reversedNames = expectedNames.slice().reverse();
    const reversedColors = expectedColors.slice().reverse();
    const visibleSequenceStart = reversedNames.findIndex((_, index) => (
      reversedNames.slice(index, index + inverseNames.length).every((name, sequenceIndex) => (
        name === inverseNames[sequenceIndex]
      ))
    ));

    expect(visibleSequenceStart).toBeGreaterThanOrEqual(0);
    expect(inverseColors).toEqual(
      reversedColors.slice(visibleSequenceStart, visibleSequenceStart + inverseColors.length),
    );
    const inverseSpans = inverseBands.map((trace: any) => getBandSpan(trace, "x"));
    inverseSpans.forEach((span: { lower: number; upper: number }) => {
      expect(span.lower).toBeLessThanOrEqual(span.upper);
    });
    inverseSpans.slice(0, -1).forEach((span: { upper: number }, index: number) => {
      expect(span.upper).toBeCloseTo(inverseSpans[index + 1].lower, 6);
    });
  });

  it.each([
    {
      standardMode: AdaptiveStandardMode.Ashrae,
      modelConfig: adaptiveAshraeModelConfig,
    },
    {
      standardMode: AdaptiveStandardMode.En,
      modelConfig: adaptiveEnModelConfig,
    },
  ])("builds every configured compatible $standardMode axis pair in SI and IP", ({
    standardMode,
    modelConfig,
  }) => {
    const compatiblePairs = modelConfig.dynamicAxisFields.flatMap((xAxis) => (
      modelConfig.dynamicAxisFields
        .filter((yAxis) => (
          xAxis !== yAxis &&
          (modelConfig.dynamicAxisPairValidator?.(xAxis, yAxis) ?? true)
        ))
        .map((yAxis) => ({ xAxis, yAxis }))
    ));

    [UnitSystem.SI, UnitSystem.IP].forEach((unitSystem) => {
      compatiblePairs.forEach(({ xAxis, yAxis }) => {
        const chart = buildAdaptiveDynamicChart(
          { inputs: { [InputId.Input1]: ashraePayload as any } },
          standardMode,
          unitSystem,
          xAxis,
          yAxis,
        );

        expect(chart.layout.title).not.toBe("Invalid Axes Selection");
        expect(chart.traces.length).toBeGreaterThan(0);
      });
    });
  });

  it("uses IP units for static adaptive boundary hover text and metadata", () => {
    const chart = buildAdaptiveChart(
      {
        inputs: {
          [InputId.Input1]: ashraePayload as any,
        },
      },
      AdaptiveStandardMode.Ashrae,
      UnitSystem.IP,
    );
    const tooltipLayer = chart.traces.find((trace) => trace.name === "Tooltip Layer");
    const inputTrace = chart.traces.find((trace) => trace.type === "scatter" && trace.name === "Input 1");

    expectIpBoundaryHover(tooltipLayer);
    expectIpBoundaryHover(inputTrace);
    expectIpBoundaryMetadata(tooltipLayer?.hoverMetadata?.[0]?.[0] as any[] | undefined);
  });

  it("uses IP units for outdoor adaptive dynamic boundary hover text and metadata", () => {
    const chart = buildAdaptiveDynamicChart(
      {
        inputs: {
          [InputId.Input1]: ashraePayload as any,
        },
      },
      AdaptiveStandardMode.Ashrae,
      UnitSystem.IP,
      FieldKey.PrevailingMeanOutdoorTemperature,
      FieldKey.OperativeTemperature,
    );
    const tooltipLayer = chart.traces.find((trace) => trace.name === "Tooltip Layer");
    const inputTrace = chart.traces.find((trace) => trace.type === "scatter" && trace.name === "Input 1");

    expectIpBoundaryHover(tooltipLayer);
    expectIpBoundaryHover(inputTrace);
    expectIpBoundaryMetadata(tooltipLayer?.hoverMetadata?.[0]?.[0] as any[] | undefined);
  });

  it("uses IP units for non-outdoor adaptive dynamic grid hover text and metadata", () => {
    const chart = buildAdaptiveDynamicChart(
      {
        inputs: {
          [InputId.Input1]: ashraePayload as any,
        },
      },
      AdaptiveStandardMode.Ashrae,
      UnitSystem.IP,
      FieldKey.DryBulbTemperature,
      FieldKey.RelativeAirSpeed,
    );
    const zoneContour = chart.traces.find((trace) => trace.name === "Adaptive Zones");
    const inputTrace = chart.traces.find((trace) => trace.type === "scatter" && trace.name === "Input 1");

    expectIpBoundaryHover(zoneContour);
    expectIpBoundaryHover(inputTrace);
    expectIpBoundaryMetadata(zoneContour?.hoverMetadata?.[0]?.[0] as any[] | undefined);
  });

  it("calculates ASHRAE acceptability correctly at trm = 15°C, to = 25.5°C, v = 0.6 m/s (no cooling effect on 90% bound)", () => {
    // trm = 15 => tCmf = 0.31 * 15 + 17.8 = 22.45
    // 90% unadjusted upper limit = 22.45 + 2.5 = 24.95 < 25.0 => ce = 0 => limit = 24.95.
    // 80% unadjusted upper limit = 22.45 + 3.5 = 25.95 >= 25.0 => ce = 1.2 => limit = 27.15.
    // Operative temp = 25.5°C is inside 80% limit but outside 90% limit.
    const result = calculateAdaptive(
      {
        tdb: 25.5,
        tr: 25.5,
        trm: 15.0,
        v: 0.6,
        units: UnitSystem.SI,
      } as any,
      AdaptiveStandardMode.Ashrae,
    );

    expect(result.isCompliant).toBe(true);
    expect(result.acceptability_80).toBe(true);
    expect(result.acceptability_90).toBe(false);
    expect(result.tmp_cmf_90_up).toBeCloseTo(24.95, 2);
    expect(result.tmp_cmf_80_up).toBeCloseTo(27.15, 2);
  });

  it("calculates EN acceptability correctly at trm = 12°C, to = 25.2°C, v = 0.6 m/s (no cooling effect on Cat I bound)", () => {
    // trm = 12 => tCmf = 0.33 * 12 + 18.8 = 22.76
    // Cat I unadjusted upper limit = 22.76 + 2 = 24.76 < 25.0 => ce = 0 => limit = 24.76.
    // Cat II unadjusted upper limit = 22.76 + 3 = 25.76 >= 25.0 => ce = 1.2 => limit = 26.96.
    // Operative temp = 25.2°C is inside Cat II but outside Cat I.
    const result = calculateAdaptive(
      {
        tdb: 25.2,
        tr: 25.2,
        trm: 12.0,
        v: 0.6,
        units: UnitSystem.SI,
      } as any,
      AdaptiveStandardMode.En,
    );

    expect(result.isCompliant).toBe(true);
    expect(result.acceptability_cat_i).toBe(false);
    expect(result.acceptability_cat_ii).toBe(true);
    expect(result.tmp_cmf_cat_i_up).toBeCloseTo(24.76, 2);
    expect(result.tmp_cmf_cat_ii_up).toBeCloseTo(26.96, 2);
  });

  it("keeps ASHRAE calculation results aligned with half-open compliance bands", () => {
    const baseline = calculateAtOperativeTemperature(24, AdaptiveStandardMode.Ashrae);
    const bands = adaptiveAshraeModelConfig.complianceSpec!.bands;
    const inputsSi = createBandInputsSi(0.1);
    const cases = [
      {
        value: baseline.tmp_cmf_80_low!,
        expectedBand: bands[1],
        acceptability80: true,
        acceptability90: false,
      },
      {
        value: baseline.tmp_cmf_90_low!,
        expectedBand: bands[2],
        acceptability80: true,
        acceptability90: true,
      },
      {
        value: baseline.tmp_cmf_90_up!,
        expectedBand: bands[3],
        acceptability80: true,
        acceptability90: false,
      },
      {
        value: baseline.tmp_cmf_80_up!,
        expectedBand: bands[4],
        acceptability80: false,
        acceptability90: false,
      },
    ];

    cases.forEach(({ value, expectedBand, acceptability80, acceptability90 }) => {
      const result = calculateAtOperativeTemperature(value, AdaptiveStandardMode.Ashrae);

      expect(result.acceptability_80).toBe(acceptability80);
      expect(result.acceptability_90).toBe(acceptability90);
      expect(findBandForValue(bands, value, 20, inputsSi)).toBe(expectedBand);
    });
  });

  it("keeps EN calculation results aligned with half-open compliance bands", () => {
    const baseline = calculateAtOperativeTemperature(24, AdaptiveStandardMode.En);
    const bands = adaptiveEnModelConfig.complianceSpec!.bands;
    const inputsSi = createBandInputsSi(0.1);
    const cases = [
      {
        value: baseline.tmp_cmf_cat_iii_low!,
        expectedBand: bands[1],
        acceptability: [false, false, true],
      },
      {
        value: baseline.tmp_cmf_cat_ii_low!,
        expectedBand: bands[2],
        acceptability: [false, true, true],
      },
      {
        value: baseline.tmp_cmf_cat_i_low!,
        expectedBand: bands[3],
        acceptability: [true, true, true],
      },
      {
        value: baseline.tmp_cmf_cat_i_up!,
        expectedBand: bands[4],
        acceptability: [false, true, true],
      },
      {
        value: baseline.tmp_cmf_cat_ii_up!,
        expectedBand: bands[5],
        acceptability: [false, false, true],
      },
      {
        value: baseline.tmp_cmf_cat_iii_up!,
        expectedBand: bands[6],
        acceptability: [false, false, false],
      },
    ];

    cases.forEach(({ value, expectedBand, acceptability }) => {
      const result = calculateAtOperativeTemperature(value, AdaptiveStandardMode.En);

      expect([
        result.acceptability_cat_i,
        result.acceptability_cat_ii,
        result.acceptability_cat_iii,
      ]).toEqual(acceptability);
      expect(findBandForValue(bands, value, 20, inputsSi)).toBe(expectedBand);
    });
  });

  it.each([
    { standardMode: AdaptiveStandardMode.Ashrae, boundaryIndex: 0, speed: 0, unitSystem: UnitSystem.SI, label: "ASHRAE lower, no cooling, SI" },
    { standardMode: AdaptiveStandardMode.Ashrae, boundaryIndex: 3, speed: 0.6, unitSystem: UnitSystem.SI, label: "ASHRAE upper, cooling, SI" },
    { standardMode: AdaptiveStandardMode.En, boundaryIndex: 0, speed: 0, unitSystem: UnitSystem.SI, label: "EN lower, no cooling, SI" },
    { standardMode: AdaptiveStandardMode.En, boundaryIndex: 5, speed: 0.6, unitSystem: UnitSystem.SI, label: "EN upper, cooling, SI" },
    { standardMode: AdaptiveStandardMode.Ashrae, boundaryIndex: 0, speed: 0, unitSystem: UnitSystem.IP, label: "ASHRAE lower, no cooling, IP" },
    { standardMode: AdaptiveStandardMode.Ashrae, boundaryIndex: 3, speed: 0.6, unitSystem: UnitSystem.IP, label: "ASHRAE upper, cooling, IP" },
    { standardMode: AdaptiveStandardMode.En, boundaryIndex: 0, speed: 0, unitSystem: UnitSystem.IP, label: "EN lower, no cooling, IP" },
    { standardMode: AdaptiveStandardMode.En, boundaryIndex: 5, speed: 0.6, unitSystem: UnitSystem.IP, label: "EN upper, cooling, IP" },
  ])("round-trips outdoor-temperature inverse boundaries for $label", ({ standardMode, boundaryIndex, speed, unitSystem }) => {
    const expectedTrm = 20;
    const targetOperativeTemperature = getBoundaryTargetTemperature(
      expectedTrm,
      speed,
      standardMode,
      boundaryIndex,
    );

    expect(getOutdoorBoundaryFromDynamicChart({
      standardMode,
      targetSpeed: speed,
      targetOperativeTemperature,
      expectedOutdoorTemperature: expectedTrm,
      outdoorAxis: "x",
      unitSystem,
    })).toBeCloseTo(expectedTrm, 1);

    expect(getOutdoorBoundaryFromDynamicChart({
      standardMode,
      targetSpeed: speed,
      targetOperativeTemperature,
      expectedOutdoorTemperature: expectedTrm,
      outdoorAxis: "y",
      unitSystem,
    })).toBeCloseTo(expectedTrm, 1);
  });
});
