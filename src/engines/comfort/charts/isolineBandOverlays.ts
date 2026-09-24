import {
  buildCartesianBandFills,
  sampleIsolines,
  sampleSweepValues,
  type IsolineBandLayout,
  type IsolineEvaluate,
} from "../../../charts/isolines";
import { PhysicalQuantityId } from "../../../catalog/quantities";
import type { NumericBand } from "../../../catalog/modelCapabilities";
import type { PlotTrace } from "../../plotlyTypes";
import { buildFilledPolygonTrace } from "./plotlyBuilders";
import { clipRelativeAirSpeedWithoutOccupantControl } from "./ashraeAirSpeedLimits";
import type { ChartAxisScale } from "./types";

const ROOT_TEMPERATURE_FIELDS = new Set<PhysicalQuantityId>([
  PhysicalQuantityId.DryBulbTemperature,
  PhysicalQuantityId.OperativeTemperature,
]);

const AIR_SPEED_FIELDS = new Set<PhysicalQuantityId>([
  PhysicalQuantityId.RelativeAirSpeed,
  PhysicalQuantityId.WindSpeed,
]);

export function resolveIsolineIndependentAxis(
  xField: PhysicalQuantityId,
  yField: PhysicalQuantityId,
): "x" | "y" {
  const xTemperature = ROOT_TEMPERATURE_FIELDS.has(xField);
  const yTemperature = ROOT_TEMPERATURE_FIELDS.has(yField);
  if (xTemperature && !yTemperature) return "x";
  if (yTemperature && !xTemperature) return "y";
  if (xTemperature && yTemperature) { if (xField === PhysicalQuantityId.OperativeTemperature) return "x";
    if (yField === PhysicalQuantityId.OperativeTemperature) return "y"; }
  return "x";
}

export function isOperativeAirSpeedPair(
  xField: PhysicalQuantityId,
  yField: PhysicalQuantityId,
): boolean {
  const fields = new Set([xField, yField]);
  return fields.has(PhysicalQuantityId.OperativeTemperature)
    && [...AIR_SPEED_FIELDS].some((field) => fields.has(field));
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values.filter(Number.isFinite))].sort((left, right) => left - right);
}

export function isolineTargetsFromBands(
  bands: readonly NumericBand[],
  layout: IsolineBandLayout,
  absFromThreshold?: (threshold: number) => number,
): number[] {
  const edges = uniqueSorted(bands.flatMap((band) => [band.min, band.max]));
  if (layout !== "radial" || !absFromThreshold) return edges;
  return uniqueSorted(edges.flatMap((threshold) => {
    const abs = absFromThreshold(threshold);
    if (!Number.isFinite(abs) || abs === 0) return [];
    return [-abs, abs];
  }));
}

export function createIsolineEvaluate(
  evaluateField: (xSi: number, ySi: number) => number | null,
  independentAxis: "x" | "y",
): IsolineEvaluate {
  return (independent, sweep) => (
    independentAxis === "x"
      ? evaluateField(independent, sweep)
      : evaluateField(sweep, independent)
  );
}

function clipVelTopVertices(
  fill: { x: number[]; y: number[]; name: string; color: string },
  independentAxis: "x" | "y",
  xAxis: ChartAxisScale,
  yAxis: ChartAxisScale,
) {
  const x = fill.x.map((xDisplay, index) => {
    const yDisplay = fill.y[index];
    const operativeSi = independentAxis === "x" ? xAxis.toSi(xDisplay) : yAxis.toSi(yDisplay);
    const airSpeedSi = independentAxis === "x" ? yAxis.toSi(yDisplay) : xAxis.toSi(xDisplay);
    const clippedSi = clipRelativeAirSpeedWithoutOccupantControl(operativeSi, airSpeedSi);
    return independentAxis === "x" ? xDisplay : xAxis.toDisplay(clippedSi);
  });
  const y = fill.y.map((yDisplay, index) => {
    const xDisplay = fill.x[index];
    const operativeSi = independentAxis === "x" ? xAxis.toSi(xDisplay) : yAxis.toSi(yDisplay);
    const airSpeedSi = independentAxis === "x" ? yAxis.toSi(yDisplay) : xAxis.toSi(xDisplay);
    const clippedSi = clipRelativeAirSpeedWithoutOccupantControl(operativeSi, airSpeedSi);
    return independentAxis === "x" ? yAxis.toDisplay(clippedSi) : yDisplay;
  });
  return { ...fill, x, y };
}

export function buildIsolineBandOverlayTraces({
  bands,
  outputLabel,
  evaluateField,
  xAxis,
  yAxis,
  xField,
  yField,
  layout,
  absFromThreshold,
  opacity = 0.8,
  clipAirSpeedWithoutOccupantControl = false,
}: {
  bands: readonly NumericBand[];
  outputLabel: string;
  evaluateField: (xSi: number, ySi: number) => number | null;
  xAxis: ChartAxisScale;
  yAxis: ChartAxisScale;
  xField: PhysicalQuantityId;
  yField: PhysicalQuantityId;
  layout: IsolineBandLayout;
  absFromThreshold?: (threshold: number) => number;
  opacity?: number;
  clipAirSpeedWithoutOccupantControl?: boolean;
}): PlotTrace[] {
  const independentAxis = resolveIsolineIndependentAxis(xField, yField);
  const sweepRange = independentAxis === "x" ? yAxis.rangeSi : xAxis.rangeSi;
  const independentRange = independentAxis === "x" ? xAxis.rangeSi : yAxis.rangeSi;
  const sweepValues = sampleSweepValues(sweepRange);
  const evaluate = createIsolineEvaluate(evaluateField, independentAxis);
  const targets = isolineTargetsFromBands(bands, layout, absFromThreshold);
  const isolines = sampleIsolines(
    evaluate,
    targets,
    sweepValues,
    independentRange,
  );
  const fills = buildCartesianBandFills({
    bands,
    isolines,
    outputLabel,
    independentAxis,
    xScale: { rangeSi: xAxis.rangeSi, toDisplay: xAxis.toDisplay },
    yScale: { rangeSi: yAxis.rangeSi, toDisplay: yAxis.toDisplay },
    layout,
    evaluate,
    sweepValues,
    absFromThreshold,
  });
  const clippedFills = clipAirSpeedWithoutOccupantControl
    && isOperativeAirSpeedPair(xField, yField)
    ? fills.map((fill) => clipVelTopVertices(fill, independentAxis, xAxis, yAxis))
    : fills;
  return clippedFills.map((fill) => buildFilledPolygonTrace({
    name: fill.name,
    x: fill.x,
    y: fill.y,
    fillcolor: fill.color,
    lineColor: fill.color,
    lineWidth: 1.5,
    opacity,
    hoverinfo: "skip",
    hovertemplate: "",
    isBackgroundZone: true,
  }));
}
