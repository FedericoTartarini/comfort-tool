import {
  humidityRatioSi,
  sliceRelativeHumidityCurve,
  type AxisRangeSi,
  type PsychrometricExtents,
} from "./humidity";

export interface IsolinePoint {
  tdb: number;
  rh: number;
}

export interface DisplayPolyline {
  x: number[];
  y: number[];
}

export interface BandFillPolygon extends DisplayPolyline {
  name: string;
  color: string;
}

export interface DisplayScale {
  rangeSi: AxisRangeSi;
  toDisplay: (valueSi: number) => number;
}

export interface PsychrometricBand {
  min: number;
  max: number;
  label: string;
  color: string;
}

export type FieldEvaluate = (tdb: number, rh: number) => number | null;

export type IsolineBandLayout = "monotonic" | "radial";

const ROOT_SCAN_POINTS = 101;
const ROOT_MAX_BISECTION_EVALUATIONS = 40;
const ROOT_TEMPERATURE_WIDTH = 0.001;

function roundDisplay(value: number): number {
  return Number(value.toFixed(3));
}

function clampToScale(value: number, scale: DisplayScale): number {
  const displayedMin = scale.toDisplay(scale.rangeSi.min);
  const displayedMax = scale.toDisplay(scale.rangeSi.max);
  const low = Math.min(displayedMin, displayedMax);
  const high = Math.max(displayedMin, displayedMax);
  return roundDisplay(Math.min(high, Math.max(low, value)));
}

function interpolateRoot(
  low: number,
  lowDelta: number,
  high: number,
  highDelta: number,
): number {
  if (lowDelta === highDelta) return (low + high) / 2;
  const fraction = lowDelta / (lowDelta - highDelta);
  return low + (high - low) * fraction;
}

export function solveTemperatureForTarget(
  evaluate: FieldEvaluate,
  target: number,
  rh: number,
  tdbRangeSi: AxisRangeSi,
): number | null {
  const deltaAt = (temperature: number): number | null => {
    const value = evaluate(temperature, rh);
    if (value === null || !Number.isFinite(value)) return null;
    return value - target;
  };

  let previousTemperature: number | null = null;
  let previousDelta: number | null = null;
  let low: number | null = null;
  let high: number | null = null;
  let lowDelta = 0;
  let highDelta = 0;

  for (let index = 0; index < ROOT_SCAN_POINTS; index += 1) {
    const temperature = tdbRangeSi.min
      + ((tdbRangeSi.max - tdbRangeSi.min) * index) / (ROOT_SCAN_POINTS - 1);
    const delta = deltaAt(temperature);
    if (delta === null) {
      previousTemperature = null;
      previousDelta = null;
      continue;
    }
    if (
      previousTemperature !== null
      && previousDelta !== null
      && previousDelta * delta <= 0
    ) {
      low = previousTemperature;
      high = temperature;
      lowDelta = previousDelta;
      highDelta = delta;
      break;
    }
    previousTemperature = temperature;
    previousDelta = delta;
  }

  if (low === null || high === null) return null;

  let lowBound = low;
  let highBound = high;
  let lowBoundDelta = lowDelta;
  let highBoundDelta = highDelta;

  for (let index = 0; index < ROOT_MAX_BISECTION_EVALUATIONS; index += 1) {
    if (highBound - lowBound <= ROOT_TEMPERATURE_WIDTH) break;
    const midpoint = (lowBound + highBound) / 2;
    const midpointDelta = deltaAt(midpoint);
    if (midpointDelta === null) break;
    if (lowBoundDelta * midpointDelta <= 0) {
      highBound = midpoint;
      highBoundDelta = midpointDelta;
    } else {
      lowBound = midpoint;
      lowBoundDelta = midpointDelta;
    }
  }

  return interpolateRoot(lowBound, lowBoundDelta, highBound, highBoundDelta);
}

export function sampleIsoline(
  evaluate: FieldEvaluate,
  target: number,
  rhValues: readonly number[],
  tdbRangeSi: AxisRangeSi,
): IsolinePoint[] {
  const points: IsolinePoint[] = [];
  for (const relativeHumidity of rhValues) {
    const temperature = solveTemperatureForTarget(
      evaluate,
      target,
      relativeHumidity,
      tdbRangeSi,
    );
    if (temperature !== null) {
      points.push({ tdb: temperature, rh: relativeHumidity });
    }
  }
  return points;
}

