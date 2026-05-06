/**
 * Plotly Trace Builders
 * 
 * Provides utility functions for constructing Plotly.js trace and 
 * annotation objects. Standardizes the creation of scatter, contour, and heatmap 
 * traces to ensure consistent styling and interaction across all comfort charts.
 */
import { inputChartStyleById, inputDisplayMetaById } from "../../../models/inputSlotPresentation";
import type { InputId as InputIdType } from "../../../models/inputSlots";
import type { PlotAnnotationDto, PlotTraceDto } from "../../../models/comfortDtos";

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
  };
}

/**
 * Interface for building an input annotation (tooltip near an input dot).
 * @param inputId - The ID of the input.
 * @param x - The x-coordinate of the annotation.
 * @param y - The y-coordinate of the annotation.
 * @param text - The text of the annotation.
 * @param showArrow - Whether to show an arrow pointing to the input.
 * @param textSize - The size of the text (optional).
 */
export interface InputAnnotationOptions {
  inputId: InputIdType;
  x: number;
  y: number;
  text: string;
  showArrow: boolean;
  textSize?: number;
}

/**
 * Builds an annotation marker placed near an input dot to describe it, styled sequentially.
 * This serves as the universal annotation label connector in all models, binding the provided text to the input data point.
 *
 * @param options configuration object defining the annotation geometry and text.
 * @returns A generic PlotAnnotationDto.
 */
export function buildInputAnnotation({
  inputId,
  x,
  y,
  text,
  showArrow,
  textSize = 11,
}: InputAnnotationOptions): PlotAnnotationDto {
  const inputStyle = inputChartStyleById[inputId];

  return {
    x,
    y,
    text,
    showarrow: showArrow,
    font: { size: textSize, color: inputStyle.line },
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

// Rectangle Selection Shape Builder

/**
 * Interface for building a rectangle selection shape.
 * @param xStart - The starting x-coordinate of the rectangle.
 * @param xEnd - The ending x-coordinate of the rectangle.
 * @param yStart - The starting y-coordinate of the rectangle.
 * @param yEnd - The ending y-coordinate of the rectangle.
 * @param fillColor - The color used to fill the rectangle.
 * @param opacity - The opacity of the rectangle.
 * @param xref - The reference frame for the x-coordinates (optional).
 * @param yref - The reference frame for the y-coordinates (optional).
 */
export interface RectangleSelectionShapeOptions {
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
  fillColor: string;
  opacity: number;
  xref?: "x" | "paper";
  yref?: "y" | "paper";
}

/**
 * Assembles a background boundary layer shape object, normally applied
 * to mark thresholds (e.g. UTCI Stress Band horizontal strips).
 * This tool is necessary for `utciCharts.ts`, as it allows for the declarative
 * plotting of fixed threshold rectangles on the chart background.
 *
 * @param options configuration object defining the rectangle geometry and reference frame.
 * @returns Assembled shape definitions ready to pass into the Plotly layout config.
 */
export function buildRectangleSelectionShape({
  xStart,
  xEnd,
  yStart,
  yEnd,
  fillColor,
  opacity,
  xref = "x",
  yref = "paper",
}: RectangleSelectionShapeOptions) {
  return {
    type: "rect" as const,
    xref,
    yref,
    x0: xStart,
    x1: xEnd,
    y0: yStart,
    y1: yEnd,
    fillcolor: fillColor,
    line: { width: 0 },
    opacity,
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
  colorscale: any[];
  contours: any;
  hovertemplate: string;
  showscale?: boolean;
  zmin?: number;
  zmax?: number;
  colorbar?: any;
  opacity?: number;
  isZone?: boolean;
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
  contours,
  hovertemplate,
  showscale = false,
  zmin,
  zmax,
  colorbar,
  opacity,
  isZone,
}: ContourTraceOptions): PlotTraceDto {
  return {
    type: "contour",
    name,
    x,
    y,
    z,
    text,
    colorscale,
    contours,
    showscale,
    zmin,
    zmax,
    colorbar,
    opacity,
    hoverinfo: "all",
    hovertemplate,
    isZone,
  };
}
