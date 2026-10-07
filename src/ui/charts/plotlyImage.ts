/**
 * The chart adapter's Image (ADR-0002 decision 64, rules 1 and 5): one Plotly
 * figure built for the file from an {@link ImageDescription}, never the plot
 * on screen, and handed to the browser as a download. Its traces are the
 * screen's conversion's (`plotlyFigure.ts`), the hover grid left out and one
 * added per legend entry. Its numbers were measured on
 * plotly.js 4.0.0 (`.scratch/image-export/` ticket 01): an upgrade measures
 * them again.
 */
import type { PlotlyData, PlotlyLayout } from "plotly.js-cartesian-dist-min";
import { chartInk } from "$lib/core/bandPalette";
import type { AxisSpec, LegendEntry } from "$lib/core/charts/chartSpec";
import { imageFormat, type ImageDescription, type ImageFormat } from "$lib/core/image";
import { toPlotlyAnnotation, toPlotlyAxis, toPlotlyData } from "./plotlyFigure";

type Plotly = typeof import("plotly.js-cartesian-dist-min").default;

/** Plotly's px is the CSS px, 1/96 in, so a figure's px are printed sizes. */
const PX_PER_MM = 96 / 25.4;
const PX_PER_PT = 96 / 72;
/** A PNG's pixels per CSS px: 600 dpi over the CSS px's 96. */
const PNG_PIXELS_PER_PX = 600 / 96;

/** Every text of the figure but the title: 8 pt at the printed width, at both sizes. */
const LETTERING = { family: "Arial, Helvetica, sans-serif", size: 8 * PX_PER_PT };
/** The title's: 10 pt. */
const TITLE_LETTERING = { ...LETTERING, size: 10 * PX_PER_PT };

/**
 * Around the plot, in px: the y axis's widest ticks and its title on the left,
 * half of the x axis's last tick on the right, and from the plot's bottom edge
 * to the legend's top, the x axis's ticks and title.
 */
const MARGIN = { left: 52, right: 12, top: 8, legend: 40 };
/** The title's line, in px, between the top margin and the plot; none without a title. */
const TITLE_BLOCK = 22;
/** Plotly's line height over its lettering, and an annotation's padding inside its box, in px: its defaults. */
const PLOTLY_LINE_SPACING = 1.3;
const PLOTLY_ANNOTATION_PADDING = 1;
/** From the axis line to its title, in px, so the title stays inside {@link MARGIN}. */
const AXIS_TITLE_STANDOFF = 4;
/** Under the legend, to the file's bottom edge, in px. */
const BOTTOM_GAP = 6;
/** The plot area's height over its width. */
const PLOT_ASPECT = 3 / 4;
/**
 * Higher than any legend, in px. Plotly's default is half the figure's
 * height, past which the legend scrolls and the file loses entries.
 */
const LEGEND_MAX_HEIGHT = 100_000;
const LEGEND_LINE_WIDTH = 2;
const LEGEND_MARKER_SIZE = 8;
/** The file's ground, where the page shows the chart over its own. */
const PAPER = "#ffffff";

/**
 * Download `image` as `format`, named `fileName`. Plotly lays the legend out
 * by its labels, which nothing knows the width of before drawing, so the
 * figure is drawn once out of sight, its legend's height read, and the file's
 * height set from it. Rejects if the image could not be made.
 */
export async function downloadImage(image: ImageDescription, format: ImageFormat, fileName: string): Promise<void> {
  const { default: plotly } = await import("plotly.js-cartesian-dist-min");
  const legendHeight = image.chart.legend.length === 0 ? 0 : await measureLegendHeight(plotly, figureOf(image, 0));
  const figure = figureOf(image, legendHeight);
  const { width, height } = figure.layout;
  const plotlyFormat = format === imageFormat.svg ? "svg" : "png";
  const url = await plotly.toImage(figure, {
    format: plotlyFormat,
    width,
    height,
    // A whole number of pixels: the canvas truncates 2125.98 to 2125.
    scale: plotlyFormat === "svg" ? 1 : Math.round(width * PNG_PIXELS_PER_PX) / width,
  });
  await save(url, fileName);
}

/**
 * The figure of `image`, its legend `legendHeight` px high: the title, if
 * any, then the plot at its declared ranges, the legend under it, the file as
 * tall as they need.
 */
