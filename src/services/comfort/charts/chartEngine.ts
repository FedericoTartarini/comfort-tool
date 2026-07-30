import type { CalculationSource } from "../../../models/calculationMetadata";
import type {
  PlotAnnotationDto,
  PlotColorScaleDto,
  PlotContoursDto,
  PlotLineDto,
  PlotlyChartResponseDto,
  PlotTraceDto,
} from "../../../models/comfortDtos";
import {
  findNumericBandIndexForValue,
  type GridFieldChartConfig,
  type ModelOutput,
  type ModelOutputKey,
} from "../../../models/modelCapabilities";
import type { UnitSystem as UnitSystemType } from "../../../models/units";
import {
  convertModelOutputFromSi,
  getModelOutputDisplayMeta,
} from "../../units";
import { buildGridContourTrace, evaluateGrid } from "./gridEngine";
import { buildInputTraceGroups, type BuildInputTraceGroupsOptions } from "./inputPoints";
import { buildChartResponse } from "./layout";
import type { ChartAxisScale, ChartLayoutSpec, GridEvaluationResult, GridPointEvaluation } from "./types";
import {
  buildBandTooltipTrace,
  buildCategoricalBandTraces,
  buildConstraintBandTraces,
} from "./zoneGrid";

/**
 * Shared field-chart engine contract.
 *
 * Fixed-axis and Explore charts both provide raw SI values to this engine,
 * which owns band assignment, axis display conversion, trace ordering, input
 * overlays, and layout assembly. Geometry is supplied through one of two
 * strategies:
 *
 * 1. grid/contour - evaluate a model over SI x/y points, then build contour traces
 * 2. boundary/region - accept model-built boundary geometry and assemble it with inputs
 *
 * Strategy callbacks receive SI values. Axis scales convert coordinates, while
 * selected model outputs use the centralized output conversion registry.
 */
export interface GridContourLayerSpec {
  name: string;
  colorscale?: PlotColorScaleDto;
  fillcolor?: string;
  contours: PlotContoursDto;
  hovertemplate: string;
  showscale?: boolean;
  zmin?: number;
  zmax?: number;
  colorbar?: Record<string, unknown>;
  opacity?: number;
  line?: PlotLineDto;
  isZone?: boolean;
  isBackgroundZone?: boolean;
  isComfortZone?: boolean;
  hoverinfo?: string;
  hoverOnGaps?: boolean;
  includeText?: boolean;
  includeHoverMetadata?: boolean;
}

export interface GridFieldChartStrategy {
  evaluatePoint: (
    xSi: number,
    ySi: number,
    xIndex: number,
    yIndex: number,
  ) => GridPointEvaluation | null;
  layers?: GridContourLayerSpec[];
  buildTraces?: (grid: GridEvaluationResult) => PlotTraceDto[];
}

export type FieldChartInputGroup<TPayload, TResult> = Omit<
  BuildInputTraceGroupsOptions<TPayload, TResult>,
  "xAxis" | "yAxis"
>;

interface FieldChartAssemblyOptions<TPayload, TResult> {
  layout: ChartLayoutSpec;
  source: CalculationSource;
  annotations?: PlotAnnotationDto[];
  leadingTraces?: PlotTraceDto[];
  beforeInputTraces?: PlotTraceDto[];
  inputGroups?: Array<FieldChartInputGroup<TPayload, TResult>>;
}

interface FieldChartBaseOptions<TPayload, TResult> extends FieldChartAssemblyOptions<TPayload, TResult> {
  xAxis: ChartAxisScale;
  yAxis: ChartAxisScale;
}

interface FieldChartOptions<TPayload, TResult> extends FieldChartBaseOptions<TPayload, TResult> {
  strategyTraces?: PlotTraceDto[];
}

export interface GridContourFieldChartOptions<TPayload, TResult>
  extends FieldChartBaseOptions<TPayload, TResult> {
  grid: GridFieldChartStrategy;
}

export interface BandedGridOutputEvaluation {
  valueSi: number;
  additionalHoverMetadata?: readonly unknown[];
}

export const GridBandRenderStrategy = {
  Categorical: "categorical",
  ConstraintContours: "constraint-contours",
} as const;

export type GridBandRenderStrategy =
  typeof GridBandRenderStrategy[keyof typeof GridBandRenderStrategy];

export interface BandedGridStrategyOptions {
  config: GridFieldChartConfig;
  output: ModelOutput;
  unitSystem: UnitSystemType;
  evaluateOutput: (
    xSi: number,
    ySi: number,
    zOutput: ModelOutputKey,
    xIndex: number,
    yIndex: number,
  ) => number | BandedGridOutputEvaluation | null;
  bandLabel?: string;
  hoverTemplate?: string;
  hoverTemplateSuffix?: string;
  opacity?: number;
  renderStrategy?: GridBandRenderStrategy;
  xAxis: ChartAxisScale;
  yAxis: ChartAxisScale;
}

