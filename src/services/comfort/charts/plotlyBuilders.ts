/**
 * Plotly Trace Builders
 * 
 * Provides utility functions for constructing Plotly.js trace and 
 * annotation objects. Standardizes the creation of scatter, contour, and heatmap 
 * traces to ensure consistent styling and interaction across all comfort charts.
 */
import { inputChartStyleById, inputDisplayMetaById } from "../../../models/inputSlotPresentation";
import type { InputId as InputIdType } from "../../../models/inputSlots";
import type {
  PlotAnnotationDto,
  PlotColorScaleDto,
  PlotContoursDto,
  PlotLineDto,
  PlotTraceDto,
} from "../../../models/comfortDtos";

/**
 * Interface for building an input scatter trace.
 * @param inputId - The ID of the input.
 * @param x - The x-coordinate of the input.
 * @param y - The y-coordinate of the input.
 * @param showLegend - Whether to show the input in the legend.
 * @param hovertemplate - The tooltip text for the input.
 * @param markerSize - The size of the marker (optional).
 * @param color - The color of the marker (optional).
 */
export interface InputScatterTraceOptions {
  inputId: InputIdType;
  x: number;
  y: number;
  showLegend: boolean;
  hovertemplate: string;
  markerSize?: number;
  color?: string;
  hoverMetadata?: unknown[] | unknown[][];
  hoverinfo?: string;
}

/**
 * Builds a trace for plotting an input as a scatter marker on the chart.
 * Automatically injects the correct styling logic for the assigned `InputId`.
 * This is used to plot inputs on the chart for various thermal comfort models.
 *
 * @param options - The configuration object defining the marker location and metadata (e.g., `inputId`, `x`, `y`, etc.).
 * @returns A Scatter trace PlotTraceDto representing the input.
 */
export function buildInputScatterTrace({
  inputId,
  x,
  y,
  showLegend,
  hovertemplate,
  markerSize = 12,
  color,
  hoverMetadata,
  hoverinfo,
}: InputScatterTraceOptions): PlotTraceDto {
  // Get the style and label for the input.
  const inputStyle = inputChartStyleById[inputId];
  const inputLabel = inputDisplayMetaById[inputId].label;
  
  // Set the marker color, defaulting to the input's style color if not provided.
  const markerColor = color ?? inputStyle.marker;

  // Return a PlotTraceDto representing the input.
  return {
    type: "scatter",
    mode: "markers",
    name: inputLabel,
    x: [x],
    y: [y],
    showlegend: showLegend,
    line: {},
    marker: { color: markerColor, size: markerSize, line: { color: "#000000", width: 1.5 } },
    hovertemplate,
    hoverMetadata,
    hoverinfo,
  };
}

/**
 * Interface for building a comfort polygon trace.
 * @param inputId - The ID of the input.
 * @param nameSuffix - The suffix to append to the input name.
 * @param polygonX - The x-coordinates of the polygon.
 * @param polygonY - The y-coordinates of the polygon.
 * @param hovertemplate - The tooltip text for the polygon. 
 * @param isZone - When true, marks this trace as a zone overlay that can be hidden by the Zones toggle (optional).
 */
export interface ComfortPolygonTraceOptions {
  inputId: InputIdType;
  nameSuffix: string;
  polygonX: number[];
  polygonY: number[];
  hovertemplate: string;
  isZone?: boolean;
  isBackgroundZone?: boolean;
  isComfortZone?: boolean;
  hoverMetadata?: unknown[] | unknown[][];
  hoverinfo?: string;
}

/**
 * Builds a visual polygon trace representing an input's comfort bounds.
 * Automatically attaches the layout aesthetics correctly matched to the given `InputId`.
 * This is used to draw spatial comfort zones for various thermal comfort models.
 *
 * @param options configuration object defining the geometry and styling.
 * @returns A filled Scatter trace PlotTraceDto representing the comfort polygon.
 */
export function buildComfortPolygonTrace({
  inputId,
  nameSuffix,
  polygonX,
  polygonY,
  hovertemplate,
  isZone,
  isBackgroundZone,
  isComfortZone,
  hoverMetadata,
  hoverinfo,
}: ComfortPolygonTraceOptions): PlotTraceDto {
  const inputStyle = inputChartStyleById[inputId];
  const inputLabel = inputDisplayMetaById[inputId].label;

  return {
    type: "scatter",
    mode: "lines",
    name: `${inputLabel} ${nameSuffix}`,
    x: polygonX,
    y: polygonY,
    showlegend: false,
    fill: "toself",
    fillcolor: inputStyle.fill,
    line: { color: inputStyle.line, width: 1.5 },
    marker: {},
    hovertemplate,
    isZone,
    isBackgroundZone,
    isComfortZone,
    hoverMetadata,
    hoverinfo,
  };
}

