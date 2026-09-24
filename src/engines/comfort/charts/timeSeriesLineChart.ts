import type { PlotScatterLineTrace } from "../../plotlyTypes";
import { plotlyHoverNumber } from "../../units";
import { buildLineTrace } from "./plotlyBuilders";

export interface TimeSeriesLineTraceOptions {
  name: string;
  x: number[];
  y: number[];
  color: string;
  unit: string;
  visible?: true | "legendonly";
  segmentNames?: string[];
  hoverInfo?: "all" | "skip";
  showLegend?: boolean;
  dash?: "solid" | "dot" | "dash";
  width?: number;
}

export function buildTimeSeriesLineTrace(
  options: TimeSeriesLineTraceOptions,
): PlotScatterLineTrace {
  return buildLineTrace({
    name: options.name,
    x: options.x,
    y: options.y,
    color: options.color,
    showlegend: options.showLegend ?? true,
    visible: options.visible,
    lineWidth: options.width ?? 2,
    dash: options.dash,
    hoverinfo: options.hoverInfo ?? "all",
    hovertemplate: options.hoverInfo === "skip"
      ? undefined
      : `%{customdata[0]}<br>Time: ${plotlyHoverNumber("x")} h<br>${options.name}: ${plotlyHoverNumber("y")} ${options.unit}<extra></extra>`,
    hoverMetadata: options.segmentNames?.map((name) => [name]),
  });
}

export function paddedSeriesRange(
  values: readonly number[],
  minimumPadding: number,
): [number, number] {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = Math.max(minimumPadding, (maximum - minimum) * 0.08);
  return [minimum - padding, maximum + padding];
}

export function crossesSeriesThreshold(
  before: number,
  after: number,
  threshold: number,
): boolean {
  return (before < threshold && after >= threshold)
    || (before >= threshold && after < threshold);
}
