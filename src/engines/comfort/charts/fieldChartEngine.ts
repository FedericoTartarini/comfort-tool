import type { CalculationSource } from "../../../catalog/calculationMetadata";
import { type ChartAxisQuantityId } from "../../../catalog/quantities";
import type {
  PlotAnnotation,
  PlotHoverValue,
  PlotLegend,
  PlotMargin,
  PlotlyChartSpec,
  PlotTrace,
} from "../../plotlyTypes";
import {
  type Band,
  type BandInputsSi,
  findNumericBandIndexForValue,
  type ModelOutput,
  type ModelOutputKey,
  type NumericFieldChartConfig,
} from "../../../catalog/modelCapabilities";
import type { UnitSystem as UnitSystemType } from "../../../catalog/units";
import {
  convertModelOutputFromSi,
  getModelOutputDisplayMeta,
} from "../../units";
import {
  buildBoundaryRegionTraces,
  buildFilledBoundaryRegionTrace,
  type BoundaryAxis,
} from "./boundaryRegionEngine";
import { createFieldAxisScale } from "./axis";
import { evaluateGrid } from "./gridEngine";
import {
  buildInputTraceGroup,
  type BuildInputTraceGroupsOptions,
} from "./inputPoints";
import { buildChartResponse } from "./layout";
import type {
  ChartAxisScale,
  ChartLayoutSpec,
  ChartRange,
  GridEvaluationResult,
  GridPointEvaluation,
} from "./types";
import {
  buildBandTooltipTrace,
  buildCategoricalBandTraces,
  buildConstraintBandTraces,
} from "./zoneGrid";

const DEFAULT_PAPER_BACKGROUND = "#ffffff";
const DEFAULT_PLOT_BACKGROUND = "#f8fafc";
const DEFAULT_GRID_COLOR = "#e2e8f0";
const DEFAULT_CHART_HEIGHT = 480;

export interface FieldChartAxisSpec {
  field: ChartAxisQuantityId;
  rangeSi?: ChartRange;
  points: number;
  label?: string;
  units?: string | ((unitSystem: UnitSystemType) => string);
  decimals?: number;
  gridColor?: string;
  showGrid?: boolean;
  zeroLine?: boolean;
  showTickLabels?: boolean;
  dtick?: number;
  toDisplay?: (valueSi: number, unitSystem: UnitSystemType) => number;
  toSi?: (valueDisplay: number, unitSystem: UnitSystemType) => number;
}

export interface FieldChartRenderContext {
  xAxis: ChartAxisScale;
  yAxis: ChartAxisScale;
  unitSystem: UnitSystemType;
}

export interface GridFieldChartStrategy {
  kind: "grid";
  evaluatePoint: (
    xSi: number,
    ySi: number,
    xIndex: number,
    yIndex: number,
    context: FieldChartRenderContext,
  ) => GridPointEvaluation | null;
  renderTraces: (
    grid: GridEvaluationResult,
    context: FieldChartRenderContext,
  ) => PlotTrace[];
}

export interface BoundaryFieldChartStrategy {
  kind: "boundary";
  buildTraces: (context: FieldChartRenderContext) => PlotTrace[];
}

export interface BoundaryRegionStyle {
  lineColor: string;
  opacity?: number;
}

export interface BoundaryRegionStrategyOptions {
  bands: readonly Band[];
  bandInputsSi: BandInputsSi;
  style: BoundaryRegionStyle;
  boundaryAxis: BoundaryAxis;
  additionalBoundaryValuesSi?: (
    context: FieldChartRenderContext,
  ) => readonly number[];
}

export type FieldChartStrategy =
  | GridFieldChartStrategy
  | BoundaryFieldChartStrategy;

export type FieldChartInputGroup<TPayload, TResult> = Omit<
  BuildInputTraceGroupsOptions<TPayload, TResult>,
  "xAxis" | "yAxis"
>;

export interface FieldChartLayoutSpec {
  title: string;
  margin: PlotMargin;
  paperBgColor?: string;
  plotBgColor?: string;
  gridColor?: string;
  showGrid?: boolean;
  zeroLine?: boolean;
  legend?: PlotLegend;
  height?: number;
}

export interface FieldChartOptions<TPayload, TResult> {
  unitSystem: UnitSystemType;
  xAxis: FieldChartAxisSpec;
  yAxis: FieldChartAxisSpec;
  strategy: FieldChartStrategy;
  chartOverlays?: (context: FieldChartRenderContext) => PlotTrace[];
  inputGroups?: (
    context: FieldChartRenderContext,
  ) => Array<FieldChartInputGroup<TPayload, TResult>>;
  layout: FieldChartLayoutSpec;
  source: CalculationSource;
  annotations?: PlotAnnotation[];
}

export interface BandedGridOutputEvaluation {
  valueSi: number;
  additionalHoverMetadata?: readonly PlotHoverValue[];
}

export const GridBandRenderStrategy = {
  Categorical: "categorical",
  ConstraintContours: "constraint-contours",
} as const;

