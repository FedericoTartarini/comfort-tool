import type {
  PlotColorScaleDto,
  PlotContoursDto,
  PlotTraceDto,
} from "../../../models/comfortDtos";
import {
  resolveBandEdge,
  type Band,
  type BandInputsSi,
} from "../../../models/modelCapabilities";
import { buildGridContourTrace, evaluateGrid } from "./gridEngine";
import type { ChartAxisScale } from "./types";

type BoundaryHoverRow = unknown[];
type BoundaryHoverMetadata = BoundaryHoverRow[];

interface BoundaryPolygonTraceContext {
  polygonX: number[];
  polygonY: number[];
  hoverMetadata: BoundaryHoverMetadata;
}

interface BuildClosedBoundaryPolygonTraceOptions {
  lowerXValuesSi: number[];
  lowerYValuesSi: number[];
  upperXValuesSi: number[];
  upperYValuesSi: number[];
  xAxis: ChartAxisScale;
  yAxis: ChartAxisScale;
  buildTrace: (context: BoundaryPolygonTraceContext) => PlotTraceDto;
}

interface BuildBoundaryRegionTracesOptions {
  bands: readonly Band[];
  bandInputsSi: BandInputsSi;
  xAxis: ChartAxisScale;
  yAxis: ChartAxisScale;
  additionalXValuesSi?: readonly number[];
  getHoverMetadata?: (
    xSi: number,
    ySi: number,
    index: number,
    band: Band,
    bandIndex: number,
  ) => BoundaryHoverRow;
  buildTrace: (
    context: BoundaryPolygonTraceContext & { band: Band; bandIndex: number },
  ) => PlotTraceDto;
}

interface FilledBoundaryRegionTraceOptions {
  name: string;
  color: string;
  polygonX: number[];
  polygonY: number[];
  lineColor: string;
  opacity?: number;
  hovertemplate?: string;
  hoverinfo?: string;
  hoverMetadata?: BoundaryHoverMetadata;
  isZone?: boolean;
}

interface TooltipGridTraceOptions {
  name?: string;
  xAxis: ChartAxisScale;
  yAxis: ChartAxisScale;
  hovertemplate: string;
  getHoverMetadata: (xSi: number, ySi: number, xIndex: number, yIndex: number) => BoundaryHoverRow;
  colorscale?: PlotColorScaleDto;
  contours?: PlotContoursDto;
}

interface ClosedBoundaryPolygonOptions {
  lowerX: number[];
  lowerY: number[];
  upperX: number[];
  upperY: number[];
}

function clamp(value: number, range: ChartAxisScale["rangeSi"]): number {
  return Math.min(range.max, Math.max(range.min, value));
}

function buildBoundaryXValuesSi(
  xAxis: ChartAxisScale,
  additionalXValuesSi: readonly number[],
): number[] {
  const { min, max } = xAxis.rangeSi;
  if (!Number.isInteger(xAxis.points) || xAxis.points < 1) {
    throw new Error(`Axis points must be a positive integer; received ${xAxis.points}`);
  }
  const sampledXValuesSi = Array.from({ length: xAxis.points }, (_, index) => {
    if (xAxis.points === 1 || index === 0) return min;
    if (index === xAxis.points - 1) return max;
    return min + ((max - min) * index) / (xAxis.points - 1);
  });

  return [...sampledXValuesSi, ...additionalXValuesSi]
    .filter((value) => Number.isFinite(value) && value >= min && value <= max)
    .sort((left, right) => left - right)
    .filter((value, index, values) => (
      index === 0 || Math.abs(value - values[index - 1]) > 1e-9
    ));
}

export function buildClosedBoundaryPolygon({
  lowerX,
  lowerY,
  upperX,
  upperY,
}: ClosedBoundaryPolygonOptions): { polygonX: number[]; polygonY: number[] } {
  return {
    polygonX: lowerX.concat(upperX.slice().reverse()),
    polygonY: lowerY.concat(upperY.slice().reverse()),
  };
}

export function buildClosedBoundaryPolygonTrace({
  lowerXValuesSi,
  lowerYValuesSi,
  upperXValuesSi,
  upperYValuesSi,
  xAxis,
  yAxis,
  buildTrace,
}: BuildClosedBoundaryPolygonTraceOptions): PlotTraceDto {
  const { polygonX, polygonY } = buildClosedBoundaryPolygon({
    lowerX: lowerXValuesSi.map(xAxis.toDisplay),
    lowerY: lowerYValuesSi.map(yAxis.toDisplay),
    upperX: upperXValuesSi.map(xAxis.toDisplay),
    upperY: upperYValuesSi.map(yAxis.toDisplay),
  });

  return buildTrace({
    polygonX,
    polygonY,
    hoverMetadata: polygonX.map(() => []),
  });
}

