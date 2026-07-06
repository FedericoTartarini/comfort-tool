import type { CalculationSource } from "../../../models/calculationMetadata";
import type { PlotAnnotationDto, PlotlyChartResponseDto, PlotTraceDto } from "../../../models/comfortDtos";
import { buildGridContourTrace, evaluateGrid } from "./gridEngine";
import { buildInputTraceGroups, type BuildInputTraceGroupsOptions } from "./inputPoints";
import { buildChartResponse } from "./layout";
import type { ChartAxisScale, ChartLayoutSpec, GridEvaluationResult, GridPointEvaluation } from "./types";

/**
 * Step 9.1 shared chart engine contract.
 *
 * This layer is intentionally lower-level than the future Compliance/Explore
 * `FieldChartConfig`: models still choose the active chart ID, z metric, and
 * threshold semantics. The engine only owns common field-chart scaffolding:
 * axis display conversion, trace ordering, input overlays, layout assembly, and
 * the two current rendering strategies:
 *
 * 1. grid/contour - evaluate a model over SI x/y points, then build contour traces
 * 2. boundary/region - accept model-built boundary geometry and assemble it with inputs
 *
 * Strategy callbacks receive SI values. Axis scales are the only place where
 * chart point values are converted to display units.
 */
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
