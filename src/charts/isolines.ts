export interface AxisRangeSi {
  min: number;
  max: number;
}

export interface IsolineSample {
  independent: number;
  sweep: number;
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

export type IsolineEvaluate = (
  independent: number,
  sweep: number,
) => number | null;

export type IsolineBandLayout = "monotonic" | "radial";

export const ISOLINE_SWEEP_POINTS = 121;
export const ROOT_SCAN_POINTS = 21;
export const ROOT_MAX_BISECTION_EVALUATIONS = 40;
/** Temperature root width on the 10–40 °C psychrometric span. */
export const ROOT_TEMPERATURE_WIDTH = 0.001;

const REFERENCE_TEMPERATURE_SPAN = 30;

export function isolineRootWidth(independentRange: AxisRangeSi): number {
  const span = independentRange.max - independentRange.min;
  if (!(span > 0)) return ROOT_TEMPERATURE_WIDTH;
  return span * (ROOT_TEMPERATURE_WIDTH / REFERENCE_TEMPERATURE_SPAN);
}

export function sampleSweepValues(
  range: AxisRangeSi,
  points = ISOLINE_SWEEP_POINTS,
): number[] {
  if (points <= 1) return [range.min];
  return Array.from(
    { length: points },
    (_, index) => range.min + ((range.max - range.min) * index) / (points - 1),
  );
}

export function clampToScale(value: number, scale: DisplayScale): number {
  const displayedMin = scale.toDisplay(scale.rangeSi.min);
  const displayedMax = scale.toDisplay(scale.rangeSi.max);
  const low = Math.min(displayedMin, displayedMax);
  const high = Math.max(displayedMin, displayedMax);
  return Math.min(high, Math.max(low, value));
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

export function solveIndependentForTarget(
  evaluate: IsolineEvaluate,
  target: number,
  sweep: number,
  independentRange: AxisRangeSi,
  rootWidth = isolineRootWidth(independentRange),
  hint?: number | null,
): number | null {
  const deltaAt = (independent: number): number | null => {
    const value = evaluate(independent, sweep);
    if (value === null || !Number.isFinite(value)) return null;
    return value - target;
  };

  const scanForBracket = (range: AxisRangeSi): {
    low: number;
    high: number;
    lowDelta: number;
    highDelta: number;
  } | null => {
    let previousIndependent: number | null = null;
    let previousDelta: number | null = null;
    for (let index = 0; index < ROOT_SCAN_POINTS; index += 1) {
      const independent = range.min
        + ((range.max - range.min) * index) / Math.max(1, ROOT_SCAN_POINTS - 1);
      const delta = deltaAt(independent);
      if (delta === null) {
        previousIndependent = null;
        previousDelta = null;
        continue;
      }
      if (
        previousIndependent !== null
        && previousDelta !== null
        && previousDelta * delta <= 0
      ) {
        return {
          low: previousIndependent,
          high: independent,
          lowDelta: previousDelta,
          highDelta: delta,
        };
      }
      previousIndependent = independent;
      previousDelta = delta;
    }
    return null;
  };

  const hintWindow = isolineRootWidth(independentRange) * 2000;
  const localRange = hint != null && Number.isFinite(hint)
    ? {
      min: Math.max(independentRange.min, hint - hintWindow),
      max: Math.min(independentRange.max, hint + hintWindow),
    }
    : independentRange;
  const bracket = scanForBracket(localRange)
    ?? (localRange === independentRange ? null : scanForBracket(independentRange));
  if (!bracket) return null;

  let lowBound = bracket.low;
  let highBound = bracket.high;
  let lowBoundDelta = bracket.lowDelta;
  let highBoundDelta = bracket.highDelta;

  for (let index = 0; index < ROOT_MAX_BISECTION_EVALUATIONS; index += 1) {
    if (highBound - lowBound <= rootWidth) break;
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
  evaluate: IsolineEvaluate,
  target: number,
  sweepValues: readonly number[],
  independentRange: AxisRangeSi,
  rootWidth = isolineRootWidth(independentRange),
): IsolineSample[] {
  const points: IsolineSample[] = [];
  let previousIndependent: number | null = null;
  for (const sweep of sweepValues) {
    const independent = solveIndependentForTarget(
      evaluate,
      target,
      sweep,
      independentRange,
      rootWidth,
      previousIndependent,
    );
    if (independent !== null) {
      previousIndependent = independent;
      points.push({ independent, sweep });
    }
  }
  return points;
}

export function sampleIsolines(
  evaluate: IsolineEvaluate,
  targets: readonly number[],
  sweepValues: readonly number[],
  independentRange: AxisRangeSi,
  rootWidth = isolineRootWidth(independentRange),
): Map<number, IsolineSample[]> {
  return new Map(targets.map((target) => [
    target,
    sampleIsoline(evaluate, target, sweepValues, independentRange, rootWidth),
  ]));
}

export function closePolyline({ x, y }: DisplayPolyline): DisplayPolyline {
  if (x.length === 0) return { x, y };
  const last = x.length - 1;
  if (x[0] === x[last] && y[0] === y[last]) return { x, y };
  return { x: [...x, x[0]], y: [...y, y[0]] };
}

export function projectIsolineSample(
  sample: IsolineSample,
  independentAxis: "x" | "y",
  xScale: DisplayScale,
  yScale: DisplayScale,
): { x: number; y: number } {
  if (independentAxis === "x") {
    return {
      x: clampToScale(xScale.toDisplay(sample.independent), xScale),
      y: clampToScale(yScale.toDisplay(sample.sweep), yScale),
    };
  }
  return {
    x: clampToScale(xScale.toDisplay(sample.sweep), xScale),
    y: clampToScale(yScale.toDisplay(sample.independent), yScale),
  };
}

function polylineFromSamples(
  samples: IsolineSample[],
  independentAxis: "x" | "y",
  xScale: DisplayScale,
  yScale: DisplayScale,
): DisplayPolyline {
  return {
    x: samples.map((sample) => projectIsolineSample(sample, independentAxis, xScale, yScale).x),
    y: samples.map((sample) => projectIsolineSample(sample, independentAxis, xScale, yScale).y),
  };
}

export function alignIsolinesBySweep(
  left: IsolineSample[],
  right: IsolineSample[],
  rootWidth: number,
): { left: IsolineSample[]; right: IsolineSample[] } {
  const rightBySweep = new Map(right.map((point) => [point.sweep, point]));
  const alignedLeft: IsolineSample[] = [];
  const alignedRight: IsolineSample[] = [];
  left.forEach((point) => {
    const match = rightBySweep.get(point.sweep);
    if (!match) return;
    if (Math.abs(match.independent - point.independent) <= rootWidth) return;
    alignedLeft.push(point);
    alignedRight.push(match);
  });
  return { left: alignedLeft, right: alignedRight };
}

export function buildLinearCappedPolygon(
  leftEdge: IsolineSample[],
  rightEdge: IsolineSample[],
  independentAxis: "x" | "y",
  xScale: DisplayScale,
  yScale: DisplayScale,
  rootWidth: number,
): DisplayPolyline {
  const { left, right } = alignIsolinesBySweep(leftEdge, rightEdge, rootWidth);
  if (left.length < 2) return { x: [], y: [] };
  const leftLine = polylineFromSamples(left, independentAxis, xScale, yScale);
  const rightReversed = polylineFromSamples(
    right.slice().reverse(),
    independentAxis,
    xScale,
    yScale,
  );
  return closePolyline({
    x: [...leftLine.x, ...rightReversed.x.slice(1)],
    y: [...leftLine.y, ...rightReversed.y.slice(1)],
  });
}

function finiteFieldValue(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : value;
}

function clampIsolineSample(
  evaluate: IsolineEvaluate,
  target: number,
  sweep: number,
  independentRange: AxisRangeSi,
): IsolineSample | null {
  const valueAtMin = finiteFieldValue(evaluate(independentRange.min, sweep));
  const valueAtMax = finiteFieldValue(evaluate(independentRange.max, sweep));
  if (valueAtMin === null || valueAtMax === null) return null;
  if ((valueAtMin - target) * (valueAtMax - target) <= 0) return null;

  const increasing = valueAtMax >= valueAtMin;
  const bothBelow = valueAtMin < target && valueAtMax < target;
  return {
    independent: bothBelow === increasing ? independentRange.max : independentRange.min,
    sweep,
  };
}

export function clampIsolinesToChartBounds(
  evaluate: IsolineEvaluate,
  isolines: Map<number, IsolineSample[]>,
  sweepValues: readonly number[],
  independentRange: AxisRangeSi,
): Map<number, IsolineSample[]> {
  return new Map([...isolines.entries()].map(([target, sampled]) => {
    const sampledBySweep = new Map(sampled.map((point) => [point.sweep, point]));
    const completed: IsolineSample[] = [];
    sweepValues.forEach((sweep) => {
      const existing = sampledBySweep.get(sweep);
      if (existing) {
        completed.push(existing);
        return;
      }
      const clamped = clampIsolineSample(
        evaluate,
        target,
        sweep,
        independentRange,
      );
      if (clamped) completed.push(clamped);
    });
    return [target, completed];
  }));
}

function isolineOrEmpty(
  isolines: Map<number, IsolineSample[]>,
  target: number,
): IsolineSample[] {
  return isolines.get(target) ?? [];
}

function chartBoundarySamples(
  template: IsolineSample[],
  independent: number,
): IsolineSample[] {
  return template.map(({ sweep }) => ({ independent, sweep }));
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

function bandFillName(outputLabel: string, band: { label: string }): string {
  return `${outputLabel} bands: ${band.label}`;
}

interface CartesianFillContext {
  isolines: Map<number, IsolineSample[]>;
  independentAxis: "x" | "y";
  xScale: DisplayScale;
  yScale: DisplayScale;
  rootWidth: number;
}

function buildFiniteBandPolygon(
  leftTarget: number,
  rightTarget: number,
  context: CartesianFillContext,
): DisplayPolyline {
  return buildLinearCappedPolygon(
    isolineOrEmpty(context.isolines, leftTarget),
    isolineOrEmpty(context.isolines, rightTarget),
    context.independentAxis,
    context.xScale,
    context.yScale,
    context.rootWidth,
  );
}

function independentBounds(context: CartesianFillContext): AxisRangeSi {
  return context.independentAxis === "x"
    ? context.xScale.rangeSi
    : context.yScale.rangeSi;
}

function buildUnboundedLeftPolygon(
  rightTarget: number,
  context: CartesianFillContext,
): DisplayPolyline {
  const tMin = independentBounds(context).min;
  const right = isolineOrEmpty(context.isolines, rightTarget).filter((point) => (
    point.independent > tMin && point.independent <= independentBounds(context).max
  ));
  return buildLinearCappedPolygon(
    chartBoundarySamples(right, tMin),
    right,
    context.independentAxis,
    context.xScale,
    context.yScale,
    context.rootWidth,
  );
}

function buildUnboundedRightPolygon(
  leftTarget: number,
  context: CartesianFillContext,
): DisplayPolyline {
  const tMax = independentBounds(context).max;
  const left = isolineOrEmpty(context.isolines, leftTarget).filter((point) => (
    point.independent >= independentBounds(context).min && point.independent < tMax
  ));
  return buildLinearCappedPolygon(
    left,
    chartBoundarySamples(left, tMax),
    context.independentAxis,
    context.xScale,
    context.yScale,
    context.rootWidth,
  );
}

export interface CartesianBand {
  min: number;
  max: number;
  label: string;
  color: string;
}

function pushMonotonicBandFills(
  fills: BandFillPolygon[],
  band: CartesianBand,
  outputLabel: string,
  context: CartesianFillContext,
): void {
  const hasMin = Number.isFinite(band.min);
  const hasMax = Number.isFinite(band.max);
  if (!hasMin && !hasMax) return;
  if (!hasMin) {
    addFill(
      fills,
      bandFillName(outputLabel, band),
      band.color,
      buildUnboundedLeftPolygon(band.max, context),
    );
    return;
  }
  if (!hasMax) {
    addFill(
      fills,
      bandFillName(outputLabel, band),
      band.color,
      buildUnboundedRightPolygon(band.min, context),
    );
    return;
  }
  addFill(
    fills,
    bandFillName(outputLabel, band),
    band.color,
    buildFiniteBandPolygon(band.min, band.max, context),
  );
}

function pushRadialBandFills(
  fills: BandFillPolygon[],
  band: CartesianBand,
  outputLabel: string,
  context: CartesianFillContext,
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
      buildFiniteBandPolygon(-innerAbs, innerAbs, context),
    );
    return;
  }
  if (hasMin && !hasMax && Number.isFinite(outerAbs) && outerAbs > 0) {
    addFill(
      fills,
      bandFillName(outputLabel, band),
      band.color,
      buildUnboundedLeftPolygon(-outerAbs, context),
    );
    addFill(
      fills,
      bandFillName(outputLabel, band),
      band.color,
      buildUnboundedRightPolygon(outerAbs, context),
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
      buildFiniteBandPolygon(-innerAbs, -outerAbs, context),
    );
    addFill(
      fills,
      bandFillName(outputLabel, band),
      band.color,
      buildFiniteBandPolygon(outerAbs, innerAbs, context),
    );
  }
}

export function buildCartesianBandFills({
  bands,
  isolines,
  outputLabel,
  independentAxis,
  xScale,
  yScale,
  layout,
  evaluate,
  sweepValues,
  absFromThreshold,
}: {
  bands: readonly CartesianBand[];
  isolines: Map<number, IsolineSample[]>;
  outputLabel: string;
  independentAxis: "x" | "y";
  xScale: DisplayScale;
  yScale: DisplayScale;
  layout: IsolineBandLayout;
  evaluate: IsolineEvaluate;
  sweepValues: readonly number[];
  absFromThreshold?: (threshold: number) => number;
}): BandFillPolygon[] {
  const independentRange = independentAxis === "x" ? xScale.rangeSi : yScale.rangeSi;
  const rootWidth = isolineRootWidth(independentRange);
  const filledIsolines = clampIsolinesToChartBounds(
    evaluate,
    isolines,
    sweepValues,
    independentRange,
  );
  const context: CartesianFillContext = {
    isolines: filledIsolines,
    independentAxis,
    xScale,
    yScale,
    rootWidth,
  };
  const fills: BandFillPolygon[] = [];
  bands.forEach((band) => {
    if (layout === "radial") {
      if (!absFromThreshold) {
        throw new Error("radial isoline fills require absFromThreshold.");
      }
      pushRadialBandFills(fills, band, outputLabel, context, absFromThreshold);
      return;
    }
    pushMonotonicBandFills(fills, band, outputLabel, context);
  });
  return fills;
}
