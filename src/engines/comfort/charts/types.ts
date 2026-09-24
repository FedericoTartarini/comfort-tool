import type { CalculationSource } from "../../../catalog/calculationMetadata";
import { type PhysicalQuantityId } from "../../../catalog/quantities";
import type {
  PlotAnnotation,
  PlotHoverCell,
  PlotLegend,
  PlotMargin,
  PlotTrace,
} from "../../plotlyTypes";
export interface ChartRange {
  min: number;
  max: number;
}

/** Shared SI coordinate tolerance for chart baseline matching and axis solving. */
export const CHART_COORDINATE_TOLERANCE = 1e-6;

/**
 * Max samples per axis for interactive Dynamic 2-D fields (Plan 0f).
 * BandScalar / 1-D charts may sample more densely along a single axis.
 */
export const INTERACTIVE_DYNAMIC_GRID_POINTS = 100;

export function resolveInteractiveDynamicGridPoints(
  requested?: number,
): number {
  return Math.min(
    requested ?? INTERACTIVE_DYNAMIC_GRID_POINTS,
    INTERACTIVE_DYNAMIC_GRID_POINTS,
  );
}

export interface ChartAxisScale {
  field: PhysicalQuantityId;
  label: string;
  units: string;
  rangeSi: ChartRange;
  points: number;
  decimals?: number;
  gridColor?: string;
  showGrid?: boolean;
  zeroLine?: boolean;
  showTickLabels?: boolean;
  dtick?: number;
  toDisplay: (valueSi: number) => number;
  toSi: (valueDisplay: number) => number;
}

export interface ChartAxisValues {
  displayValues: number[];
  siValues: number[];
  displayRange: ChartRange;
}

export interface GridPointEvaluation {
  z: number;
  text?: string;
  /**
   * Per-cell Plotly customdata. Models may return a scalar or a tuple; the grid
   * engine preserves the shape so hover templates can reference it directly.
   */
  hoverMetadata?: PlotHoverCell;
}

export interface GridEvaluationResult {
  xValues: number[];
  yValues: number[];
  xValuesSi: number[];
  yValuesSi: number[];
  zValues: number[][];
  textValues: string[][];
  hoverMetadata: PlotHoverCell[][];
}

export interface ChartLayoutSpec {
  title: string;
  paperBgColor: string;
  plotBgColor: string;
  showLegend: boolean;
  margin: PlotMargin;
  gridColor?: string;
  showGrid?: boolean;
  zeroLine?: boolean;
  legend?: PlotLegend;
  height?: number;
}

export interface ChartResponseSpec {
  traces: PlotTrace[];
  layout: ChartLayoutSpec & {
    xAxis: ChartAxisScale;
    yAxis: ChartAxisScale;
  };
  annotations?: PlotAnnotation[];
  source: CalculationSource;
}
