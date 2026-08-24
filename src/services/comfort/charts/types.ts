import type { CalculationSource } from "../../../models/calculationMetadata";
import { type ChartAxisQuantityId } from "../../../models/physicalQuantities";
import type {
  PlotAnnotationDto,
  PlotHoverCellDto,
  PlotLegendDto,
  PlotMarginDto,
  PlotTraceDto,
} from "../../../models/comfortDtos";
export interface ChartRange {
  min: number;
  max: number;
}

/** Shared SI coordinate tolerance for chart baseline matching and axis solving. */
export const CHART_COORDINATE_TOLERANCE = 1e-6;

export interface ChartAxisScale {
  field: ChartAxisQuantityId;
  label: string;
  units: string;
  rangeSi: ChartRange;
  points: number;
  decimals?: number;
  gridColor?: string;
  showGrid?: boolean;
  zeroLine?: boolean;
  showTickLabels?: boolean;
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
  hoverMetadata?: PlotHoverCellDto;
}

export interface GridEvaluationResult {
  xValues: number[];
  yValues: number[];
  xValuesSi: number[];
  yValuesSi: number[];
  zValues: number[][];
  textValues: string[][];
  hoverMetadata: PlotHoverCellDto[][];
}

export interface ChartLayoutSpec {
  title: string;
  paperBgColor: string;
  plotBgColor: string;
  showLegend: boolean;
  margin: PlotMarginDto;
  gridColor?: string;
  showGrid?: boolean;
  zeroLine?: boolean;
  legend?: PlotLegendDto;
  height?: number;
}

export interface ChartResponseSpec {
  traces: PlotTraceDto[];
  layout: ChartLayoutSpec & {
    xAxis: ChartAxisScale;
    yAxis: ChartAxisScale;
  };
  annotations?: PlotAnnotationDto[];
  source: CalculationSource;
}
