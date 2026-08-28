import { describe, expect, it } from "vitest";

import {
  buildCartesianBandFills,
  buildLinearCappedPolygon,
  closePolyline,
  isolineRootWidth,
  ROOT_TEMPERATURE_WIDTH,
  sampleIsoline,
  sampleSweepValues,
  solveIndependentForTarget,
  type DisplayScale,
} from "./isolines";

const independentRange = { min: 10, max: 40 };
const sweepRange = { min: 0, max: 100 };

const identityScale = (rangeSi: DisplayScale["rangeSi"]): DisplayScale => ({
  rangeSi,
  toDisplay: (value) => value,
});

const xScale = identityScale(independentRange);
const yScale = identityScale(sweepRange);

function linearField(independent: number, sweep: number): number {
  return (independent - 25) + 0.02 * (sweep - 50);
}

describe("cartesian isolines", () => {
  it("solves the independent axis to about 0.001 on a 30 °C span", () => {
    const independent = solveIndependentForTarget(
      linearField,
      0,
      50,
      independentRange,
    );
    expect(independent).not.toBeNull();
    expect(Math.abs((independent ?? Number.NaN) - 25)).toBeLessThanOrEqual(
      ROOT_TEMPERATURE_WIDTH,
    );
  });

  it("scales root width with the independent span", () => {
    expect(isolineRootWidth({ min: 10, max: 40 })).toBeCloseTo(
      ROOT_TEMPERATURE_WIDTH,
      12,
    );
    expect(isolineRootWidth({ min: 0, max: 2 })).toBeCloseTo(
      ROOT_TEMPERATURE_WIDTH * (2 / 30),
      12,
    );
  });

  it("samples 121 sweep points by default", () => {
    const sweepValues = sampleSweepValues(sweepRange);
    expect(sweepValues).toHaveLength(121);
    expect(sweepValues[0]).toBe(0);
    expect(sweepValues[sweepValues.length - 1]).toBe(100);
  });

  it("skips sweep values with no root", () => {
    function saturatingField(independent: number, sweep: number): number {
      return 0.1 * (independent - 10) + 0.02 * sweep - 1;
    }
    const points = sampleIsoline(
      saturatingField,
      2.5,
      [0, 50, 100],
      independentRange,
    );
    expect(points.some(({ sweep }) => sweep === 0)).toBe(false);
    expect(points.some(({ sweep }) => sweep === 100)).toBe(true);
  });

  it("caps polygons with straight edges and keeps vertices on the threshold", () => {
    const sweepValues = [0, 50, 100];
    const cool = sampleIsoline(linearField, -0.5, sweepValues, independentRange);
    const warm = sampleIsoline(linearField, 0.5, sweepValues, independentRange);
    const polygon = buildLinearCappedPolygon(
      cool,
      warm,
      "x",
      xScale,
      yScale,
      ROOT_TEMPERATURE_WIDTH,
    );

    expect(polygon.x[0]).toBe(polygon.x[polygon.x.length - 1]);
    expect(polygon.y[0]).toBe(polygon.y[polygon.y.length - 1]);
    cool.forEach((point) => {
      expect(polygon.x).toContain(point.independent);
      expect(linearField(point.independent, point.sweep)).toBeCloseTo(-0.5, 5);
    });
  });

  it("keeps solver vertices on the polygon without display rounding", () => {
    const independent = solveIndependentForTarget(
      linearField,
      0,
      37,
      independentRange,
    );
    expect(independent).not.toBeNull();
    const cool = sampleIsoline(linearField, 0, [37], independentRange);
    expect(cool[0]?.independent).toBe(independent);
  });

  it("projects swapped axes so the independent value lands on y", () => {
    const sweepValues = [0, 100];
    const cool = sampleIsoline(linearField, -0.5, sweepValues, independentRange);
    const warm = sampleIsoline(linearField, 0.5, sweepValues, independentRange);
    const polygon = buildLinearCappedPolygon(
      cool,
      warm,
      "y",
      yScale,
      xScale,
      ROOT_TEMPERATURE_WIDTH,
    );
    cool.forEach((point) => {
      expect(polygon.y).toContain(point.independent);
      expect(polygon.x).toContain(point.sweep);
    });
  });

  it("builds monotonic fills that share Neutral vertices", () => {
    const sweepValues = [0, 50, 100];
    const isolines = new Map([
      [-0.5, sampleIsoline(linearField, -0.5, sweepValues, independentRange)],
      [0.5, sampleIsoline(linearField, 0.5, sweepValues, independentRange)],
    ]);
    const fills = buildCartesianBandFills({
      bands: [
        { min: -0.5, max: 0.5, label: "Neutral", color: "#0f0" },
      ],
      isolines,
      outputLabel: "PMV",
      independentAxis: "x",
      xScale,
      yScale,
      layout: "monotonic",
      evaluate: linearField,
      sweepValues,
    });
    const neutral = fills.find(({ name }) => name.includes("Neutral"));
    if (!neutral) throw new Error("Expected Neutral fill.");
    expect(closePolyline(neutral).x[0]).toBe(neutral.x[neutral.x.length - 1]);
  });
});