export function sampleIsolines(
  evaluate: FieldEvaluate,
  targets: readonly number[],
  rhValues: readonly number[],
  tdbRangeSi: AxisRangeSi,
): Map<number, IsolinePoint[]> {
  return new Map(targets.map((target) => [
    target,
    sampleIsoline(evaluate, target, rhValues, tdbRangeSi),
  ]));
}

function displayFromPoint(
  point: IsolinePoint,
  xScale: DisplayScale,
  yScale: DisplayScale,
): { x: number; y: number } {
  return {
    x: clampToScale(xScale.toDisplay(point.tdb), xScale),
    y: clampToScale(yScale.toDisplay(humidityRatioSi(point.tdb, point.rh)), yScale),
  };
}

function polylineFromPoints(
  points: IsolinePoint[],
  xScale: DisplayScale,
  yScale: DisplayScale,
): DisplayPolyline {
  return {
    x: points.map((point) => displayFromPoint(point, xScale, yScale).x),
    y: points.map((point) => displayFromPoint(point, xScale, yScale).y),
  };
}

export function closePolyline({ x, y }: DisplayPolyline): DisplayPolyline {
  if (x.length === 0) return { x, y };
  const last = x.length - 1;
  if (x[0] === x[last] && y[0] === y[last]) return { x, y };
  return { x: [...x, x[0]], y: [...y, y[0]] };
}

function alignIsolinesByRh(
  left: IsolinePoint[],
  right: IsolinePoint[],
): { left: IsolinePoint[]; right: IsolinePoint[] } {
  const rightByRh = new Map(right.map((point) => [point.rh, point]));
  const alignedLeft: IsolinePoint[] = [];
  const alignedRight: IsolinePoint[] = [];
  left.forEach((point) => {
    const match = rightByRh.get(point.rh);
    if (!match) return;
    if (match.tdb - point.tdb <= ROOT_TEMPERATURE_WIDTH) return;
    alignedLeft.push(point);
    alignedRight.push(match);
  });
  return { left: alignedLeft, right: alignedRight };
}

function finiteFieldValue(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : value;
}

function clampIsolinePoint(
  evaluate: FieldEvaluate,
  target: number,
  rh: number,
  tdbRangeSi: AxisRangeSi,
): IsolinePoint | null {
  const valueAtMin = finiteFieldValue(evaluate(tdbRangeSi.min, rh));
  const valueAtMax = finiteFieldValue(evaluate(tdbRangeSi.max, rh));
  if (valueAtMin === null || valueAtMax === null) return null;
  if ((valueAtMin - target) * (valueAtMax - target) <= 0) return null;

  const increasing = valueAtMax >= valueAtMin;
  const bothBelow = valueAtMin < target && valueAtMax < target;
  return {
    tdb: bothBelow === increasing ? tdbRangeSi.max : tdbRangeSi.min,
    rh,
  };
}

function clampIsolinesToChartBounds(
  evaluate: FieldEvaluate,
  isolines: Map<number, IsolinePoint[]>,
  rhValues: readonly number[],
  tdbRangeSi: AxisRangeSi,
): Map<number, IsolinePoint[]> {
  return new Map([...isolines.entries()].map(([target, sampled]) => {
    const sampledByRh = new Map(sampled.map((point) => [point.rh, point]));
    const completed: IsolinePoint[] = [];
    rhValues.forEach((relativeHumidity) => {
      const existing = sampledByRh.get(relativeHumidity);
      if (existing) {
        completed.push(existing);
        return;
      }
      const clamped = clampIsolinePoint(
        evaluate,
        target,
        relativeHumidity,
        tdbRangeSi,
      );
      if (clamped) completed.push(clamped);
    });
    return [target, completed];
  }));
}

function rhCapDisplay(
  relativeHumidity: number,
  start: IsolinePoint,
  end: IsolinePoint,
  xScale: DisplayScale,
  yScale: DisplayScale,
  extents: PsychrometricExtents,
): DisplayPolyline {
  const startDisplay = displayFromPoint(start, xScale, yScale);
  const endDisplay = displayFromPoint(end, xScale, yScale);
  const interior = sliceRelativeHumidityCurve(
    relativeHumidity,
    start.tdb,
    end.tdb,
    extents,
  ).filter((point) => (
    point.temperatureSi !== start.tdb && point.temperatureSi !== end.tdb
  ));
  return {
    x: [
      startDisplay.x,
      ...interior.map((point) => clampToScale(xScale.toDisplay(point.temperatureSi), xScale)),
      endDisplay.x,
    ],
    y: [
      startDisplay.y,
      ...interior.map((point) => clampToScale(yScale.toDisplay(point.humidityRatioSi), yScale)),
      endDisplay.y,
    ],
  };
}

