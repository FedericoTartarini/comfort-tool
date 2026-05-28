/**
 * Data transfer objects (DTOs) for comfort calculations.
 * Defines the expected structure for requests and responses
 * across comfort models and thermal indices.
 */

import type { CalculationSource } from "./calculationMetadata";
import type { InputId as InputIdType } from "./inputSlots";

// Comfort Point DTO, contains dry-bulb temperature and relative humidity
export interface ComfortPointDto {
  tdb: number;
  rh: number;
}
// Compare Input Map DTO, contains comfort zone requests for each input
export type CompareInputMap<T> = Partial<Record<InputIdType, T>>;


// Plot Trace DTO, contains plot trace data, including type, mode, name, x, y, z, text, 
// showlegend, fill, fillcolor, line, marker, colorscale, contours, zmin, zmax, showscale,
// hoverinfo and hovertemplate
export interface PlotTraceDto {
  type: "scatter" | "contour" | "heatmap";
  mode?: string;
  name: string;
  x: number[];
  y: number[];
  z?: number[][];
  text?: string[] | string[][];
  showlegend?: boolean | null;
  fill?: string | null;
  fillcolor?: string | null;
  line?: any;
  marker?: any;
  colorscale?: any[];
  contours?: any;
  zmin?: number;
  zmax?: number;
  showscale?: boolean;
  colorbar?: any;
  opacity?: number;
  hoverinfo?: string;
  hovertemplate?: string | null;
  /** When true, this trace represents a background zone overlay. Affected by Zones toggle. */
  isZone?: boolean;
  /** When true, this trace represents a colored background region. */
  isBackgroundZone?: boolean;
  /** When true, this trace represents a user-specific comfort zone boundary. */
  isComfortZone?: boolean;
  /** Metadata for each point in the trace, used for detailed hover templates. */
  hoverMetadata?: any[] | any[][];
}

// Plot Annotation DTO, contains plot annotation data, including x, y, text, showarrow and font
export interface PlotAnnotationDto {
  x: number;
  y: number;
  text: string;
  showarrow: boolean;
  font: Record<string, string | number>;
}

// Plot Layout DTO, contains plot layout data, including title, paper_bgcolor, plot_bgcolor,
// showlegend, margin, xaxis, yaxis, shapes, legend and height
export interface PlotLayoutDto {
  title: string;
  paper_bgcolor: string;
  plot_bgcolor: string;
  showlegend: boolean;
  margin: Record<string, number>;
  xaxis: Record<string, unknown>;
  yaxis: Record<string, unknown>;
  shapes?: Record<string, unknown>[];
  legend?: Record<string, unknown> | null;
  height?: number | null;
}

// Plotly Chart Response DTO, contains plot trace data, plot layout data, plot annotation data, and source
export interface PlotlyChartResponseDto {
  traces: PlotTraceDto[];
  layout: PlotLayoutDto;
  annotations: PlotAnnotationDto[];
  source: CalculationSource;
}
