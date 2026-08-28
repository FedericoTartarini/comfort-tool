import {
  alignIsolinesBySweep,
  clampToScale,
  closePolyline,
  ROOT_TEMPERATURE_WIDTH,
  sampleIsoline as sampleCartesianIsoline,
  sampleIsolines as sampleCartesianIsolines,
  solveIndependentForTarget,
  type AxisRangeSi,
  type BandFillPolygon,
  type DisplayPolyline,
  type DisplayScale,
  type IsolineBandLayout,
  type IsolineEvaluate,
  type IsolineSample,
} from "../isolines";
import {
  humidityRatioSi,
  sliceRelativeHumidityCurve,
  type PsychrometricExtents,
} from "./humidity";

export type { AxisRangeSi, BandFillPolygon, DisplayPolyline, DisplayScale, IsolineBandLayout };

export interface IsolinePoint {
  tdb: number;
  rh: number;
}

export interface PsychrometricBand {
  min: number;
  max: number;
  label: string;
  color: string;
}

export type FieldEvaluate = (tdb: number, rh: number) => number | null;

function toIsolinePoint(sample: IsolineSample): IsolinePoint {
  return { tdb: sample.independent, rh: sample.sweep };
}

function toIsolineSample(point: IsolinePoint): IsolineSample {
  return { independent: point.tdb, sweep: point.rh };
}

export function solveTemperatureForTarget(
  evaluate: FieldEvaluate,
  target: number,
  rh: number,
  tdbRangeSi: AxisRangeSi,
): number | null {
  return solveIndependentForTarget(
    evaluate as IsolineEvaluate,
    target,
    rh,
    tdbRangeSi,
    ROOT_TEMPERATURE_WIDTH,
  );
}

export function sampleIsoline(
  evaluate: FieldEvaluate,
  target: number,
  rhValues: readonly number[],
  tdbRangeSi: AxisRangeSi,
): IsolinePoint[] {
  return sampleCartesianIsoline(
    evaluate as IsolineEvaluate,
    target,
    rhValues,
    tdbRangeSi,
    ROOT_TEMPERATURE_WIDTH,
  ).map(toIsolinePoint);
}

export function sampleIsolines(
  evaluate: FieldEvaluate,
  targets: readonly number[],
  rhValues: readonly number[],
  tdbRangeSi: AxisRangeSi,
): Map<number, IsolinePoint[]> {
  return new Map(
    [...sampleCartesianIsolines(
      evaluate as IsolineEvaluate,
      targets,
      rhValues,
      tdbRangeSi,
      ROOT_TEMPERATURE_WIDTH,
    ).entries()].map(([target, samples]) => [
      target,
      samples.map(toIsolinePoint),
    ]),
  );
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

export { closePolyline };

function alignIsolinesByRh(
  left: IsolinePoint[],
  right: IsolinePoint[],
): { left: IsolinePoint[]; right: IsolinePoint[] } {
  const aligned = alignIsolinesBySweep(
    left.map(toIsolineSample),
    right.map(toIsolineSample),
    ROOT_TEMPERATURE_WIDTH,
  );
  return {
    left: aligned.left.map(toIsolinePoint),
    right: aligned.right.map(toIsolinePoint),
  };
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
