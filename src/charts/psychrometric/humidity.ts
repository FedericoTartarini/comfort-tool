import { psy_ta_rh } from "jsthermalcomfort";

export interface AxisRangeSi {
  min: number;
  max: number;
}

export interface PsychrometricExtents {
  tdbRangeSi: AxisRangeSi;
  tdbPoints: number;
  humidityRatioRangeSi: AxisRangeSi;
}

export interface PsychrometricCurvePoint {
  temperatureSi: number;
  humidityRatioSi: number;
}

export function humidityRatioSi(temperatureSi: number, relativeHumidity: number): number {
  return psy_ta_rh(temperatureSi, relativeHumidity).hr;
}

export function sampleRelativeHumidityValues(
  points: number,
  rhMin = 0,
  rhMax = 100,
): number[] {
  if (points === 1) return [rhMin];
  return Array.from(
    { length: points },
    (_, index) => rhMin + ((rhMax - rhMin) * index) / (points - 1),
  );
}

function appendDistinctCurvePoint(
  points: PsychrometricCurvePoint[],
  point: PsychrometricCurvePoint,
): void {
  const previous = points[points.length - 1];
  if (
    previous
    && Math.abs(previous.temperatureSi - point.temperatureSi) < 1e-9
    && Math.abs(previous.humidityRatioSi - point.humidityRatioSi) < 1e-12
  ) {
    return;
  }
  points.push(point);
}

function interpolateCurvePointAtHumidityRatio(
  lower: PsychrometricCurvePoint,
  upper: PsychrometricCurvePoint,
  targetHumidityRatioSi: number,
): PsychrometricCurvePoint {
  const humidityRatioSpan = upper.humidityRatioSi - lower.humidityRatioSi;
  const fraction = humidityRatioSpan === 0
    ? 0
    : (targetHumidityRatioSi - lower.humidityRatioSi) / humidityRatioSpan;
  return {
    temperatureSi: lower.temperatureSi
      + (upper.temperatureSi - lower.temperatureSi) * fraction,
    humidityRatioSi: targetHumidityRatioSi,
  };
}

function buildPsychrometricTemperatures(extents: PsychrometricExtents): number[] {
  const { min, max } = extents.tdbRangeSi;
  const points = extents.tdbPoints;
  return Array.from(
    { length: points },
    (_, index) => (
      points === 1 ? min : min + ((max - min) * index) / (points - 1)
    ),
  );
}

export function buildRelativeHumidityCurvePoints(
  relativeHumidity: number,
  extents: PsychrometricExtents,
): PsychrometricCurvePoint[] {
  const rawPoints = buildPsychrometricTemperatures(extents).map((temperatureSi) => ({
    temperatureSi,
    humidityRatioSi: humidityRatioSi(temperatureSi, relativeHumidity),
  }));
  const { min, max } = extents.humidityRatioRangeSi;
  const clippedPoints: PsychrometricCurvePoint[] = [];

  rawPoints.forEach((point, index) => {
    const previous = rawPoints[index - 1];
    if (previous && previous.humidityRatioSi < min && point.humidityRatioSi >= min) {
      appendDistinctCurvePoint(
        clippedPoints,
        interpolateCurvePointAtHumidityRatio(previous, point, min),
      );
    }
    if (point.humidityRatioSi >= min && point.humidityRatioSi <= max) {
      appendDistinctCurvePoint(clippedPoints, point);
    }
    if (previous && previous.humidityRatioSi <= max && point.humidityRatioSi > max) {
      appendDistinctCurvePoint(
        clippedPoints,
        interpolateCurvePointAtHumidityRatio(previous, point, max),
      );
    }
  });

  return clippedPoints;
}

function interpolateCurvePointAtTemperature(
  points: PsychrometricCurvePoint[],
  temperatureSi: number,
): PsychrometricCurvePoint | null {
  if (points.length === 0) return null;
  if (temperatureSi <= points[0].temperatureSi) return points[0];
  const last = points[points.length - 1];
  if (temperatureSi >= last.temperatureSi) return last;
  for (let index = 1; index < points.length; index += 1) {
    const upper = points[index];
    const lower = points[index - 1];
    if (temperatureSi > upper.temperatureSi) continue;
    const span = upper.temperatureSi - lower.temperatureSi;
    const fraction = span === 0 ? 0 : (temperatureSi - lower.temperatureSi) / span;
    return {
      temperatureSi,
      humidityRatioSi: lower.humidityRatioSi
        + (upper.humidityRatioSi - lower.humidityRatioSi) * fraction,
    };
  }
  return last;
}

export function sliceRelativeHumidityCurve(
  relativeHumidity: number,
  tStartSi: number,
  tEndSi: number,
  extents: PsychrometricExtents,
): PsychrometricCurvePoint[] {
  const points = buildRelativeHumidityCurvePoints(relativeHumidity, extents);
  if (points.length === 0) return [];
  const ascending = tEndSi >= tStartSi;
  const low = Math.min(tStartSi, tEndSi);
  const high = Math.max(tStartSi, tEndSi);
  const start = interpolateCurvePointAtTemperature(points, low);
  const end = interpolateCurvePointAtTemperature(points, high);
  const sliced: PsychrometricCurvePoint[] = [];
  if (start) sliced.push(start);
  points.forEach((point) => {
    if (point.temperatureSi > low && point.temperatureSi < high) {
      sliced.push(point);
    }
  });
  if (end) sliced.push(end);
  return ascending ? sliced : sliced.slice().reverse();
}