function concatPolylinesSkippingFirst(segments: DisplayPolyline[]): DisplayPolyline {
  const x: number[] = [];
  const y: number[] = [];
  segments.forEach((segment, index) => {
    const start = index === 0 ? 0 : 1;
    for (let pointIndex = start; pointIndex < segment.x.length; pointIndex += 1) {
      x.push(segment.x[pointIndex]);
      y.push(segment.y[pointIndex]);
    }
  });
  return { x, y };
}

export function buildRhCappedPolygon(
  leftEdge: IsolinePoint[],
  rightEdge: IsolinePoint[],
  xScale: DisplayScale,
  yScale: DisplayScale,
  extents: PsychrometricExtents,
): DisplayPolyline {
  const { left, right } = alignIsolinesByRh(leftEdge, rightEdge);
  if (left.length < 2) return { x: [], y: [] };

  const firstLeft = left[0];
  const lastLeft = left[left.length - 1];
  const firstRight = right[0];
  const lastRight = right[right.length - 1];
  return closePolyline(concatPolylinesSkippingFirst([
    polylineFromPoints(left, xScale, yScale),
    rhCapDisplay(lastLeft.rh, lastLeft, lastRight, xScale, yScale, extents),
    polylineFromPoints(right.slice().reverse(), xScale, yScale),
    rhCapDisplay(firstLeft.rh, firstRight, firstLeft, xScale, yScale, extents),
  ]));
}

function chartBoundaryPoints(template: IsolinePoint[], tdbSi: number): IsolinePoint[] {
  return template.map(({ rh }) => ({ tdb: tdbSi, rh }));
}

function isolineOrEmpty(
  isolines: Map<number, IsolinePoint[]>,
  target: number,
): IsolinePoint[] {
  return isolines.get(target) ?? [];
}

function addFill(
  fills: BandFillPolygon[],
  name: string,
  color: string,
  polygon: DisplayPolyline,
): void {
  if (polygon.x.length < 4) return;
  const uniqueName = fills.some((fill) => fill.name === name)
    ? `${name} (warm)`
    : name;
  fills.push({ name: uniqueName, color, ...polygon });
}

function bandFillName(outputLabel: string, band: PsychrometricBand): string {
  return `${outputLabel} bands: ${band.label}`;
}

function buildFiniteBandPolygon(
  leftTarget: number,
  rightTarget: number,
  isolines: Map<number, IsolinePoint[]>,
  xScale: DisplayScale,
  yScale: DisplayScale,
  extents: PsychrometricExtents,
): DisplayPolyline {
  return buildRhCappedPolygon(
    isolineOrEmpty(isolines, leftTarget),
    isolineOrEmpty(isolines, rightTarget),
    xScale,
    yScale,
    extents,
  );
}

function buildUnboundedLeftPolygon(
  rightTarget: number,
  isolines: Map<number, IsolinePoint[]>,
  xScale: DisplayScale,
  yScale: DisplayScale,
  extents: PsychrometricExtents,
): DisplayPolyline {
  const tMin = xScale.rangeSi.min;
  const right = isolineOrEmpty(isolines, rightTarget).filter((point) => (
    point.tdb > tMin && point.tdb <= xScale.rangeSi.max
  ));
  return buildRhCappedPolygon(
    chartBoundaryPoints(right, tMin),
    right,
    xScale,
    yScale,
    extents,
  );
}

function buildUnboundedRightPolygon(
  leftTarget: number,
  isolines: Map<number, IsolinePoint[]>,
  xScale: DisplayScale,
  yScale: DisplayScale,
  extents: PsychrometricExtents,
): DisplayPolyline {
  const tMax = xScale.rangeSi.max;
  const left = isolineOrEmpty(isolines, leftTarget).filter((point) => (
    point.tdb >= xScale.rangeSi.min && point.tdb < tMax
  ));
  return buildRhCappedPolygon(
    left,
    chartBoundaryPoints(left, tMax),
    xScale,
    yScale,
    extents,
  );
}

