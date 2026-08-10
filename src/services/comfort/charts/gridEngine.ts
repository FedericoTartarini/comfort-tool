import type {
  PlotColorScaleDto,
  PlotContourTraceDto,
  PlotContoursDto,
  PlotHoverCellDto,
  PlotHoverInfoDto,
  PlotLineDto,
} from "../../../models/comfortDtos";
import { buildContourTrace } from "./plotlyBuilders";
import { buildAxisValues } from "./axis";
import type { ChartAxisScale, GridEvaluationResult, GridPointEvaluation } from "./types";

interface EvaluateGridOptions {
  xAxis: ChartAxisScale;
  yAxis: ChartAxisScale;
  evaluatePoint: (
    xSi: number,
    ySi: number,
    xIndex: number,
    yIndex: number,
  ) => GridPointEvaluation | null;
}

export interface GridContourLayerSpec {
  name: string;
  colorscale?: PlotColorScaleDto;
  fillcolor?: string;
  contours: PlotContoursDto;
  hovertemplate: string;
  showscale?: boolean;
  zmin?: number;
  zmax?: number;
  opacity?: number;
  line?: PlotLineDto;
  isBackgroundZone?: boolean;
  hoverinfo?: PlotHoverInfoDto;
  hoverOnGaps?: boolean;
  includeText?: boolean;
  includeHoverMetadata?: boolean;
}

interface GridContourTraceOptions extends GridContourLayerSpec {
  grid: GridEvaluationResult;
}

export function evaluateGrid({
  xAxis,
  yAxis,
  evaluatePoint,
}: EvaluateGridOptions): GridEvaluationResult {
  const xAxisValues = buildAxisValues(xAxis);
  const yAxisValues = buildAxisValues(yAxis);
  const zValues: number[][] = [];
  const textValues: string[][] = [];
  const hoverMetadata: PlotHoverCellDto[][] = [];

  for (let yIndex = 0; yIndex < yAxisValues.siValues.length; yIndex += 1) {
    const row: number[] = [];
    const textRow: string[] = [];
    const hoverMetadataRow: PlotHoverCellDto[] = [];
    const ySi = yAxisValues.siValues[yIndex];

    for (let xIndex = 0; xIndex < xAxisValues.siValues.length; xIndex += 1) {
      const xSi = xAxisValues.siValues[xIndex];

      const result = evaluatePoint(xSi, ySi, xIndex, yIndex);
      if (result === null) {
        row.push(NaN);
        textRow.push("");
        hoverMetadataRow.push([]);
      } else {
        row.push(result.z);
        textRow.push(result.text ?? "");
        hoverMetadataRow.push(result.hoverMetadata ?? []);
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
  fillcolor,
  contours,
  hovertemplate,
  showscale = false,
  zmin,
  zmax,
  opacity,
  line,
  isBackgroundZone,
  hoverinfo,
  hoverOnGaps,
  includeText = true,
  includeHoverMetadata = true,
}: GridContourTraceOptions): PlotContourTraceDto {
  return buildContourTrace({
    name,
    x: grid.xValues,
    y: grid.yValues,
    z: grid.zValues,
    text: includeText ? grid.textValues : undefined,
    colorscale,
    fillcolor,
    contours,
    hovertemplate,
    showscale,
    zmin,
    zmax,
    opacity,
    line,
    isBackgroundZone,
    hoverinfo,
    hoverOnGaps,
    hoverMetadata: includeHoverMetadata ? grid.hoverMetadata : undefined,
  });
}
