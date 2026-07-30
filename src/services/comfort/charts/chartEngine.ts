import type { CalculationSource } from "../../../models/calculationMetadata";
import type { PlotAnnotationDto, PlotlyChartResponseDto, PlotTraceDto } from "../../../models/comfortDtos";
import {
  findNumericBandIndexForValue,
  type ExploreFieldChartConfig,
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
import { buildCategoricalBandLayers, buildConstraintBandTraces } from "./zoneGrid";
import { validateNumericBands } from "./bands";

/**
 * Shared field-chart engine contract.
 *
 * The lower-level runners preserve the existing static and boundary chart
 * strategies. Explore charts add `FieldChartConfig` above that scaffolding so
 * models provide raw SI outputs while the engine owns band assignment:
 * axis display conversion, trace ordering, input overlays, layout assembly, and
 * the two current rendering strategies:
 *
 * 1. grid/contour - evaluate a model over SI x/y points, then build contour traces
 * 2. boundary/region - accept model-built boundary geometry and assemble it with inputs
 *
 * Strategy callbacks receive SI values. Axis scales convert coordinates, while
 * selected model outputs use the centralized output conversion registry.
 */
export interface GridContourLayerSpec {
  name: string;
  colorscale?: any[];
  fillcolor?: string;
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
  hoverOnGaps?: boolean;
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

interface FieldChartOptions<TPayload, TResult> extends FieldChartBaseOptions<TPayload, TResult> {
  strategyTraces?: PlotTraceDto[];
}

export interface GridContourFieldChartOptions<TPayload, TResult>
  extends FieldChartBaseOptions<TPayload, TResult> {
  grid?: GridFieldChartStrategy;
}

export interface BoundaryRegionFieldChartOptions<TPayload, TResult>
  extends FieldChartAssemblyOptions<TPayload, TResult> {
  boundaryTraces?: PlotTraceDto[];
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

export interface BandedGridFieldChartOptions<TPayload, TResult>
  extends FieldChartBaseOptions<TPayload, TResult> {
  config: ExploreFieldChartConfig;
  output: ModelOutput;
  unitSystem: UnitSystemType;
  evaluateOutput?: (
    xSi: number,
    ySi: number,
    zOutput: ModelOutputKey,
    xIndex: number,
    yIndex: number,
  ) => number | BandedGridOutputEvaluation;
  bandLabel?: string;
  hoverTemplate?: string;
  hoverTemplateSuffix?: string;
  errorText?: string;
  opacity?: number;
  renderStrategy?: GridBandRenderStrategy;
}

function normalizeBandedGridOutputEvaluation(
  evaluation: number | BandedGridOutputEvaluation,
): BandedGridOutputEvaluation {
  return typeof evaluation === "number" ? { valueSi: evaluation } : evaluation;
}

function buildInputGroups<TPayload, TResult>(
  inputGroups: Array<BuildInputTraceGroupsOptions<TPayload, TResult>> | undefined,
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
export function buildBandedGridFieldChart<TPayload = unknown, TResult = unknown>({
  config,
  output,
  unitSystem,
  evaluateOutput,
  bandLabel = "Band",
  hoverTemplate,
  hoverTemplateSuffix = "",
  errorText,
  opacity,
  renderStrategy = GridBandRenderStrategy.Categorical,
  xAxis,
  yAxis,
  leadingTraces = [],
  beforeInputTraces = [],
  inputGroups,
  layout,
  source,
  annotations = [],
}: BandedGridFieldChartOptions<TPayload, TResult>): PlotlyChartResponseDto {
  if (config.xField !== xAxis.field || config.yField !== yAxis.field) {
    throw new Error("FieldChartConfig axes must match the chart axis scales.");
  }
  if (config.zOutput !== output.key) {
    throw new Error("FieldChartConfig output must match the declared model output.");
  }
  const bandValidation = validateNumericBands(config.bands);
  if (!bandValidation.valid) {
    throw new Error(`FieldChartConfig has invalid bands: ${bandValidation.issues[0].message}`);
  }

  const outputMeta = getModelOutputDisplayMeta(output.key, unitSystem);
  const outputUnits = outputMeta.displayUnits ? ` ${outputMeta.displayUnits}` : "";
  const hovertemplate = hoverTemplate
    ?? `${xAxis.label}: %{x:.${xAxis.decimals ?? 2}f} ${xAxis.units}<br>${yAxis.label}: %{y:.${yAxis.decimals ?? 2}f} ${yAxis.units}<br><b>${bandLabel}: %{text}</b><br>${output.label}: %{customdata[0]:.${outputMeta.decimals}f}${outputUnits}${hoverTemplateSuffix}<extra></extra>`;

  return buildGridContourFieldChart({
    xAxis,
    yAxis,
    grid: evaluateOutput
      ? {
        evaluatePoint: (xSi, ySi, xIndex, yIndex) => {
          const evaluation = normalizeBandedGridOutputEvaluation(
            evaluateOutput(
              xSi,
              ySi,
              config.zOutput,
              xIndex,
              yIndex,
            ),
          );
          const valueSi = evaluation.valueSi;
          const hoverMetadata = [
            convertModelOutputFromSi(output.key, valueSi, unitSystem),
            ...(evaluation.additionalHoverMetadata ?? []),
          ];
          const bandIndex = findNumericBandIndexForValue(config.bands, valueSi);

          if (renderStrategy === GridBandRenderStrategy.ConstraintContours) {
            return {
              z: valueSi,
              text: bandIndex === undefined ? "" : config.bands[bandIndex].label,
              hoverMetadata,
            };
          }

          if (bandIndex === undefined) {
            return {
              z: NaN,
              text: "",
              hoverMetadata,
            };
          }

          return {
            z: bandIndex,
            text: config.bands[bandIndex].label,
            hoverMetadata,
          };
        },
        errorText,
        ...(renderStrategy === GridBandRenderStrategy.ConstraintContours
          ? {
            buildTraces: (grid: GridEvaluationResult) => buildConstraintBandTraces({
              name: `${output.label} bands`,
              bands: config.bands,
              grid,
              hovertemplate,
              opacity,
            }),
          }
          : {
            layers: buildCategoricalBandLayers({
              name: `${output.label} bands`,
              bands: config.bands,
              hovertemplate,
              opacity,
            }),
          }),
      }
      : undefined,
    leadingTraces,
    beforeInputTraces,
    inputGroups,
    layout,
    source,
    annotations,
  });
}

/**
 * Shared boundary/region chart runner. Boundary geometry is supplied by the model,
 * and the layout axes are authoritative for layout and input overlays.
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
    xAxis: layout.xAxis,
    yAxis: layout.yAxis,
    strategyTraces: boundaryTraces,
    leadingTraces,
    beforeInputTraces,
    inputGroups,
    layout,
    source,
    annotations,
  });
}