/**
 * Resolves ordered functional bands across the canonical-SI X axis and builds
 * their filled polygons. Gaps are allowed; reversed bands and overlaps are not.
 */
export function buildBoundaryRegionTraces({
  bands,
  bandInputsSi,
  xAxis,
  yAxis,
  additionalXValuesSi = [],
  getHoverMetadata,
  buildTrace,
}: BuildBoundaryRegionTracesOptions): PlotTraceDto[] {
  if (bands.length === 0) {
    return [];
  }

  const xValuesSi = buildBoundaryXValuesSi(xAxis, additionalXValuesSi);
  if (xValuesSi.length === 0) {
    throw new Error("Boundary regions require at least one finite X sample");
  }

  const resolvedEdges = bands.map((band) => ({
    min: xValuesSi.map((xValueSi) => resolveBandEdge(
      band.min,
      xValueSi,
      bandInputsSi,
    )),
    max: xValuesSi.map((xValueSi) => resolveBandEdge(
      band.max,
      xValueSi,
      bandInputsSi,
    )),
  }));

  xValuesSi.forEach((xValueSi, xIndex) => {
    let previousMax: number | undefined;
    resolvedEdges.forEach(({ min, max }, bandIndex) => {
      const lower = min[xIndex];
      const upper = max[xIndex];
      if (Number.isNaN(lower) || Number.isNaN(upper)) {
        throw new Error(
          `Boundary band ${bandIndex} resolved to NaN at X=${xValueSi}`,
        );
      }
      if (lower > upper) {
        throw new Error(
          `Boundary band ${bandIndex} is reversed at X=${xValueSi}`,
        );
      }
      if (previousMax !== undefined && lower < previousMax) {
        throw new Error(
          `Boundary bands overlap at X=${xValueSi}`,
        );
      }
      previousMax = upper;
    });
  });

  const xDisplayValues = xValuesSi.map(xAxis.toDisplay);
  const traces: PlotTraceDto[] = [];

  bands.forEach((band, bandIndex) => {
    const { min: lowerValuesSi, max: upperValuesSi } = resolvedEdges[bandIndex];
    const hasVisibleArea = lowerValuesSi.some((lower, index) => (
      Math.max(lower, yAxis.rangeSi.min)
        < Math.min(upperValuesSi[index], yAxis.rangeSi.max)
    ));

    if (!hasVisibleArea) {
      return;
    }

    const lowerValuesClampedSi = lowerValuesSi.map((value) => (
      clamp(value, yAxis.rangeSi)
    ));
    const upperValuesClampedSi = upperValuesSi.map((value) => (
      clamp(value, yAxis.rangeSi)
    ));
    const polygonXValuesSi = xValuesSi.concat(xValuesSi.slice().reverse());
    const polygonYValuesSi = lowerValuesClampedSi.concat(
      upperValuesClampedSi.slice().reverse(),
    );
    const polygonX = xDisplayValues.concat(xDisplayValues.slice().reverse());
    const polygonY = lowerValuesClampedSi.map(yAxis.toDisplay).concat(
      upperValuesClampedSi.map(yAxis.toDisplay).reverse(),
    );
    const hoverMetadata = polygonXValuesSi.map((xSi, index) => {
      const ySi = polygonYValuesSi[index];
      return getHoverMetadata?.(xSi, ySi, index, band, bandIndex) ?? [];
    });

    traces.push(buildTrace({
      band,
      bandIndex,
      polygonX,
      polygonY,
      hoverMetadata,
    }));
  });

  return traces;
}

export function buildFilledBoundaryRegionTrace({
  name,
  color,
  polygonX,
  polygonY,
  lineColor,
  opacity = 0.72,
  hovertemplate = "",
  hoverinfo = "skip",
  hoverMetadata,
  isZone = true,
}: FilledBoundaryRegionTraceOptions): PlotTraceDto {
  return {
    type: "scatter",
    mode: "lines",
    name,
    x: polygonX,
    y: polygonY,
    showlegend: false,
    fill: "toself",
    fillcolor: color,
    line: { color: lineColor, width: 0.8 },
    marker: {},
    opacity,
    hovertemplate,
    hoverinfo,
    hoverMetadata,
    isZone,
  };
}

export function buildTooltipGridTrace({
  name = "Tooltip Layer",
  xAxis,
  yAxis,
  hovertemplate,
  getHoverMetadata,
  colorscale = [[0, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0)"]],
  contours = { coloring: "none", showlines: false },
}: TooltipGridTraceOptions): PlotTraceDto {
  const grid = evaluateGrid({
    xAxis,
    yAxis,
    evaluatePoint: (xSi, ySi, xIndex, yIndex) => ({
      z: 1,
      hoverMetadata: getHoverMetadata(xSi, ySi, xIndex, yIndex),
    }),
  });

  return buildGridContourTrace({
    name,
    grid,
    colorscale,
    contours,
    showscale: false,
    hovertemplate,
  });
}
