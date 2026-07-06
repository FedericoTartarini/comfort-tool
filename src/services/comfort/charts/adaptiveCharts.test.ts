import { describe, expect, it } from "vitest";

import { AdaptiveStandardMode } from "../../../models/inputModes";
import { FieldKey } from "../../../models/fieldKeys";
import { InputId } from "../../../models/inputSlots";
import { UnitSystem } from "../../../models/units";
import { calculateAdaptive, buildAdaptiveChart, buildAdaptiveDynamicChart, getCe } from "../../../comfortModels/adaptive";

const ashraePayload = {
  tdb: 24,
  tr: 24,
  trm: 20.16,
  v: 0.1,
  units: UnitSystem.SI,
};

function getBoundaryPoint(chart: any, traceName: string, targetTrm: number, side: "lower" | "upper") {
  const trace = chart.traces.find((candidate: any) => candidate.name.includes(traceName));
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

function getAdaptiveBaseTemperature(trm: number, standardMode: AdaptiveStandardMode): number {
  return standardMode === AdaptiveStandardMode.Ashrae
    ? (0.31 * trm) + 17.8
    : (0.33 * trm) + 18.8;
}

function getBoundaryTargetTemperature(
  trm: number,
  speed: number,
  standardMode: AdaptiveStandardMode,
  boundaryIndex: number,
): number {
  const baseTemperature = getAdaptiveBaseTemperature(trm, standardMode);
  const offsets = standardMode === AdaptiveStandardMode.Ashrae
    ? [-3.5, -2.5, 2.5, 3.5]
    : [-4, -3, -2, 2, 3, 4];
  const boundaryWithoutCooling = baseTemperature + offsets[boundaryIndex];
  const isUpperBoundary = standardMode === AdaptiveStandardMode.Ashrae
    ? boundaryIndex >= 2
    : boundaryIndex >= 3;

  return isUpperBoundary
    ? boundaryWithoutCooling + getCe(speed, boundaryWithoutCooling)
    : boundaryWithoutCooling;
}

function getOutdoorBoundaryFromDynamicChart({
  standardMode,
  targetSpeed,
  targetOperativeTemperature,
  expectedOutdoorTemperature,
  outdoorAxis,
}: {
  standardMode: AdaptiveStandardMode;
  targetSpeed: number;
  targetOperativeTemperature: number;
  expectedOutdoorTemperature: number;
  outdoorAxis: "x" | "y";
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
    UnitSystem.SI,
    outdoorAxis === "x" ? FieldKey.PrevailingMeanOutdoorTemperature : FieldKey.RelativeAirSpeed,
    outdoorAxis === "x" ? FieldKey.RelativeAirSpeed : FieldKey.PrevailingMeanOutdoorTemperature,
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
        Math.abs(value - targetSpeed) < Math.abs(variableValues[bestIndex] - targetSpeed)
          ? index
          : bestIndex
      ), 0);

      expect(variableValues[closestIndex]).toBeCloseTo(targetSpeed, 4);
      return boundaryValues[closestIndex];
    });
  const closestCandidate = candidates.reduce((best, candidate) => (
    Math.abs(candidate - expectedOutdoorTemperature) < Math.abs(best - expectedOutdoorTemperature)
      ? candidate
      : best
  ), candidates[0]);

  expect(closestCandidate).toBeDefined();
  return closestCandidate;
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

    expect(tooltipLayer?.type).toBe("contour");
    expect(tooltipLayer?.contours?.coloring).toBe("none");
    expect(tooltipLayer?.z).toHaveLength(40);
    expect(tooltipLayer?.z?.[0]).toHaveLength(40);
    expect(visibleContourTraces).toHaveLength(0);
    expect(chart.traces.some((trace) => trace.type === "scatter" && trace.fill === "toself")).toBe(true);
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

  it.each([
    { standardMode: AdaptiveStandardMode.Ashrae, boundaryIndex: 0, speed: 0, label: "ASHRAE lower, no cooling" },
    { standardMode: AdaptiveStandardMode.Ashrae, boundaryIndex: 3, speed: 0.6, label: "ASHRAE upper, cooling" },
    { standardMode: AdaptiveStandardMode.En, boundaryIndex: 0, speed: 0, label: "EN lower, no cooling" },
    { standardMode: AdaptiveStandardMode.En, boundaryIndex: 5, speed: 0.6, label: "EN upper, cooling" },
  ])("round-trips outdoor-temperature inverse boundaries for $label", ({ standardMode, boundaryIndex, speed }) => {
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
    })).toBeCloseTo(expectedTrm, 1);

    expect(getOutdoorBoundaryFromDynamicChart({
      standardMode,
      targetSpeed: speed,
      targetOperativeTemperature,
      expectedOutdoorTemperature: expectedTrm,
      outdoorAxis: "y",
    })).toBeCloseTo(expectedTrm, 1);
  });
});
