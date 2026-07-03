import type { CalculationSource } from "../../../models/calculationMetadata";
import type { PlotAnnotationDto, PlotlyChartResponseDto, PlotTraceDto } from "../../../models/comfortDtos";
import { buildGridContourTrace, evaluateGrid } from "./gridEngine";
import { buildInputTraceGroups, type BuildInputTraceGroupsOptions } from "./inputPoints";
import { buildChartResponse } from "./layout";
import type { ChartAxisScale, ChartLayoutSpec, GridEvaluationResult, GridPointEvaluation } from "./types";

export interface GridContourLayerSpec {
  name: string;
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

export interface GridFieldChartStrategy {
  evaluatePoint: (xSi: number, ySi: number, xIndex: number, yIndex: number) => GridPointEvaluation;
  errorText?: string;
  layers?: GridContourLayerSpec[];
  buildTraces?: (grid: GridEvaluationResult) => PlotTraceDto[];
}

interface FieldChartAssemblyOptions<TPayload, TResult> {
  layout: ChartLayoutSpec;
  source: CalculationSource;
  annotations?: PlotAnnotationDto[];
  leadingTraces?: PlotTraceDto[];
  beforeInputTraces?: PlotTraceDto[];
  inputGroups?: Array<BuildInputTraceGroupsOptions<TPayload, TResult>>;
}

interface FieldChartBaseOptions<TPayload, TResult> extends FieldChartAssemblyOptions<TPayload, TResult> {
  xAxis: ChartAxisScale;
  yAxis: ChartAxisScale;
}

interface FieldChartOptions<TPayload, TResult> extends FieldChartAssemblyOptions<TPayload, TResult> {
  strategyTraces?: PlotTraceDto[];
}

export interface GridContourFieldChartOptions<TPayload, TResult>
  extends FieldChartBaseOptions<TPayload, TResult> {
  grid?: GridFieldChartStrategy;
}

export interface BoundaryRegionFieldChartOptions<TPayload, TResult>
  extends FieldChartBaseOptions<TPayload, TResult> {
  boundaryTraces?: PlotTraceDto[];
}

function buildInputGroups<TPayload, TResult>(
  inputGroups: Array<BuildInputTraceGroupsOptions<TPayload, TResult>> | undefined,
): PlotTraceDto[] {
  return inputGroups?.flatMap(buildInputTraceGroups) ?? [];
}

function buildGridTraces(
  gridStrategy: GridFieldChartStrategy | undefined,
  xAxis: ChartAxisScale,
  yAxis: ChartAxisScale,
): PlotTraceDto[] {
  if (!gridStrategy) {
    return [];
  }

  const grid = evaluateGrid({
    xAxis,
    yAxis,
    evaluatePoint: gridStrategy.evaluatePoint,
    errorText: gridStrategy.errorText,
  });

  if (gridStrategy.buildTraces) {
    return gridStrategy.buildTraces(grid);
  }

  return (gridStrategy.layers ?? []).map((layer) => buildGridContourTrace({
    ...layer,
    grid,
  }));
}

/**
 * Shared field-chart assembly. Strategy callbacks work in SI; axis scales own display
 * conversion; strategy traces supply only grid or boundary geometry.
 */
function buildFieldChart<TPayload, TResult>({
  strategyTraces = [],
  leadingTraces = [],
  beforeInputTraces = [],
  inputGroups,
  layout,
  source,
  annotations = [],
}: FieldChartOptions<TPayload, TResult>): PlotlyChartResponseDto {
  return buildChartResponse({
    traces: [
      ...leadingTraces,
      ...strategyTraces,
      ...beforeInputTraces,
      ...buildInputGroups(inputGroups),
    ],
    layout,
    annotations,
    source,
  });
}

/**
 * Shared grid chart runner. Model callbacks receive SI axis values.
 */
export function buildGridContourFieldChart<TPayload = unknown, TResult = unknown>({
  xAxis,
  yAxis,
  grid,
  leadingTraces = [],
  beforeInputTraces = [],
  inputGroups,
  layout,
  source,
  annotations = [],
}: GridContourFieldChartOptions<TPayload, TResult>): PlotlyChartResponseDto {
  return buildFieldChart({
    strategyTraces: buildGridTraces(grid, xAxis, yAxis),
    leadingTraces,
    beforeInputTraces,
    inputGroups,
    layout,
    source,
    annotations,
  });
}

/**
 * Shared boundary/region chart runner. Boundary geometry is supplied by the model.
 */
export function buildBoundaryRegionFieldChart<TPayload = unknown, TResult = unknown>(
  options: BoundaryRegionFieldChartOptions<TPayload, TResult>,
): PlotlyChartResponseDto {
  const {
    boundaryTraces = [],
    leadingTraces = [],
    beforeInputTraces = [],
    inputGroups,
    layout,
    source,
    annotations = [],
  } = options;

  return buildFieldChart({
    strategyTraces: boundaryTraces,
    leadingTraces,
    beforeInputTraces,
    inputGroups,
    layout,
    source,
    annotations,
  });
}
