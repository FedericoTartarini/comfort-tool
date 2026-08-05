/**
 * Data transfer objects (DTOs) for comfort calculations.
 * Defines the expected structure for requests and responses
 * across comfort models and thermal indices.
 */

import type { CalculationSource } from "./calculationMetadata";
import type { InputId as InputIdType } from "./inputSlots";

export type PlotColorScaleDto = Array<[number, string]>;

export interface PlotLineDto {
  color?: string;
  width?: number;
}

export interface PlotMarkerDto {
  color?: string;
  size?: number;
  line?: PlotLineDto;
}

export type PlotHoverInfoDto = "all" | "skip";
export type PlotHoverValueDto = string | number;
export type PlotHoverRowDto = PlotHoverValueDto[];
export type PlotHoverCellDto = PlotHoverValueDto | PlotHoverRowDto;

export interface PlotLevelContoursDto {
  type?: "levels";
  operation?: never;
  value?: never;
  coloring?: "fill" | "none" | "heatmap";
  showlines?: boolean;
  start?: number;
  end?: number;
  size?: number;
  smoothing?: number;
  line?: PlotLineDto;
}

export type PlotConstraintOperationDto = ">=" | "<" | "][" | "=";

export interface PlotConstraintContoursDto {
  type: "constraint";
  operation: PlotConstraintOperationDto;
  value: number | [number, number];
  coloring?: "none";
  showlines?: boolean;
  line?: PlotLineDto;
}

export type PlotContoursDto =
  | PlotLevelContoursDto
  | PlotConstraintContoursDto;

// Comfort Point DTO, contains dry-bulb temperature and relative humidity
export interface ComfortPointDto {
  tdb: number;
  rh: number;
}
// Compare Input Map DTO, contains comfort zone requests for each input
export type CompareInputMap<T> = Partial<Record<InputIdType, T>>;

/** Shared calculation-derived input payload used by model chart builders. */
export interface ModelChartSourceDto<TRequest> {
  inputs: CompareInputMap<TRequest>;
}

interface PlotTraceBaseDto {
  name: string;
  x: number[];
  y: number[];
  showlegend?: boolean;
  opacity?: number;
  hoverinfo?: PlotHoverInfoDto;
  hovertemplate?: string;
  /** When true, this trace represents a background zone overlay. Affected by Zones toggle. */
  isZone?: boolean;
  /** When true, this trace represents a colored background region. */
  isBackgroundZone?: boolean;
  /** When true, this trace represents a user-specific comfort zone boundary. */
  isComfortZone?: boolean;
}

export interface PlotScatterMarkerTraceDto extends PlotTraceBaseDto {
  type: "scatter";
  mode: "markers";
  line?: PlotLineDto;
  marker: PlotMarkerDto;
  text?: never;
  fill?: never;
  fillcolor?: never;
  z?: never;
  colorscale?: never;
  contours?: never;
  zmin?: never;
  zmax?: never;
  showscale?: never;
  hoverongaps?: never;
  /** Plotly customdata for the single marker point. */
  hoverMetadata?: PlotHoverRowDto;
}

export interface PlotScatterLineTraceDto extends PlotTraceBaseDto {
  type: "scatter";
  mode: "lines";
  text?: string[];
  fill?: "toself";
  fillcolor?: string;
  line?: PlotLineDto;
  marker?: PlotMarkerDto;
  z?: never;
  colorscale?: never;
  contours?: never;
  zmin?: never;
  zmax?: never;
  showscale?: never;
  hoverongaps?: never;
  /** Plotly customdata rows aligned with the line coordinates. */
  hoverMetadata?: PlotHoverRowDto[];
}

export interface PlotContourTraceDto extends PlotTraceBaseDto {
  type: "contour";
  mode?: never;
  marker?: never;
  fill?: never;
  z: number[][];
  text?: string[][];
  colorscale?: PlotColorScaleDto;
  fillcolor?: string;
  contours: PlotContoursDto;
  zmin?: number;
  zmax?: number;
  showscale?: boolean;
  line?: PlotLineDto;
  hoverongaps?: boolean;
  /** Plotly customdata grid; each cell is a scalar or value tuple. */
  hoverMetadata?: PlotHoverCellDto[][];
}

export type PlotTraceDto =
  | PlotScatterMarkerTraceDto
  | PlotScatterLineTraceDto
  | PlotContourTraceDto;

export interface PlotFontDto {
  size: number;
  color: string;
}

export interface PlotAnnotationDto {
  x: number;
  y: number;
  text: string;
  showarrow: false;
  font: PlotFontDto;
}

export interface PlotMarginDto {
  l: number;
  r: number;
  t: number;
  b: number;
}

export interface PlotAxisDto {
  title: string;
  range: [number, number];
  gridcolor?: string;
  showgrid?: boolean;
  zeroline?: boolean;
  showticklabels?: boolean;
}

export interface PlotLegendDto {
  orientation?: "h" | "v";
  x?: number;
  y?: number;
}

export interface PlotLayoutDto {
  title: string;
  paper_bgcolor: string;
  plot_bgcolor: string;
  showlegend: boolean;
  margin: PlotMarginDto;
  xaxis: PlotAxisDto;
  yaxis: PlotAxisDto;
  legend?: PlotLegendDto;
  height?: number;
}

// Plotly Chart Response DTO, contains plot trace data, plot layout data, plot annotation data, and source
export interface PlotlyChartResponseDto {
  traces: PlotTraceDto[];
  layout: PlotLayoutDto;
  annotations: PlotAnnotationDto[];
  source: CalculationSource;
}
