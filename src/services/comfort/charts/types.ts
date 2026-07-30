import type { CalculationSource } from "../../../models/calculationMetadata";
import type { PlotAnnotationDto, PlotTraceDto } from "../../../models/comfortDtos";
import type { FieldKey as FieldKeyType } from "../../../models/fieldKeys";

export interface ChartRange {
  min: number;
  max: number;
}

export interface ChartAxisScale {
  field: FieldKeyType;
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
  hoverMetadata?: unknown;
}

export interface GridEvaluationResult {
  xValues: number[];
  yValues: number[];
  xValuesSi: number[];
  yValuesSi: number[];
  zValues: number[][];
  textValues: string[][];
  hoverMetadata: unknown[][];
}

export interface ChartLayoutSpec {
  title: string;
  paperBgColor: string;
  plotBgColor: string;
  showLegend: boolean;
  margin: Record<string, number>;
  gridColor?: string;
  showGrid?: boolean;
  zeroLine?: boolean;
  legend?: Record<string, unknown> | null;
  shapes?: Record<string, unknown>[];
  height?: number | null;
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
