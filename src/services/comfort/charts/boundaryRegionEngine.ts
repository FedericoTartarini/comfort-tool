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

interface BoundaryPolygonTraceContext {
  polygonX: number[];
  polygonY: number[];
}

export type BoundaryAxis = "x" | "y";

interface BuildBoundaryRegionTracesOptions {
  bands: readonly Band[];
  bandInputsSi: BandInputsSi;
  xAxis: ChartAxisScale;
  yAxis: ChartAxisScale;
  boundaryAxis: BoundaryAxis;
  additionalBoundaryValuesSi?: readonly number[];
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

function buildBoundaryValuesSi(
  axis: ChartAxisScale,
  additionalBoundaryValuesSi: readonly number[],
): number[] {
  const { min, max } = axis.rangeSi;
  if (!Number.isInteger(axis.points) || axis.points < 1) {
    throw new Error(`Axis points must be a positive integer; received ${axis.points}`);
  }
  const sampledValuesSi = Array.from({ length: axis.points }, (_, index) => {
    if (axis.points === 1 || index === 0) return min;
    if (index === axis.points - 1) return max;
    return min + ((max - min) * index) / (axis.points - 1);
  });

  return [...sampledValuesSi, ...additionalBoundaryValuesSi]
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

/**
 * Resolves ordered functional bands against the canonical-SI boundary values
 * and builds either the direct or transposed polygons. Gaps are allowed;
 * reversed bands and overlaps are not.
 */
export function buildBoundaryRegionTraces({
  bands,
  bandInputsSi,
  xAxis,
  yAxis,
  boundaryAxis,
  additionalBoundaryValuesSi = [],
  buildTrace,
}: BuildBoundaryRegionTracesOptions): PlotTraceDto[] {
  if (bands.length === 0) {
    return [];
  }

  const parameterAxis = boundaryAxis === "x" ? xAxis : yAxis;
  const edgeAxis = boundaryAxis === "x" ? yAxis : xAxis;
  const boundaryValuesSi = buildBoundaryValuesSi(
    parameterAxis,
    additionalBoundaryValuesSi,
  );
  if (boundaryValuesSi.length === 0) {
    throw new Error("Boundary regions require at least one finite boundary sample");
  }

  const resolvedEdges = bands.map((band) => ({
    min: boundaryValuesSi.map((boundaryValueSi) => resolveBandEdge(
      band.min,
      boundaryValueSi,
      bandInputsSi,
    )),
    max: boundaryValuesSi.map((boundaryValueSi) => resolveBandEdge(
      band.max,
      boundaryValueSi,
      bandInputsSi,
    )),
  }));

  boundaryValuesSi.forEach((boundaryValueSi, boundaryIndex) => {
    let previousMax: number | undefined;
    resolvedEdges.forEach(({ min, max }, bandIndex) => {
      const lower = min[boundaryIndex];
      const upper = max[boundaryIndex];
      if (Number.isNaN(lower) || Number.isNaN(upper)) {
        throw new Error(
          `Boundary band ${bandIndex} resolved to NaN at ${boundaryValueSi}`,
        );
      }
      if (lower > upper) {
        throw new Error(
          `Boundary band ${bandIndex} is reversed at ${boundaryValueSi}`,
        );
      }
      if (previousMax !== undefined && lower < previousMax) {
        throw new Error(
          `Boundary bands overlap at ${boundaryValueSi}`,
        );
      }
      previousMax = upper;
    });
  });

  const boundaryDisplayValues = boundaryValuesSi.map(parameterAxis.toDisplay);
  const traces: PlotTraceDto[] = [];

  bands.forEach((band, bandIndex) => {
    const { min: lowerValuesSi, max: upperValuesSi } = resolvedEdges[bandIndex];
    const hasVisibleArea = lowerValuesSi.some((lower, index) => (
      Math.max(lower, edgeAxis.rangeSi.min)
        < Math.min(upperValuesSi[index], edgeAxis.rangeSi.max)
    ));

    if (!hasVisibleArea) {
      return;
    }

    const lowerValuesClampedSi = lowerValuesSi.map((value) => (
      clamp(value, edgeAxis.rangeSi)
    ));
    const upperValuesClampedSi = upperValuesSi.map((value) => (
      clamp(value, edgeAxis.rangeSi)
    ));
    const edgeDisplayValues = lowerValuesClampedSi.map(edgeAxis.toDisplay).concat(
      upperValuesClampedSi.map(edgeAxis.toDisplay).reverse(),
    );
    const polygonX = boundaryAxis === "x"
      ? boundaryDisplayValues.concat(boundaryDisplayValues.slice().reverse())
      : edgeDisplayValues;
    const polygonY = boundaryAxis === "x"
      ? edgeDisplayValues
      : boundaryDisplayValues.concat(boundaryDisplayValues.slice().reverse());

    traces.push(buildTrace({
      band,
      bandIndex,
      polygonX,
      polygonY,
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
    hoverinfo: "skip",
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