function normalizeBandedGridOutputEvaluation(
  evaluation: number | BandedGridOutputEvaluation | null,
): BandedGridOutputEvaluation | null {
  if (evaluation === null) return null;
  return typeof evaluation === "number" ? { valueSi: evaluation } : evaluation;
}

function buildInputGroups<TPayload, TResult>(
  inputGroups: Array<FieldChartInputGroup<TPayload, TResult>> | undefined,
  xAxis: ChartAxisScale,
  yAxis: ChartAxisScale,
): PlotTraceDto[] {
  return inputGroups?.flatMap((inputGroup) => buildInputTraceGroups({
    ...inputGroup,
    xAxis,
    yAxis,
  })) ?? [];
}

function buildGridTraces(
  gridStrategy: GridFieldChartStrategy,
  xAxis: ChartAxisScale,
  yAxis: ChartAxisScale,
): PlotTraceDto[] {
  const grid = evaluateGrid({
    xAxis,
    yAxis,
    evaluatePoint: gridStrategy.evaluatePoint,
  });

  if (gridStrategy.buildTraces) {
    return gridStrategy.buildTraces(grid);
  }

  return (gridStrategy.layers ?? []).map((layer) => buildGridContourTrace({
    ...layer,
    grid,
  }));
}

export function buildFieldChart<TPayload = unknown, TResult = unknown>({
  xAxis,
  yAxis,
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
      ...buildInputGroups(inputGroups, xAxis, yAxis),
    ],
    layout: {
      ...layout,
      xAxis,
      yAxis,
    },
    annotations,
    source,
  });
}

/**
 * Shared grid chart runner. Model callbacks receive SI axis values.
 */
export function buildGridFieldChart<TPayload = unknown, TResult = unknown>({
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
    xAxis,
    yAxis,
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
 * Explore-mode grid runner. Model callbacks return one canonical output value
 * plus optional display-only hover metadata; this layer owns half-open band
 * assignment and selected-output conversion.
 */
export function createBandedGridStrategy({
  config,
  output,
  unitSystem,
  evaluateOutput,
  bandLabel = "Band",
  hoverTemplate,
  hoverTemplateSuffix = "",
  opacity,
  renderStrategy = GridBandRenderStrategy.Categorical,
  xAxis,
  yAxis,
}: BandedGridStrategyOptions): GridFieldChartStrategy {
  const outputMeta = getModelOutputDisplayMeta(output.key, unitSystem);
  const outputUnits = outputMeta.displayUnits ? ` ${outputMeta.displayUnits}` : "";
  const hovertemplate = hoverTemplate
    ?? `${xAxis.label}: %{x:.${xAxis.decimals ?? 2}f} ${xAxis.units}<br>${yAxis.label}: %{y:.${yAxis.decimals ?? 2}f} ${yAxis.units}<br><b>${bandLabel}: %{text}</b><br>${output.label}: %{customdata[0]:.${outputMeta.decimals}f}${outputUnits}${hoverTemplateSuffix}<extra></extra>`;

  return {
    evaluatePoint: (xSi, ySi, xIndex, yIndex) => {
      const evaluation = normalizeBandedGridOutputEvaluation(
        evaluateOutput(xSi, ySi, config.zOutput, xIndex, yIndex),
      );
      if (evaluation === null) {
        return null;
      }
      const valueSi = evaluation.valueSi;
      const hoverMetadata = [
        convertModelOutputFromSi(output.key, valueSi, unitSystem),
        ...(evaluation.additionalHoverMetadata ?? []),
      ];
      const bandIndex = findNumericBandIndexForValue(config.bands, valueSi);
      return {
        z: valueSi,
        text: bandIndex === undefined ? "Unclassified" : config.bands[bandIndex].label,
        hoverMetadata,
      };
    },
    buildTraces: (grid: GridEvaluationResult) => [
      ...(renderStrategy === GridBandRenderStrategy.ConstraintContours
        ? buildConstraintBandTraces({
          name: `${output.label} bands`,
          bands: config.bands,
          grid,
          opacity,
        })
        : buildCategoricalBandTraces({
          name: `${output.label} bands`,
          bands: config.bands,
          grid,
          opacity,
        })),
      buildBandTooltipTrace({
        name: `${output.label} bands hover`,
        grid,
        hovertemplate,
      }),
    ],
  };
}