/**
 * Interface for building a line trace (a single line on a chart).
 * @param name - The name of the line.
 * @param x - The x-coordinates of the line.
 * @param y - The y-coordinates of the line.
 * @param color - The color of the line.
 * @param hovertemplate - The tooltip text for the line.
 */
export interface LineTraceOptions {
  name: string;
  x: number[];
  y: number[];
  color: string;
  hovertemplate: string;
  text?: string[];
  hoverMetadata?: unknown[] | unknown[][];
  hoverinfo?: string;
}

/**
 * Builds a generic line trace.
 * A generic helper for plotting simple line boundaries, such as relative humidity curves.
 * Typically used to plot baseline curves representing 10% step increments over psychrometric limits.
 *
 * @param options configuration object defining the line series.
 * @returns A line mode Scatter trace PlotTraceDto.
 */
export function buildLineTrace({
  name,
  x,
  y,
  color,
  hovertemplate,
  text,
  hoverMetadata,
  hoverinfo,
}: LineTraceOptions): PlotTraceDto {
  return {
    type: "scatter",
    mode: "lines",
    name,
    x,
    y,
    showlegend: false,
    line: { color, width: 1.2 },
    marker: {},
    hovertemplate,
    text,
    hoverMetadata,
    hoverinfo,
  };
}

// Text Annotation Builder

/**
 * Interface for building a text annotation.
 * @param x - The x-coordinate of the annotation.
 * @param y - The y-coordinate of the annotation.
 * @param text - The text of the annotation.
 * @param textSize - The size of the text (optional).
 * @param color - The color of the text (optional).
 */
export interface TextAnnotationOptions {
  x: number;
  y: number;
  text: string;
  textSize?: number;
  color?: string;
}

/**
 * Builds a generic text annotation without a particular Input styling.
 * Useful for marking universal axes points, thresholds, etc.
 * It is used by charts to append standard global label overlays (e.g., "no thermal stress") onto specific positions on the chart.
 *
 * @param options configuration object defining the text placement.
 * @returns The formed PlotAnnotationDto.
 */
export function buildTextAnnotation({
  x,
  y,
  text,
  textSize = 8,
  color = "#1f2937",
}: TextAnnotationOptions): PlotAnnotationDto {
  return {
    x,
    y,
    text,
    showarrow: false,
    font: { size: textSize, color },
  };
}

// Contour Trace Builder

/**
 * Interface for building a contour trace. Used to overlay 2d iso-lines across the psychrometric chart.
 * For example, in the PMV chart, this can be used to overlay PMV values across the chart.
 * @param name - The name of the trace.
 * @param x - The x-coordinates of the contour.
 * @param y - The y-coordinates of the contour.
 * @param z - The z-coordinates of the contour.
 * @param text - The text labels for the contour (optional).
 * @param colorscale - The colorscale to use for the contour.
 * @param contours - The contour settings.
 * @param hovertemplate - The tooltip text for the contour.
 * @param showscale - Whether to show a color scale (optional).
 * @param zmin - The minimum value for the z-coordinates (optional).
 * @param zmax - The maximum value for the z-coordinates (optional).
 * @param colorbar - The colorbar settings (optional).
 * @param opacity - The opacity of the contour (optional).
 * @param isZone - Whether this trace is a zone overlay that can be hidden by the Zones toggle (optional).
 */
export interface ContourTraceOptions {
  name: string;
  x: number[];
  y: number[];
  z: number[][];
  text?: string[][];
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
  hoverMetadata?: unknown[] | unknown[][];
}

/**
 * Builds a contour trace to visualize multi-zone comfort boundaries.
 *
 * @param options configuration object defining the contour ranges and styling.
 * @returns A PlotTraceDto for the contour plot.
 */
export function buildContourTrace({
  name,
  x,
  y,
  z,
  text,
  colorscale,
  fillcolor,
  contours,
  hovertemplate,
  showscale = false,
  zmin,
  zmax,
  colorbar,
  opacity,
  line,
  isZone,
  isBackgroundZone,
  isComfortZone,
  hoverinfo,
  hoverOnGaps,
  hoverMetadata,
}: ContourTraceOptions): PlotTraceDto {
  return {
    type: "contour",
    name,
    x,
    y,
    z,
    text,
    colorscale,
    fillcolor,
    contours,
    showscale,
    zmin,
    zmax,
    colorbar,
    opacity,
    line,
    hoverinfo: hoverinfo ?? "all",
    hoverongaps: hoverOnGaps,
    hovertemplate,
    isZone,
    isBackgroundZone,
    isComfortZone,
    hoverMetadata,
  };
}
