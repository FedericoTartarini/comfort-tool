import type { PlotTraceDto } from "../../../models/comfortDtos";
import { buildContourTrace } from "./plotlyBuilders";
import { buildAxisValues } from "./axis";
import type { ChartAxisScale, GridEvaluationResult, GridPointEvaluation } from "./types";

interface EvaluateGridOptions {
  xAxis: ChartAxisScale;
  yAxis: ChartAxisScale;
  evaluatePoint: (xSi: number, ySi: number, xIndex: number, yIndex: number) => GridPointEvaluation;
  errorText?: string;
}

interface GridContourTraceOptions {
  name: string;
  grid: GridEvaluationResult;
  colorscale: any[];
  contours: any;
  hovertemplate: string;
  showscale?: boolean;
  zmin?: number;
  zmax?: number;
  colorbar?: any;
  opacity?: number;
  line?: any;
  isZone?: boolean;
  isBackgroundZone?: boolean;
  isComfortZone?: boolean;
  hoverinfo?: string;
  includeText?: boolean;
  includeHoverMetadata?: boolean;
}

export function evaluateGrid({
  xAxis,
  yAxis,
  evaluatePoint,
  errorText = "Error",
}: EvaluateGridOptions): GridEvaluationResult {
  const xAxisValues = buildAxisValues(xAxis);
  const yAxisValues = buildAxisValues(yAxis);
  const zValues: number[][] = [];
  const textValues: string[][] = [];
  const hoverMetadata: unknown[][] = [];

  for (let yIndex = 0; yIndex < yAxisValues.siValues.length; yIndex += 1) {
    const row: number[] = [];
    const textRow: string[] = [];
    const hoverMetadataRow: unknown[] = [];
    const ySi = yAxisValues.siValues[yIndex];

    for (let xIndex = 0; xIndex < xAxisValues.siValues.length; xIndex += 1) {
      const xSi = xAxisValues.siValues[xIndex];

      try {
        const result = evaluatePoint(xSi, ySi, xIndex, yIndex);
        row.push(result.z);
        textRow.push(result.text ?? "");
        hoverMetadataRow.push(result.hoverMetadata ?? []);
      } catch {
        row.push(NaN);
        textRow.push(errorText);
        hoverMetadataRow.push([NaN]);
      }
    }

    zValues.push(row);
    textValues.push(textRow);
    hoverMetadata.push(hoverMetadataRow);
  }

  return {
    xValues: xAxisValues.displayValues,
    yValues: yAxisValues.displayValues,
    xValuesSi: xAxisValues.siValues,
    yValuesSi: yAxisValues.siValues,
    zValues,
    textValues,
    hoverMetadata,
  };
}

export function buildGridContourTrace({
  name,
  grid,
  colorscale,
  contours,
  hovertemplate,
  showscale = false,
  zmin,
  zmax,
  colorbar,
  opacity,
  line,
  isZone,
  isBackgroundZone,
  isComfortZone,
  hoverinfo,
  includeText = true,
  includeHoverMetadata = true,
}: GridContourTraceOptions): PlotTraceDto {
  return buildContourTrace({
    name,
    x: grid.xValues,
    y: grid.yValues,
    z: grid.zValues,
    text: includeText ? grid.textValues : undefined,
    colorscale,
    contours,
    hovertemplate,
    showscale,
    zmin,
    zmax,
    colorbar,
    opacity,
    line,
    isZone,
    isBackgroundZone,
    isComfortZone,
    hoverinfo,
    hoverMetadata: includeHoverMetadata ? grid.hoverMetadata as any[][] : undefined,
  });
}
