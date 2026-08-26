import { inputChartStyleById, inputDisplayMetaById } from "../../../models/inputSlotPresentation";
import type { InputId as InputIdType } from "../../../models/inputSlots";
import type {
  PlotAnnotation,
  PlotColorScale,
  PlotContourTrace,
  PlotContours,
  PlotHoverCell,
  PlotHoverInfo,
  PlotHoverRow,
  PlotLine,
  PlotScatterLineTrace,
  PlotScatterMarkerTrace,
} from "../../plotlyTypes";

export function buildHoverTemplate(
  rows: readonly (string | null | undefined)[],
): string {
  return rows.filter((row): row is string => row != null).join("<br>")
    + "<extra></extra>";
}

export interface InputScatterTraceOptions {
  inputId: InputIdType;
  x: number;
  y: number;
  showLegend: boolean;
  hovertemplate: string;
  markerSize?: number;
  color?: string;
  hoverMetadata?: PlotHoverRow;
  hoverinfo?: PlotHoverInfo;
}

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
}: InputScatterTraceOptions): PlotScatterMarkerTrace {
  const inputStyle = inputChartStyleById[inputId];
  const inputLabel = inputDisplayMetaById[inputId].label;
  const markerColor = color ?? inputStyle.marker;

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

export interface ComfortPolygonTraceOptions {
  inputId: InputIdType;
  nameSuffix: string;
  polygonX: number[];
  polygonY: number[];
  hovertemplate: string;
  isBackgroundZone?: boolean;
  hoverMetadata?: PlotHoverRow[];
  hoverinfo?: PlotHoverInfo;
}

export function buildComfortPolygonTrace({
  inputId,
  nameSuffix,
  polygonX,
  polygonY,
  hovertemplate,
  isBackgroundZone,
  hoverMetadata,
  hoverinfo,
}: ComfortPolygonTraceOptions): PlotScatterLineTrace {
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
    isBackgroundZone,
    hoverMetadata,
    hoverinfo,
  };
}

export interface LineTraceOptions {
  name: string;
  x: number[];
  y: number[];
  color: string;
  hovertemplate?: string;
  text?: string[];
  hoverMetadata?: PlotHoverRow[];
  hoverinfo?: PlotHoverInfo;
  showlegend?: boolean;
  visible?: true | "legendonly";
  lineWidth?: number;
  dash?: PlotLine["dash"];
}

export function buildLineTrace({
  name,
  x,
  y,
  color,
  hovertemplate,
  text,
  hoverMetadata,
  hoverinfo,
  showlegend = false,
  visible,
  lineWidth = 1.2,
  dash,
}: LineTraceOptions): PlotScatterLineTrace {
  return {
    type: "scatter",
    mode: "lines",
    name,
    x,
    y,
    showlegend,
    visible,
    line: { color, width: lineWidth, dash },
    marker: {},
    hovertemplate,
    text,
    hoverMetadata,
    hoverinfo,
  };
}

export interface FilledPolygonTraceOptions {
  name: string;
  x: number[];
  y: number[];
  fillcolor: string;
  lineColor?: string;
  lineWidth?: number;
  opacity?: number;
  hoverinfo?: PlotHoverInfo;
  hovertemplate?: string;
  isBackgroundZone?: boolean;
}

export function buildFilledPolygonTrace({
  name,
  x,
  y,
  fillcolor,
  lineColor,
  lineWidth = 0.8,
  opacity,
  hoverinfo = "skip",
  hovertemplate,
  isBackgroundZone,
}: FilledPolygonTraceOptions): PlotScatterLineTrace {
  return {
    type: "scatter",
    mode: "lines",
    name,
    x,
    y,
    showlegend: false,
    fill: "toself",
    fillcolor,
    line: { color: lineColor ?? fillcolor, width: lineWidth },
    marker: {},
    opacity,
    hoverinfo,
    hovertemplate,
    isBackgroundZone,
  };
}

export interface TextAnnotationOptions {
  x: number;
  y: number;
  text: string;
  textSize?: number;
  color?: string;
}

export function buildTextAnnotation({
  x,
  y,
  text,
  textSize = 8,
  color = "#1f2937",
}: TextAnnotationOptions): PlotAnnotation {
  return {
    x,
    y,
    text,
    showarrow: false,
    font: { size: textSize, color },
  };
}

export interface ContourTraceOptions {
  name: string;
  x: number[];
  y: number[];
  z: number[][];
  text?: string[][];
  colorscale?: PlotColorScale;
  fillcolor?: string;
  contours: PlotContours;
  hovertemplate: string;
  showscale?: boolean;
  zmin?: number;
  zmax?: number;
  opacity?: number;
  line?: PlotLine;
  isBackgroundZone?: boolean;
  hoverinfo?: PlotHoverInfo;
  hoverOnGaps?: boolean;
  hoverMetadata?: PlotHoverCell[][];
}

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
  opacity,
  line,
  isBackgroundZone,
  hoverinfo,
  hoverOnGaps,
  hoverMetadata,
}: ContourTraceOptions): PlotContourTrace {
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
    opacity,
    line,
    hoverinfo: hoverinfo ?? "all",
    hoverongaps: hoverOnGaps,
    hovertemplate,
    isBackgroundZone,
    hoverMetadata,
  };
}