function pushMonotonicBandFills(
  fills: BandFillPolygon[],
  band: PsychrometricBand,
  outputLabel: string,
  isolines: Map<number, IsolinePoint[]>,
  xScale: DisplayScale,
  yScale: DisplayScale,
  extents: PsychrometricExtents,
): void {
  const hasMin = Number.isFinite(band.min);
  const hasMax = Number.isFinite(band.max);
  if (!hasMin && !hasMax) return;
  if (!hasMin) {
    addFill(
      fills,
      bandFillName(outputLabel, band),
      band.color,
      buildUnboundedLeftPolygon(band.max, isolines, xScale, yScale, extents),
    );
    return;
  }
  if (!hasMax) {
    addFill(
      fills,
      bandFillName(outputLabel, band),
      band.color,
      buildUnboundedRightPolygon(band.min, isolines, xScale, yScale, extents),
    );
    return;
  }
  addFill(
    fills,
    bandFillName(outputLabel, band),
    band.color,
    buildFiniteBandPolygon(band.min, band.max, isolines, xScale, yScale, extents),
  );
}

function pushRadialBandFills(
  fills: BandFillPolygon[],
  band: PsychrometricBand,
  outputLabel: string,
  isolines: Map<number, IsolinePoint[]>,
  xScale: DisplayScale,
  yScale: DisplayScale,
  extents: PsychrometricExtents,
  absFromThreshold: (threshold: number) => number,
): void {
  const hasMin = Number.isFinite(band.min);
  const hasMax = Number.isFinite(band.max);
  const innerAbs = hasMax ? absFromThreshold(band.max) : Number.NaN;
  const outerAbs = hasMin ? absFromThreshold(band.min) : Number.NaN;

  if (!hasMin && hasMax && Number.isFinite(innerAbs) && innerAbs > 0) {
    addFill(
      fills,
      bandFillName(outputLabel, band),
      band.color,
      buildFiniteBandPolygon(-innerAbs, innerAbs, isolines, xScale, yScale, extents),
    );
    return;
  }
  if (hasMin && !hasMax && Number.isFinite(outerAbs) && outerAbs > 0) {
    addFill(
      fills,
      bandFillName(outputLabel, band),
      band.color,
      buildUnboundedLeftPolygon(-outerAbs, isolines, xScale, yScale, extents),
    );
    addFill(
      fills,
      bandFillName(outputLabel, band),
      band.color,
      buildUnboundedRightPolygon(outerAbs, isolines, xScale, yScale, extents),
    );
    return;
  }
  if (
    hasMin
    && hasMax
    && Number.isFinite(outerAbs)
    && Number.isFinite(innerAbs)
    && innerAbs > outerAbs
  ) {
    addFill(
      fills,
      bandFillName(outputLabel, band),
      band.color,
      buildFiniteBandPolygon(-innerAbs, -outerAbs, isolines, xScale, yScale, extents),
    );
    addFill(
      fills,
      bandFillName(outputLabel, band),
      band.color,
      buildFiniteBandPolygon(outerAbs, innerAbs, isolines, xScale, yScale, extents),
    );
  }
}

export function buildPsychrometricBandFills({
  bands,
  isolines,
  outputLabel,
  xScale,
  yScale,
  extents,
  layout,
  evaluate,
  rhValues,
  absFromThreshold,
}: {
  bands: readonly PsychrometricBand[];
  isolines: Map<number, IsolinePoint[]>;
  outputLabel: string;
  xScale: DisplayScale;
  yScale: DisplayScale;
  extents: PsychrometricExtents;
  layout: IsolineBandLayout;
  evaluate: FieldEvaluate;
  rhValues: readonly number[];
  absFromThreshold?: (threshold: number) => number;
}): BandFillPolygon[] {
  const filledIsolines = clampIsolinesToChartBounds(
    evaluate,
    isolines,
    rhValues,
    xScale.rangeSi,
  );
  const fills: BandFillPolygon[] = [];
  bands.forEach((band) => {
    if (layout === "radial") {
      if (!absFromThreshold) {
        throw new Error("radial psychrometric fills require absFromThreshold.");
      }
      pushRadialBandFills(
        fills,
        band,
        outputLabel,
        filledIsolines,
        xScale,
        yScale,
        extents,
        absFromThreshold,
      );
      return;
    }
    pushMonotonicBandFills(
      fills,
      band,
      outputLabel,
      filledIsolines,
      xScale,
      yScale,
      extents,
    );
  });
  return fills;
}

export function buildComfortZoneOutline(
  isolines: Map<number, IsolinePoint[]>,
  leftTarget: number,
  rightTarget: number,
  xScale: DisplayScale,
  yScale: DisplayScale,
  extents: PsychrometricExtents,
): DisplayPolyline | null {
  const polygon = buildRhCappedPolygon(
    isolineOrEmpty(isolines, leftTarget),
    isolineOrEmpty(isolines, rightTarget),
    xScale,
    yScale,
    extents,
  );
  return polygon.x.length === 0 ? null : polygon;
}
