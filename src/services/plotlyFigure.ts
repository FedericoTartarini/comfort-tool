import type {
  PlotAnnotation,
  PlotAxis,
  PlotColorScale,
  PlotContours,
  PlotLayout,
  PlotLegend,
  PlotlyChartSpec,
  PlotTrace,
} from "./plotlyTypes";
import { remapZoneFill } from "../models/zoneTokens";
import {
  CHART_LAYOUT_DPI,
  ChartThemeKind,
  publicationLayoutSizePx,
  publicationLegendStyle,
  ptToPx,
  screenChartTheme,
  type ChartTheme,
  type PublicationChartTheme,
} from "./chartTheme";

type PlotlyAxisTitle = string | { text: string; standoff?: number };

export type PlotlyFigureAxis = Omit<PlotAxis, "title"> & {
  title?: PlotlyAxisTitle;
};

export type PlotlyFigureTitle =
  | string
  | {
      text: string;
      font?: {
        family?: string;
        size?: number;
      };
    };

export interface PlotlyFigureLegend {
  orientation?: "h" | "v";
  x?: number;
  y?: number;
  font?: {
    family?: string;
    size?: number;
  };
  itemsizing?: "trace" | "constant";
  itemwidth?: number;
  tracegroupgap?: number;
}

export type PlotlyFigureLayout = Omit<
  PlotLayout,
  "title" | "xaxis" | "yaxis" | "yaxis2" | "legend"
> & {
  title?: PlotlyFigureTitle;
  xaxis: PlotlyFigureAxis;
  yaxis: PlotlyFigureAxis;
  yaxis2?: PlotlyFigureAxis;
  annotations: PlotAnnotation[];
  legend?: PlotlyFigureLegend;
  width?: number;
  font?: {
    family?: string;
    size?: number;
  };
  autosize?: boolean;
};

export interface PlotlyFigureConfig {
  responsive: boolean;
  displaylogo: false;
  displayModeBar: false | "hover";
}

export interface PlotlyFigure {
  data: Array<Record<string, unknown>>;
  layout: PlotlyFigureLayout;
  config: PlotlyFigureConfig;
}

export interface PlotlyFigureOptions {
  theme?: ChartTheme;
  showPlotTitle?: boolean;
}

type PlotlyGapNumber = number | null;

/**
 * Plotly adapter (Plan 0g clone boundary, Plan 0h screen/publication theme).
 *
 * `Plotly.react` aliases `x` / `y` / `z` / `text` as calcdata identity. Each
 * call must receive fresh arrays or a later react skips recalc and then reads
 * `undefined.z`. Clone those series and the nested records Plotly mutates
 * (traces, layout, axes, margin, legend, annotations, marker/line/contours).
 * Hover `customdata` is shared.
 *
 * Non-finite grid `z` cells (NaN / ±Infinity) become `null` Plotly gaps. Do
 * not `JSON.parse(JSON.stringify(figure))`. Publication export builds a
 * separate figure from `chartTheme` (mm/pt/dpi, single/double column, no
 * mode bar). Zone fills remap through the token table in `zoneTokens.ts`.
 */
export function toPlotlyFigure(
  chart: PlotlyChartSpec,
  options: PlotlyFigureOptions = {},
): PlotlyFigure {
  const theme = options.theme ?? screenChartTheme;
  return {
    data: chart.traces.map((trace) => toPlotlyTrace(trace, theme)),
    layout: toPlotlyLayout(chart, theme, options.showPlotTitle !== false),
    config: {
      responsive: theme.responsive,
      displaylogo: theme.displaylogo,
      displayModeBar: theme.displayModeBar,
    },
  };
}

function toPlotlyTrace(
  trace: PlotTrace,
  theme: ChartTheme,
): Record<string, unknown> {
  const { hoverMetadata, isBackgroundZone: _isBackgroundZone, ...rest } = trace;
  const plotlyTrace: Record<string, unknown> = { ...rest };
  const zonePalette = theme.zonePalette;

  if (hoverMetadata !== undefined) {
    plotlyTrace.customdata = hoverMetadata;
  }

  if (Array.isArray(rest.x)) {
    plotlyTrace.x = rest.x.slice();
  }

  if (Array.isArray(rest.y)) {
    plotlyTrace.y = rest.y.slice();
  }

  if (Array.isArray(rest.z)) {
    plotlyTrace.z = toPlotlyZGaps(rest.z);
  }

  if (Array.isArray(rest.text)) {
    plotlyTrace.text = clonePlotlyText(rest.text);
  }

  if (Array.isArray(rest.colorscale)) {
    plotlyTrace.colorscale = cloneColorScale(rest.colorscale).map(
      ([stop, color]) => [stop, remapZoneFill(color, zonePalette)],
    );
  }

  if (typeof rest.fillcolor === "string") {
    plotlyTrace.fillcolor = remapZoneFill(rest.fillcolor, zonePalette);
  }

  if (rest.marker) {
    plotlyTrace.marker = {
      ...rest.marker,
      ...(rest.marker.line ? { line: { ...rest.marker.line } } : {}),
    };
  }

  if (rest.line) {
    plotlyTrace.line = { ...rest.line };
  }

  if (rest.contours) {
    plotlyTrace.contours = cloneContours(rest.contours);
  }

  return plotlyTrace;
}

function axisTitleStandoffPx(theme: ChartTheme): number {
  if (theme.kind === ChartThemeKind.Publication) {
    return ptToPx(theme.axisTitleStandoffPt, CHART_LAYOUT_DPI);
  }
  return theme.axisTitleStandoffPx;
}

