/**
 * Plotly-compatible, theme-ready adapter types (Plan §5.2).
 *
 * Engines emit a compact PlotlyChartSpec; toPlotlyFigure owns theming.
 * The payload keeps baseline style fields (`paper_bgcolor`, `plot_bgcolor`,
 * margins, annotation fonts). Do not strip those fields or invent
 * vendor-neutral geometry types.
 */

import type { CalculationSource } from "../catalog/calculationMetadata";

export type PlotColorScale = Array<[number, string]>;

export interface PlotLine {
  color?: string;
  width?: number;
  dash?: "solid" | "dot" | "dash" | "longdash" | "dashdot" | "longdashdot";
}

export interface PlotMarker {
  color?: string;
  size?: number;
  line?: PlotLine;
}

export type PlotHoverInfo = "all" | "skip";
export type PlotHoverValue = string | number;
export type PlotHoverRow = PlotHoverValue[];
export type PlotHoverCell = PlotHoverValue | PlotHoverRow;

export interface PlotLevelContours {
  type?: "levels";
  operation?: never;
  value?: never;
  coloring?: "fill" | "none" | "heatmap";
  showlines?: boolean;
  start?: number;
  end?: number;
  size?: number;
  smoothing?: number;
  line?: PlotLine;
}

export type PlotConstraintOperation = ">=" | "<" | "][" | "=";

export interface PlotConstraintContours {
  type: "constraint";
  operation: PlotConstraintOperation;
  value: number | [number, number];
  coloring?: "none";
  showlines?: boolean;
  line?: PlotLine;
}

export type PlotContours =
  | PlotLevelContours
  | PlotConstraintContours;

interface PlotTraceBase {
  name: string;
  x: number[];
  y: number[];
  showlegend?: boolean;
  visible?: true | "legendonly";
  opacity?: number;
  hoverinfo?: PlotHoverInfo;
  hovertemplate?: string;
  yaxis?: "y" | "y2";
  /** When true, this trace represents a colored background region. */
  isBackgroundZone?: boolean;
}

export interface PlotScatterMarkerTrace extends PlotTraceBase {
  type: "scatter";
  mode: "markers";
  line?: PlotLine;
  marker: PlotMarker;
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
  hoverMetadata?: PlotHoverRow;
}

export interface PlotScatterLineTrace extends PlotTraceBase {
  type: "scatter";
  mode: "lines";
  text?: string[];
  fill?: "toself";
  fillcolor?: string;
  line?: PlotLine;
  marker?: PlotMarker;
  z?: never;
  colorscale?: never;
  contours?: never;
  zmin?: never;
  zmax?: never;
  showscale?: never;
  hoverongaps?: never;
  hoverMetadata?: PlotHoverRow[];
}

export interface PlotContourTrace extends PlotTraceBase {
  type: "contour";
  mode?: never;
  marker?: never;
  fill?: never;
  z: number[][];
  text?: string[][];
  colorscale?: PlotColorScale;
  fillcolor?: string;
  contours: PlotContours;
  zmin?: number;
  zmax?: number;
  showscale?: boolean;
  line?: PlotLine;
  hoverongaps?: boolean;
  hoverMetadata?: PlotHoverCell[][];
}

export type PlotTrace =
  | PlotScatterMarkerTrace
  | PlotScatterLineTrace
  | PlotContourTrace;

export interface PlotFont {
  size: number;
  color: string;
}

export interface PlotAnnotation {
  x: number;
  y: number;
  text: string;
  showarrow: false;
  font: PlotFont;
}

export interface PlotMargin {
  l: number;
  r: number;
  t: number;
  b: number;
}

export interface PlotAxis {
  title: string;
  range: [number, number];
  gridcolor?: string;
  showgrid?: boolean;
  zeroline?: boolean;
  showticklabels?: boolean;
  side?: "left" | "right";
  overlaying?: "y";
}

export interface PlotLegend {
  orientation?: "h" | "v";
  x?: number;
  y?: number;
}

export interface PlotLayout {
  title: string;
  paper_bgcolor: string;
  plot_bgcolor: string;
  showlegend: boolean;
  margin: PlotMargin;
  xaxis: PlotAxis;
  yaxis: PlotAxis;
  yaxis2?: PlotAxis;
  legend?: PlotLegend;
  height?: number;
}

export interface PlotlyChartSpec {
  traces: PlotTrace[];
  layout: PlotLayout;
  annotations: PlotAnnotation[];
  source: CalculationSource;
}
