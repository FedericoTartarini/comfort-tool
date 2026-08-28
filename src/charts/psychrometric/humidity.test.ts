import { describe, expect, it } from "vitest";

import {
  buildRelativeHumidityCurvePoints,
  humidityRatioSi,
  sampleRelativeHumidityValues,
  sliceRelativeHumidityCurve,
  type PsychrometricExtents,
} from "./humidity";

const extents: PsychrometricExtents = {
  tdbRangeSi: { min: 10, max: 40 },
  tdbPoints: 121,
  humidityRatioRangeSi: { min: 0, max: 0.03 },
};

const CBE_ATMOSPHERIC_PRESSURE_PA = 101325;

/** CBE `psy.satpress` / `psy.humratio` (ASHRAE Fundamentals 2009). */
function cbeHumidityRatio(tdb: number, relativeHumidity: number): number {
  const tKel = tdb + 273.15;
  const saturationPressure = tKel < 273.15
    ? Math.exp(
        -5674.5359 / tKel
        + 6.3925247
        + tKel * (
          -0.9677843e-2
          + tKel * (0.62215701e-6 + tKel * (0.20747825e-8 - 0.9484024e-12 * tKel))
        )
        + 4.1635019 * Math.log(tKel)
      )
    : Math.exp(
        -5800.2206 / tKel
        + 1.3914993
        + tKel * (-0.048640239 + tKel * (0.41764768e-4 - 0.14452093e-7 * tKel))
        + 6.5459673 * Math.log(tKel)
      );
  const vaporPressure = (relativeHumidity / 100) * saturationPressure;
  return (0.62198 * vaporPressure) / (CBE_ATMOSPHERIC_PRESSURE_PA - vaporPressure);
}

describe("psychrometric humidity curves", () => {
  it("samples relative humidity inclusively", () => {
    expect(sampleRelativeHumidityValues(5, 0, 100)).toEqual([0, 25, 50, 75, 100]);
  });

  it("builds an RH 100% curve whose humidity ratio matches psy_ta_rh", () => {
    const points = buildRelativeHumidityCurvePoints(100, extents);
    expect(points.length).toBeGreaterThan(10);
    const mid = points[Math.floor(points.length / 2)];
    expect(mid.humidityRatioSi).toBeCloseTo(
      humidityRatioSi(mid.temperatureSi, 100),
      12,
    );
  });

  it("slices RH 100% between two dry-bulb endpoints", () => {
    const sliced = sliceRelativeHumidityCurve(100, 20, 28, extents);
    expect(sliced[0].temperatureSi).toBeCloseTo(20, 6);
    expect(sliced[sliced.length - 1].temperatureSi).toBeCloseTo(28, 6);
    sliced.forEach((point) => {
      expect(point.humidityRatioSi).toBeCloseTo(
        humidityRatioSi(point.temperatureSi, 100),
        8,
      );
    });
  });

  it("matches CBE humidity ratio at standard atmospheric pressure", () => {
    const samples = [
      [10, 20],
      [20, 50],
      [25, 50],
      [30, 80],
      [40, 100],
    ] as const;
    samples.forEach(([tdb, rh]) => {
      expect(humidityRatioSi(tdb, rh)).toBeCloseTo(cbeHumidityRatio(tdb, rh), 6);
    });
  });
});