export type GridBandRenderStrategy =
  typeof GridBandRenderStrategy[keyof typeof GridBandRenderStrategy];

type RenderText = string | ((context: FieldChartRenderContext) => string);

export interface BandedGridStrategyOptions {
  config: NumericFieldChartConfig;
  output: ModelOutput;
  evaluateOutput: (
    xSi: number,
    ySi: number,
    zOutput: ModelOutputKey,
    xIndex: number,
    yIndex: number,
    context: FieldChartRenderContext,
  ) => number | BandedGridOutputEvaluation | null;
  bandLabel?: string;
  hoverTemplate?: RenderText;
  hoverTemplateSuffix?: RenderText;
  opacity?: number;
  renderStrategy?: GridBandRenderStrategy;
  /**
   * Projects only the grid used to draw band fills and boundaries. The
   * original evaluated grid remains the source for hover, so callers can
   * render through masked domains without making those cells interactive.
   */
  projectFillGrid?: (
    grid: GridEvaluationResult,
    context: FieldChartRenderContext,
  ) => GridEvaluationResult;
  /** When true, only the hover grid is emitted (psychrometric polygon fills). */
  omitBandFillTraces?: boolean;
}

function createAxis(
  spec: FieldChartAxisSpec,
  unitSystem: UnitSystemType,
): ChartAxisScale {
  return createFieldAxisScale({
    field: spec.field,
    unitSystem,
    rangeSi: spec.rangeSi,
    points: spec.points,
    label: spec.label,
    units: typeof spec.units === "function" ? spec.units(unitSystem) : spec.units,
    decimals: spec.decimals,
    gridColor: spec.gridColor,
    showGrid: spec.showGrid,
    zeroLine: spec.zeroLine,
    showTickLabels: spec.showTickLabels,
    dtick: spec.dtick,
    toDisplay: spec.toDisplay
      ? (valueSi) => spec.toDisplay!(valueSi, unitSystem)
      : undefined,
    toSi: spec.toSi
      ? (valueDisplay) => spec.toSi!(valueDisplay, unitSystem)
      : undefined,
  });
}

function resolveText(
  value: RenderText | undefined,
  context: FieldChartRenderContext,
  fallback = "",
): string {
  if (value === undefined) return fallback;
  return typeof value === "function" ? value(context) : value;
}

function normalizeBandedGridOutputEvaluation(
  evaluation: number | BandedGridOutputEvaluation | null,
): BandedGridOutputEvaluation | null {
  if (evaluation === null) return null;
  return typeof evaluation === "number" ? { valueSi: evaluation } : evaluation;
}

function hoverGridHasMetadata(grid: GridEvaluationResult): boolean {
  return grid.hoverMetadata.some((row) => (
    row.some((cell) => (Array.isArray(cell) ? cell.length > 0 : cell !== ""))
  ));
}

function toDisplayOutputGrid(
  grid: GridEvaluationResult,
  outputKey: ModelOutputKey,
  unitSystem: UnitSystemType,
): GridEvaluationResult {
  return {
    ...grid,
    zValues: grid.zValues.map((row) => (
      row.map((value) => (
        Number.isFinite(value)
          ? convertModelOutputFromSi(outputKey, value, unitSystem)
          : value
      ))
    )),
  };
}

function buildStrategyTraces(
  strategy: FieldChartStrategy,
  context: FieldChartRenderContext,
): PlotTrace[] {
  if (strategy.kind === "boundary") {
    return strategy.buildTraces(context);
  }

  const grid = evaluateGrid({
    xAxis: context.xAxis,
    yAxis: context.yAxis,
    evaluatePoint: (xSi, ySi, xIndex, yIndex) => strategy.evaluatePoint(
      xSi,
      ySi,
      xIndex,
      yIndex,
      context,
    ),
  });
  return strategy.renderTraces(grid, context);
}

function resolveLayout(
  layout: FieldChartLayoutSpec,
  showLegend: boolean,
): ChartLayoutSpec {
  return {
    title: layout.title,
    paperBgColor: layout.paperBgColor ?? DEFAULT_PAPER_BACKGROUND,
    plotBgColor: layout.plotBgColor ?? DEFAULT_PLOT_BACKGROUND,
    showLegend,
    margin: layout.margin,
    gridColor: layout.gridColor ?? DEFAULT_GRID_COLOR,
    showGrid: layout.showGrid,
    zeroLine: layout.zeroLine,
    legend: layout.legend,
    height: layout.height === undefined ? DEFAULT_CHART_HEIGHT : layout.height,
  };
}