function figureOf(image: ImageDescription, legendHeight: number) {
  const { chart, title } = image;
  const width = image.size.widthMm * PX_PER_MM;
  const plotTop = MARGIN.top + (title === null ? 0 : TITLE_BLOCK);
  const plotHeight = (width - MARGIN.left - MARGIN.right) * PLOT_ASPECT;
  const legendTop = plotTop + plotHeight + MARGIN.legend;
  const height = legendTop + legendHeight + BOTTOM_GAP;
  // The hover grid is left out: nobody points at a file, and an SVG would
  // carry it as a bitmap.
  const drawn = toPlotlyData({ ...chart, traces: chart.traces.filter((trace) => trace.kind !== "hoverGrid") });
  const data: PlotlyData[] = [...drawn, ...chart.legend.map(legendTraceOf)];
  const layout = {
    width,
    height,
    margin: { l: MARGIN.left, r: MARGIN.right, t: plotTop, b: height - plotTop - plotHeight, pad: 0, autoexpand: false },
    font: LETTERING,
    paper_bgcolor: PAPER,
    plot_bgcolor: chartInk.ground,
    hovermode: false,
    showlegend: true,
    legend: {
      orientation: "h",
      xref: "paper",
      x: 0,
      xanchor: "left",
      yref: "container",
      y: 1 - legendTop / height,
      yanchor: "top",
      maxheight: LEGEND_MAX_HEIGHT,
    },
    annotations: [
      ...chart.annotations.map((entry) => {
        const annotation = toPlotlyAnnotation(entry);
        return { ...annotation, font: { ...annotation.font, size: LETTERING.size } };
      }),
      ...(title === null ? [] : [titleAnnotationOf(title)]),
    ],
    xaxis: fileAxisOf(chart.layout.x),
    yaxis: fileAxisOf(chart.layout.y),
  } satisfies PlotlyLayout;
  return { data, layout };
}

/** The title, on the plot's left edge, its box's top at the top margin. */
function titleAnnotationOf(title: string) {
  return {
    text: title,
    xref: "paper",
    yref: "paper",
    x: 0,
    y: 1,
    xanchor: "left",
    yanchor: "bottom",
    yshift: TITLE_BLOCK - TITLE_LETTERING.size * PLOTLY_LINE_SPACING - PLOTLY_ANNOTATION_PADDING,
    showarrow: false,
    align: "left",
    font: TITLE_LETTERING,
  } as const;
}

/**
 * The screen's axis, its title held inside the margin rather than pushing the
 * plot, and lettered as the rest: Plotly sets a title 1.2 times the figure's font.
 */
function fileAxisOf(axisSpec: AxisSpec) {
  const axis = toPlotlyAxis(axisSpec);
  return {
    ...axis,
    automargin: false,
    title: { ...axis.title, standoff: AXIS_TITLE_STANDOFF, font: { size: LETTERING.size } },
  };
}

/**
 * One legend entry: a trace that draws nothing and shows in Plotly's legend
 * in the entry's swatch and colour. An empty `x` would show no entry at all.
 */
function legendTraceOf(entry: LegendEntry): PlotlyData {
  const nothing = { type: "scatter", x: [null], y: [null], name: entry.label, showlegend: true, hoverinfo: "skip" };
  switch (entry.swatch) {
    case "fill":
      return { ...nothing, mode: "none", fill: "toself", fillcolor: entry.color };
    case "line":
      return { ...nothing, mode: "lines", line: { color: entry.color, width: LEGEND_LINE_WIDTH } };
    case "marker":
      return { ...nothing, mode: "markers", marker: { color: entry.color, size: LEGEND_MARKER_SIZE } };
  }
}

/** The height in px Plotly draws `figure`'s legend at, read off a drawing out of sight. */
async function measureLegendHeight(plotly: Plotly, figure: ReturnType<typeof figureOf>): Promise<number> {
  const node = document.createElement("div");
  node.style.position = "absolute";
  node.style.left = "-10000px";
  node.style.top = "0";
  document.body.append(node);
  try {
    await plotly.newPlot(node, figure.data, figure.layout, { staticPlot: true });
    const box = node.querySelector<SVGRectElement>("g.legend > rect.bg");
    if (box === null) {
      throw new Error("Plotly drew no legend to measure");
    }
    return box.getBBox().height;
  } finally {
    plotly.purge(node);
    node.remove();
  }
}

/** Hand `url`'s file to the browser as a download named `fileName`. */
async function save(url: string, fileName: string): Promise<void> {
  const blob = await (await fetch(url)).blob();
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}
