import { ChartType } from "../catalog/chartTypes";

export type Axis = {
  title: string;
  range: [number, number];
  gridcolor?: string;
  showgrid?: boolean;
  zeroline?: boolean;
  showticklabels?: boolean;
  ticks?: "";
  dtick?: number;
  side?: "left" | "right";
  overlaying?: "y";
};

export type Point = {
  x: number;
  y: number;
  name: string;
  color: string;
  hovertemplate?: string;
  customdata?: unknown;
  showlegend?: boolean;
  hoverinfo?: "skip" | "all";
};

export type Polyline = {
  x: number[];
  y: number[];
  name?: string;
  color?: string;
  width?: number;
  dash?: "solid" | "dot" | "dash" | "longdash" | "dashdot" | "longdashdot";
  hovertemplate?: string;
  customdata?: unknown;
  text?: string[];
  showlegend?: boolean;
  visible?: true | "legendonly";
  hoverinfo?: "skip" | "all";
  yaxis?: "y" | "y2";
};

export type Polygon = {
  x: number[];
  y: number[];
  fillcolor: string;
  linecolor?: string;
  linewidth?: number;
  name?: string;
  opacity?: number;
  hoverinfo?: "skip" | "all";
  hovertemplate?: string;
  showlegend?: boolean;
};

export type GridContours = {
  type?: "levels" | "constraint";
  coloring?: "fill" | "none" | "heatmap";
  showlines?: boolean;
  start?: number;
  end?: number;
  size?: number;
  smoothing?: number;
  operation?: ">=" | "<" | "][" | "=";
  value?: number | [number, number];
  line?: { color?: string; width?: number };
};

export type Grid = {
  x: number[];
  y: number[];
  z: (number | null)[][];
  name?: string;
  colorscale?: Array<[number, string]>;
  fillcolor?: string;
  contours?: GridContours;
  hovertemplate?: string;
  customdata?: unknown;
  text?: string[][] | string[];
  opacity?: number;
  showscale?: boolean;
  hoverongaps?: boolean;
  hoverinfo?: "skip" | "all";
  zmin?: number;
  zmax?: number;
  isHoverLayer?: boolean;
  line?: { color?: string; width?: number };
};

export type Annotation = {
  x: number;
  y: number;
  text: string;
  showarrow?: false;
  font?: { size: number; color: string };
};

export type Legend = {
  orientation?: "h" | "v";
  x?: number;
  y?: number;
};

export type Frame = {
  title?: string;
  paperBgColor?: string;
  plotBgColor?: string;
  showlegend?: boolean;
  margin?: { l: number; r: number; t: number; b: number };
  height?: number;
  legend?: Legend;
  xAxis: Axis;
  yAxis: Axis;
  yAxis2?: Axis;
  annotations?: Annotation[];
};

export type PsychrometricInput = Frame & {
  fills?: Grid[];
  mask?: Polygon;
  curves: Polyline[];
  zones: Polygon[];
  points: Point[];
};

export type DynamicInput = Frame & {
  fills?: Grid[];
  zones?: Polygon[];
  points: Point[];
};

export type HeatLossInput = Frame & {
  series: Polyline[];
  bands?: Polygon[];
  points?: Point[];
};

export type SetInput = Frame & {
  series: Polyline[];
  bands?: Polygon[];
  points?: Point[];
};

export type AdaptiveInput = Frame & {
  fills?: Grid[];
  regions: Polygon[];
  points: Point[];
};

export type UtciInput = Frame & {
  fills: Grid[];
  points: Point[];
};

export type BodyTemperatureInput = Frame & {
  series: Polyline[];
  points?: Point[];
};

export type WaterLossInput = Frame & {
  series: Polyline[];
  points?: Point[];
};

export type ChartPayload =
  | { type: typeof ChartType.Psychrometric; input: PsychrometricInput }
  | { type: typeof ChartType.Dynamic; input: DynamicInput }
  | { type: typeof ChartType.HeatLoss; input: HeatLossInput }
  | { type: typeof ChartType.Set; input: SetInput }
  | { type: typeof ChartType.Adaptive; input: AdaptiveInput }
  | { type: typeof ChartType.Utci; input: UtciInput }
  | { type: typeof ChartType.BodyTemperature; input: BodyTemperatureInput }
  | { type: typeof ChartType.WaterLoss; input: WaterLossInput };

export type AssembleResult = {
  data: Record<string, unknown>[];
  layout: Record<string, unknown>;
};

export function chartPoints(payload: ChartPayload): readonly Point[] {
  const { input } = payload;
  if ("points" in input && Array.isArray(input.points) && input.points) {
    return input.points;
  }
  return [];
}
