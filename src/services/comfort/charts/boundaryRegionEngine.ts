import type { PlotTraceDto } from "../../../models/comfortDtos";
import { buildGridContourTrace, evaluateGrid } from "./gridEngine";
import type { ChartAxisScale, ChartRange } from "./types";

type BoundaryHoverRow = unknown[];
type BoundaryHoverMetadata = BoundaryHoverRow[];

interface BoundaryBand {
  label: string;
  color: string;
}

interface BoundaryPolygonTraceContext {
  polygonX: number[];
  polygonY: number[];
  hoverMetadata: BoundaryHoverMetadata;
}

interface BuildBoundaryPolygonTraceOptions {
  xValuesSi: number[];
  yValuesSi: number[];
  xAxis: ChartAxisScale;
  yAxis: ChartAxisScale;
  getHoverMetadata?: (xSi: number, ySi: number, index: number) => BoundaryHoverRow;
  buildTrace: (context: BoundaryPolygonTraceContext) => PlotTraceDto;
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
  variableValuesSi: number[];
  boundaryCurvesSi: number[][];
  bands: BoundaryBand[];
  variableAxis: ChartAxisScale;
  boundaryAxis: ChartAxisScale;
  xAxis: ChartAxisScale;
  yAxis: ChartAxisScale;
  boundaryRangeSi?: ChartRange;
  getHoverMetadata?: (xSi: number, ySi: number, index: number) => BoundaryHoverRow;
  buildTrace: (context: BoundaryPolygonTraceContext & { band: BoundaryBand; bandIndex: number }) => PlotTraceDto;
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
  colorscale?: [number, string][];
  contours?: any;
}

interface ClosedBoundaryPolygonOptions {
  lowerX: number[];
  lowerY: number[];
  upperX: number[];
  upperY: number[];
}

function clamp(value: number, range: ChartRange): number {
  return Math.min(range.max, Math.max(range.min, value));
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

export function buildBoundaryPolygonTrace({
  xValuesSi,
  yValuesSi,
  xAxis,
  yAxis,
  getHoverMetadata,
  buildTrace,
}: BuildBoundaryPolygonTraceOptions): PlotTraceDto {
  const polygonX = xValuesSi.map(xAxis.toDisplay);
  const polygonY = yValuesSi.map(yAxis.toDisplay);
  const hoverMetadata = polygonX.map((_, index) => (
    getHoverMetadata?.(xValuesSi[index], yValuesSi[index], index) ?? []
  ));

  return buildTrace({ polygonX, polygonY, hoverMetadata });
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
 * Builds filled boundary bands from model-owned SI curves. This helper owns axis
 * orientation, range clamping, display conversion, polygon assembly, and hover
 * metadata placement; models own boundary equations, labels, and trace styling.
 */
export function buildBoundaryRegionTraces({
  variableValuesSi,
  boundaryCurvesSi,
  bands,
  variableAxis,
  boundaryAxis,
  xAxis,
  yAxis,
  boundaryRangeSi = boundaryAxis.rangeSi,
  getHoverMetadata,
  buildTrace,
}: BuildBoundaryRegionTracesOptions): PlotTraceDto[] {
  const variableDisplayValues = variableValuesSi.map(variableAxis.toDisplay);
  const traces: PlotTraceDto[] = [];

  bands.forEach((band, bandIndex) => {
    const lowerValues = bandIndex === 0
      ? variableValuesSi.map(() => boundaryRangeSi.min)
      : boundaryCurvesSi[bandIndex - 1];
    const upperValues = bandIndex === boundaryCurvesSi.length
      ? variableValuesSi.map(() => boundaryRangeSi.max)
      : boundaryCurvesSi[bandIndex];
    const hasVisibleArea = lowerValues.some((lower, index) => (
      lower < boundaryRangeSi.max && upperValues[index] > boundaryRangeSi.min
    ));

    if (!hasVisibleArea) {
      return;
    }

    const lowerValuesClampedSi = lowerValues.map((value) => clamp(value, boundaryRangeSi));
    const upperValuesClampedSi = upperValues.map((value) => clamp(value, boundaryRangeSi));
    const lowerDisplayValues = lowerValuesClampedSi.map(boundaryAxis.toDisplay);
    const upperDisplayValues = upperValuesClampedSi.map(boundaryAxis.toDisplay);
    const variableIsXAxis = variableAxis.field === xAxis.field;
    const variablePolygonValuesSi = variableValuesSi.concat(variableValuesSi.slice().reverse());
    const boundaryPolygonValuesSi = lowerValuesClampedSi.concat(upperValuesClampedSi.slice().reverse());
    const polygonX = variableIsXAxis
      ? variableDisplayValues.concat(variableDisplayValues.slice().reverse())
      : lowerDisplayValues.concat(upperDisplayValues.slice().reverse());
    const polygonY = variableIsXAxis
      ? lowerDisplayValues.concat(upperDisplayValues.slice().reverse())
      : variableDisplayValues.concat(variableDisplayValues.slice().reverse());
    const hoverMetadata = variablePolygonValuesSi.map((variableValueSi, index) => {
      const boundaryValueSi = boundaryPolygonValuesSi[index];
      const xSi = variableIsXAxis ? variableValueSi : boundaryValueSi;
      const ySi = variableIsXAxis ? boundaryValueSi : variableValueSi;
      return getHoverMetadata?.(xSi, ySi, index) ?? [];
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