export function buildFieldChart<TPayload = unknown, TResult = unknown>({
  unitSystem,
  xAxis: xAxisSpec,
  yAxis: yAxisSpec,
  strategy,
  chartOverlays,
  inputGroups,
  layout,
  source,
  annotations = [],
}: FieldChartOptions<TPayload, TResult>): PlotlyChartSpec {
  const context: FieldChartRenderContext = {
    xAxis: createAxis(xAxisSpec, unitSystem),
    yAxis: createAxis(yAxisSpec, unitSystem),
    unitSystem,
  };
  const groups = inputGroups?.(context) ?? [];
  const inputTraces = groups.map((inputGroup) => buildInputTraceGroup({
    ...inputGroup,
    xAxis: context.xAxis,
    yAxis: context.yAxis,
  }));
  const inputOverlays = inputTraces.flatMap(({ overlays }) => overlays);
  const inputMarkers = inputTraces.flatMap(({ markers }) => markers);

  return buildChartResponse({
    traces: [
      ...buildStrategyTraces(strategy, context),
      ...(chartOverlays?.(context) ?? []),
      ...inputOverlays,
      ...inputMarkers,
    ],
    layout: {
      ...resolveLayout(
        layout,
        inputMarkers.some(({ showlegend }) => showlegend === true),
      ),
      xAxis: context.xAxis,
      yAxis: context.yAxis,
    },
    annotations,
    source,
  });
}

export function createBoundaryRegionStrategy({
  bands,
  bandInputsSi,
  style,
  boundaryAxis,
  additionalBoundaryValuesSi,
}: BoundaryRegionStrategyOptions): BoundaryFieldChartStrategy {
  return {
    kind: "boundary",
    buildTraces: (context) => buildBoundaryRegionTraces({
      bands,
      bandInputsSi,
      xAxis: context.xAxis,
      yAxis: context.yAxis,
      boundaryAxis,
      additionalBoundaryValuesSi: additionalBoundaryValuesSi?.(context),
      buildTrace: ({ band, polygonX, polygonY }) => (
        buildFilledBoundaryRegionTrace({
          name: band.label,
          color: band.color,
          polygonX,
          polygonY,
          lineColor: style.lineColor,
          opacity: style.opacity,
        })
      ),
    }),
  };
}

export function createBandedGridStrategy({
  config,
  output,
  evaluateOutput,
  bandLabel = "Band",
  hoverTemplate,
  hoverTemplateSuffix,
  opacity,
  renderStrategy = GridBandRenderStrategy.Categorical,
  projectFillGrid,
  omitBandFillTraces = false,
}: BandedGridStrategyOptions): GridFieldChartStrategy {
  return {
    kind: "grid",
    evaluatePoint: (xSi, ySi, xIndex, yIndex, context) => {
      const evaluation = normalizeBandedGridOutputEvaluation(
        evaluateOutput(xSi, ySi, config.zOutput, xIndex, yIndex, context),
      );
      if (evaluation === null) return null;

      const bandIndex = findNumericBandIndexForValue(config.bands, evaluation.valueSi);
      const additionalHoverMetadata = evaluation.additionalHoverMetadata ?? [];
      const displayValue = convertModelOutputFromSi(
        output.key,
        evaluation.valueSi,
        context.unitSystem,
      );
      return {
        z: evaluation.valueSi,
        text: bandIndex === undefined ? "Unclassified" : config.bands[bandIndex].label,
        hoverMetadata: additionalHoverMetadata.length > 0
          ? [displayValue, ...additionalHoverMetadata]
          : undefined,
      };
    },
    renderTraces: (grid, context) => {
      const { xAxis, yAxis, unitSystem } = context;
      const outputMeta = getModelOutputDisplayMeta(output.key, unitSystem);
      const outputUnits = outputMeta.displayUnits
        ? ` ${outputMeta.displayUnits}`
        : "";
      const usesHoverMetadata = hoverGridHasMetadata(grid);
      const outputValueToken = usesHoverMetadata
        ? `%{customdata[0]:.${outputMeta.decimals}f}`
        : `%{z:.${outputMeta.decimals}f}`;
      const resolvedHoverTemplate = resolveText(
        hoverTemplate,
        context,
        `${xAxis.label}: %{x:.${xAxis.decimals ?? 2}f} ${xAxis.units}<br>${yAxis.label}: %{y:.${yAxis.decimals ?? 2}f} ${yAxis.units}<br><b>${bandLabel}: %{text}</b><br>${output.label}: ${outputValueToken}${outputUnits}${resolveText(hoverTemplateSuffix, context)}<extra></extra>`,
      );
      const fillGrid = omitBandFillTraces
        ? undefined
        : projectFillGrid?.(grid, context) ?? grid;
      return [
        ...(omitBandFillTraces || !fillGrid
          ? []
          : renderStrategy === GridBandRenderStrategy.ConstraintContours
            ? buildConstraintBandTraces({
              name: `${output.label} bands`,
              bands: config.bands,
              grid: fillGrid,
              opacity,
            })
            : buildCategoricalBandTraces({
              name: `${output.label} bands`,
              bands: config.bands,
              grid: fillGrid,
              opacity,
            })),
        buildBandTooltipTrace({
          name: `${output.label} bands hover`,
          grid: usesHoverMetadata
            ? grid
            : toDisplayOutputGrid(grid, output.key, unitSystem),
          hovertemplate: resolvedHoverTemplate,
          includeHoverMetadata: usesHoverMetadata,
        }),
      ];
    },
  };
}
