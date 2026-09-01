import type { CalculationSource } from "../../../catalog/calculationMetadata";
import { PhysicalQuantityId } from "../../../catalog/quantities";
import type {
  PlotAnnotation,
  PlotLegend,
  PlotMargin,
  PlotlyChartSpec,
  PlotTrace,
} from "../../plotlyTypes";
import { type Band, type BandInputsSi, type ModelOutput, type NumericFieldChartConfig } from "../../../catalog/modelCapabilities";
import type { UnitSystem as UnitSystemType } from "../../../catalog/units";
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
  buildCategoricalBandTraces,
  buildConstraintBandTraces,
} from "./zoneGrid";

const DEFAULT_PAPER_BACKGROUND = "#ffffff";
const DEFAULT_PLOT_BACKGROUND = "#f8fafc";
const DEFAULT_GRID_COLOR = "#e2e8f0";
const DEFAULT_CHART_HEIGHT = 480;

export interface FieldChartAxisSpec {
  field: PhysicalQuantityId;
  rangeSi: ChartRange;
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

export interface EmptyFieldChartStrategy {
  kind: "empty";
}

export type FieldChartStrategy =
  | GridFieldChartStrategy
  | BoundaryFieldChartStrategy
  | EmptyFieldChartStrategy;

export function createEmptyFieldStrategy(): EmptyFieldChartStrategy {
  return { kind: "empty" };
}

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
}

export const GridBandRenderStrategy = {
  Categorical: "categorical",
  ConstraintContours: "constraint-contours",
} as const;

export type GridBandRenderStrategy =
  typeof GridBandRenderStrategy[keyof typeof GridBandRenderStrategy];

export interface BandedGridStrategyOptions {
  config: NumericFieldChartConfig;
  output: ModelOutput;
  evaluateOutput: (
    xSi: number,
    ySi: number,
    zOutput: PhysicalQuantityId,
    xIndex: number,
    yIndex: number,
    context: FieldChartRenderContext,
  ) => number | BandedGridOutputEvaluation | null;
  opacity?: number;
  renderStrategy?: GridBandRenderStrategy;
  /** Projects only the grid used to draw band fills and boundaries. */
  projectFillGrid?: (
    grid: GridEvaluationResult,
    context: FieldChartRenderContext,
  ) => GridEvaluationResult;
}

export function createFieldChartAxis(
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

function normalizeBandedGridOutputEvaluation(
  evaluation: number | BandedGridOutputEvaluation | null,
): number | null {
  if (evaluation === null) return null;
  return typeof evaluation === "number" ? evaluation : evaluation.valueSi;
}

function buildStrategyTraces(
  strategy: FieldChartStrategy,
  context: FieldChartRenderContext,
): PlotTrace[] {
  if (strategy.kind === "empty") {
    return [];
  }
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
    xAxis: createFieldChartAxis(xAxisSpec, unitSystem),
    yAxis: createFieldChartAxis(yAxisSpec, unitSystem),
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
  opacity,
  renderStrategy = GridBandRenderStrategy.Categorical,
  projectFillGrid,
}: BandedGridStrategyOptions): GridFieldChartStrategy {
  return {
    kind: "grid",
    evaluatePoint: (xSi, ySi, xIndex, yIndex, context) => {
      const valueSi = normalizeBandedGridOutputEvaluation(
        evaluateOutput(xSi, ySi, config.zOutput, xIndex, yIndex, context),
      );
      if (valueSi === null) return null;
      return { z: valueSi };
    },
    renderTraces: (grid, context) => {
      const fillGrid = projectFillGrid?.(grid, context) ?? grid;
      return renderStrategy === GridBandRenderStrategy.ConstraintContours
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
        });
    },
  };
}
