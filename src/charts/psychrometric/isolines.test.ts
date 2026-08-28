import { describe, expect, it } from "vitest";

import { humidityRatioSi, sliceRelativeHumidityCurve, type PsychrometricExtents } from "./humidity";
import {
  buildComfortZoneOutline,
  buildPsychrometricBandFills,
  buildRhCappedPolygon,
  closePolyline,
  sampleIsoline,
  solveTemperatureForTarget,
  type DisplayScale,
} from "./isolines";

const extents: PsychrometricExtents = {
  tdbRangeSi: { min: 10, max: 40 },
  tdbPoints: 121,
  humidityRatioRangeSi: { min: 0, max: 0.03 },
};

const identityScale = (rangeSi: DisplayScale["rangeSi"]): DisplayScale => ({
  rangeSi,
  toDisplay: (value) => value,
});

const xScale = identityScale(extents.tdbRangeSi);
const yScale = identityScale(extents.humidityRatioRangeSi);

function linearField(tdb: number, rh: number): number {
  return (tdb - 25) + 0.02 * (rh - 50);
}

describe("psychrometric isolines", () => {
  it("solves dry-bulb to about 0.001 °C", () => {
    const temperature = solveTemperatureForTarget(
      linearField,
      0,
      50,
      extents.tdbRangeSi,
    );
    expect(temperature).not.toBeNull();
    expect(Math.abs((temperature ?? Number.NaN) - 25)).toBeLessThanOrEqual(0.001);
  });

  it("moves dry-bulb continuously as RH changes", () => {
    const rhValues = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const points = sampleIsoline(linearField, 0, rhValues, extents.tdbRangeSi);
    expect(points).toHaveLength(rhValues.length);
    const uniqueT = new Set(points.map((point) => Number(point.tdb.toFixed(4))));
    expect(uniqueT.size).toBe(points.length);
    for (let index = 1; index < points.length; index += 1) {
      expect(Math.abs(points[index].tdb - points[index - 1].tdb)).toBeGreaterThan(0.05);
    }
  });

  it("closes polygons and caps the top along RH 100%", () => {
    const rhValues = [0, 50, 100];
    const cool = sampleIsoline(linearField, -0.5, rhValues, extents.tdbRangeSi);
    const warm = sampleIsoline(linearField, 0.5, rhValues, extents.tdbRangeSi);
    const polygon = buildRhCappedPolygon(cool, warm, xScale, yScale, extents);
    const cool100 = cool.find(({ rh }) => rh === 100);
    const warm100 = warm.find(({ rh }) => rh === 100);
    if (!cool100 || !warm100) throw new Error("Expected RH 100% isoline roots.");
    const topCap = sliceRelativeHumidityCurve(100, cool100.tdb, warm100.tdb, extents);

    expect(polygon.x[0]).toBe(polygon.x[polygon.x.length - 1]);
    expect(polygon.y[0]).toBe(polygon.y[polygon.y.length - 1]);
    expect(polygon.x.length).toBeGreaterThan(cool.length + warm.length);
    topCap.forEach((point) => {
      expect(polygon.x).toContain(Number(point.temperatureSi.toFixed(3)));
    });
  });

  it("shares Neutral vertices between adjacent fills and the comfort outline", () => {
    const rhValues = [0, 50, 100];
    const isolines = new Map([
      [-1.5, sampleIsoline(linearField, -1.5, rhValues, extents.tdbRangeSi)],
      [-0.5, sampleIsoline(linearField, -0.5, rhValues, extents.tdbRangeSi)],
      [0.5, sampleIsoline(linearField, 0.5, rhValues, extents.tdbRangeSi)],
      [1.5, sampleIsoline(linearField, 1.5, rhValues, extents.tdbRangeSi)],
    ]);
    const fills = buildPsychrometricBandFills({
      bands: [
        { min: -1.5, max: -0.5, label: "Slightly Cool", color: "#00f" },
        { min: -0.5, max: 0.5, label: "Neutral", color: "#0f0" },
        { min: 0.5, max: 1.5, label: "Slightly Warm", color: "#f00" },
      ],
      isolines,
      outputLabel: "PMV",
      xScale,
      yScale,
      extents,
      layout: "monotonic",
      evaluate: linearField,
      rhValues,
    });
    const outline = buildComfortZoneOutline(isolines, -0.5, 0.5, xScale, yScale, extents);
    const slightlyCool = fills.find(({ name }) => name.includes("Slightly Cool"));
    const neutral = fills.find(({ name }) => name.includes("Neutral"));
    if (!slightlyCool || !neutral || !outline) {
      throw new Error("Expected adjacent band polygons.");
    }
    const coolEdge = isolines.get(-0.5) ?? [];

    expect(neutral).toEqual(expect.objectContaining({
      x: outline.x,
      y: outline.y,
    }));
    coolEdge.forEach((point) => {
      const x = Number(point.tdb.toFixed(3));
      expect(slightlyCool.x).toContain(x);
      expect(neutral.x).toContain(x);
    });
  });

  it("builds radial inner and outer fills from an absolute threshold", () => {
    const abs = 0.4;
    const rhValues = [0, 50, 100];
    const isolines = new Map([
      [-abs, sampleIsoline(linearField, -abs, rhValues, extents.tdbRangeSi)],
      [abs, sampleIsoline(linearField, abs, rhValues, extents.tdbRangeSi)],
    ]);
    const fills = buildPsychrometricBandFills({
      bands: [
        { min: Number.NEGATIVE_INFINITY, max: 8, label: "Lower", color: "#123456" },
        { min: 8, max: Number.POSITIVE_INFINITY, label: "Outer", color: "#abcdef" },
      ],
      isolines,
      outputLabel: "PPD (%)",
      xScale,
      yScale,
      extents,
      layout: "radial",
      evaluate: linearField,
      rhValues,
      absFromThreshold: (threshold) => (threshold === 8 ? abs : Number.NaN),
    });

    expect(fills.map(({ color }) => color)).toEqual(
      expect.arrayContaining(["#123456", "#abcdef"]),
    );
    expect(fills.some(({ name }) => name.includes("(warm)"))).toBe(true);
  });

  it("closePolyline is a no-op when the path is already closed", () => {
    const closed = closePolyline({ x: [1, 2, 1], y: [3, 4, 3] });
    expect(closed).toEqual({ x: [1, 2, 1], y: [3, 4, 3] });
  });

  it("keeps RH-cap humidity ratio on the saturation curve", () => {
    const rhValues = [0, 100];
    const cool = sampleIsoline(linearField, -0.5, rhValues, extents.tdbRangeSi);
    const warm = sampleIsoline(linearField, 0.5, rhValues, extents.tdbRangeSi);
    const cool100 = cool.find(({ rh }) => rh === 100);
    const warm100 = warm.find(({ rh }) => rh === 100);
    if (!cool100 || !warm100) throw new Error("Expected RH 100% roots.");
    expect(humidityRatioSi(cool100.tdb, 100)).toBeGreaterThan(0);
    expect(warm100.tdb).toBeGreaterThan(cool100.tdb);
  });

  it("extends a finite band to tMax when the right isoline is off-chart at low RH", () => {
    const rhValues = [0, 50, 100];
    function saturatingField(tdb: number, rh: number): number {
      return 0.1 * (tdb - 10) + 0.02 * rh - 1;
    }
    const isolines = new Map([
      [1.5, sampleIsoline(saturatingField, 1.5, rhValues, extents.tdbRangeSi)],
      [2.5, sampleIsoline(saturatingField, 2.5, rhValues, extents.tdbRangeSi)],
    ]);
    expect(isolines.get(2.5)?.some(({ rh }) => rh === 0)).toBe(false);

    const fills = buildPsychrometricBandFills({
      bands: [
        { min: 1.5, max: 2.5, label: "Warm", color: "#e15759" },
        { min: 2.5, max: Number.POSITIVE_INFINITY, label: "Hot", color: "#cc79a7" },
      ],
      isolines,
      outputLabel: "PMV",
      xScale,
      yScale,
      extents,
      layout: "monotonic",
      evaluate: saturatingField,
      rhValues,
    });
    const warm = fills.find(({ name }) => name.includes("Warm"));
    const hot = fills.find(({ name }) => name.includes("Hot"));
    if (!warm || !hot) throw new Error("Expected Warm and Hot fills.");

    const humidityAtTMaxRh0 = humidityRatioSi(extents.tdbRangeSi.max, 0);
    expect(warm.x).toContain(extents.tdbRangeSi.max);
    expect(Math.min(...warm.y)).toBeLessThanOrEqual(humidityAtTMaxRh0 + 1e-6);
    expect(Math.min(...hot.y)).toBeGreaterThan(humidityAtTMaxRh0 + 0.005);
  });
});
