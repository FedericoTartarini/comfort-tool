import { describe, expect, it } from "vitest";

import { AdaptiveStandardMode } from "../../../models/inputModes";
import { FieldKey } from "../../../models/fieldKeys";
import { InputId } from "../../../models/inputSlots";
import { UnitSystem } from "../../../models/units";
import { calculateAdaptive, buildAdaptiveChart, buildAdaptiveDynamicChart } from "../../../comfortModels/adaptive";

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

    expect(tooltipLayer?.type).toBe("contour");
    expect(tooltipLayer?.contours?.coloring).toBe("none");
    expect(visibleContourTraces).toHaveLength(0);
    expect(chart.traces.some((trace) => trace.type === "scatter" && trace.fill === "toself")).toBe(true);
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
});