function toPlotlyLayout(
  chart: PlotlyChartSpec,
  theme: ChartTheme,
  showPlotTitle: boolean,
): PlotlyFigureLayout {
  const standoff = axisTitleStandoffPx(theme);
  const xaxis: PlotlyFigureAxis = cloneAxis(chart.layout.xaxis);
  const yaxis: PlotlyFigureAxis = cloneAxis(chart.layout.yaxis);
  const yaxis2 = chart.layout.yaxis2
    ? cloneAxis(chart.layout.yaxis2)
    : undefined;

  if (typeof xaxis.title === "string") {
    xaxis.title = { text: xaxis.title, standoff };
  }

  if (typeof yaxis.title === "string") {
    yaxis.title = { text: yaxis.title, standoff };
  }

  if (yaxis2 && typeof yaxis2.title === "string") {
    yaxis2.title = { text: yaxis2.title, standoff };
  }

  const layout: PlotlyFigureLayout = {
    ...chart.layout,
    title: chart.layout.title
      ? { text: chart.layout.title }
      : chart.layout.title,
    xaxis,
    yaxis,
    ...(yaxis2 ? { yaxis2 } : {}),
    margin: { ...chart.layout.margin },
    annotations: chart.annotations.map(cloneAnnotation),
    ...(chart.layout.legend
      ? { legend: cloneLegend(chart.layout.legend) }
      : {}),
  };

  if (theme.kind === ChartThemeKind.Publication) {
    applyPublicationLayout(layout, theme, chart.layout.showlegend);
  }

  if (!showPlotTitle) {
    layout.title = undefined;
    if (typeof layout.margin.t === "number") {
      layout.margin.t = Math.max(24, layout.margin.t - 24);
    }
  }

  return layout;
}

function applyPublicationLayout(
  layout: PlotlyFigureLayout,
  theme: PublicationChartTheme,
  showlegend: boolean,
): void {
  const { width, height } = publicationLayoutSizePx(theme);
  const fontSize = ptToPx(theme.fontPt, CHART_LAYOUT_DPI);
  const titleFontSize = ptToPx(theme.titleFontPt, CHART_LAYOUT_DPI);
  layout.width = width;
  layout.height = height;
  layout.autosize = false;
  layout.font = {
    family: theme.fontFamily,
    size: fontSize,
  };
  if (layout.title && typeof layout.title === "object") {
    layout.title = {
      ...layout.title,
      font: { family: theme.fontFamily, size: titleFontSize },
    };
  }

  if (!showlegend) {
    return;
  }

  const legendStyle = publicationLegendStyle(theme);
  layout.legend = {
    ...(layout.legend ?? { orientation: "h", x: 0, y: -0.18 }),
    font: {
      family: legendStyle.fontFamily,
      size: legendStyle.fontSizePx,
    },
    itemsizing: legendStyle.itemsizing,
    itemwidth: legendStyle.itemwidth,
    tracegroupgap: legendStyle.tracegroupgap,
  };

  const legendY = layout.legend.y ?? 0;
  if (legendY < 0) {
    layout.margin.b = Math.max(layout.margin.b, legendStyle.extraMarginPx + 48);
  } else if (legendY > 1) {
    layout.margin.t = Math.max(layout.margin.t, legendStyle.extraMarginPx + 32);
  }
}

function cloneLegend(legend: PlotLegend): PlotlyFigureLegend {
  return { ...legend };
}

function cloneAxis(axis: PlotAxis): PlotlyFigureAxis {
  return {
    ...axis,
    range: [axis.range[0], axis.range[1]],
  };
}

function cloneAnnotation(annotation: PlotAnnotation): PlotAnnotation {
  return {
    ...annotation,
    font: { ...annotation.font },
  };
}

function cloneContours(contours: PlotContours): PlotContours {
  if (contours.type === "constraint") {
    const value: number | [number, number] = Array.isArray(contours.value)
      ? [contours.value[0], contours.value[1]]
      : contours.value;
    return {
      ...contours,
      value,
      ...(contours.line ? { line: { ...contours.line } } : {}),
    };
  }

  return {
    ...contours,
    ...(contours.line ? { line: { ...contours.line } } : {}),
  };
}

function cloneColorScale(colorscale: PlotColorScale): PlotColorScale {
  return colorscale.map((stop) => [stop[0], stop[1]]);
}

function clonePlotlyText(
  text: ReadonlyArray<string> | ReadonlyArray<ReadonlyArray<string>>,
): string[] | string[][] {
  if (text.length > 0 && Array.isArray(text[0])) {
    return (text as ReadonlyArray<ReadonlyArray<string>>).map((row) =>
      row.slice(),
    );
  }

  return (text as ReadonlyArray<string>).slice();
}

function toPlotlyZGaps(
  z: ReadonlyArray<number> | ReadonlyArray<ReadonlyArray<number>>,
): Array<PlotlyGapNumber> | Array<Array<PlotlyGapNumber>> {
  if (z.length > 0 && Array.isArray(z[0])) {
    return (z as ReadonlyArray<ReadonlyArray<number>>).map(toPlotlyNumericGaps);
  }

  return toPlotlyNumericGaps(z as ReadonlyArray<number>);
}

function toPlotlyNumericGaps(
  values: ReadonlyArray<number>,
): Array<PlotlyGapNumber> {
  return values.map((value) => (Number.isFinite(value) ? value : null));
}
