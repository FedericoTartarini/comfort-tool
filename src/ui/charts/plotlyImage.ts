/**
 * The chart adapter's Image (ADR-0002 decision 64, rules 1 and 5): one Plotly
 * figure built for the file from an {@link ImageDescription}, never the plot
 * on screen, and handed to the browser as a download. It reads, from the top,
 * the title, the legend, the chart, then the Input summary and the footer, its
 * plot area at its size's ratio (decision 89, rules 3 and 5). Its traces are
 * the screen's conversion's (`plotlyFigure.ts`), the hover grid left out and
 * one added per legend item. Its numbers were measured on plotly.js 4.0.0
 * (`.scratch/image-export/` ticket 01, `.scratch/frontend-review-round-2/`
 * tickets 06 and 07): an upgrade measures them again.
 */
import type { PlotlyData, PlotlyLayout } from "plotly.js-cartesian-dist-min";
import { chartInk } from "$lib/core/bandPalette";
import type { LegendItem } from "$lib/core/charts/chartSpec";
import { imageFormat, type ImageDescription, type ImageFormat } from "$lib/core/image";
import { sideMarginsOf, toPlotlyAnnotation, TRANSPARENT, toPlotlyAxis, toPlotlyData, toPlotlyYAxis } from "./plotlyFigure";

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
 * Around the plot, in px: the y axis's widest ticks and its title on its side,
 * half of the x axis's end tick on the other, the file's top over the title,
 * and under the plot's bottom edge the x axis's ticks and title, which ends
 * 29 px under it. On the right, the humidity ratio's title ends 24 px inside
 * the file's edge, and the first x tick starts 6 px inside on the left
 * (`.scratch/frontend-review-round-2/` tickets 06 and 07 Comments).
 */
const MARGIN = { axisRoom: 52, halfTick: 12, top: 8, xAxis: 30 };
/** The title's line, in px, under the top margin; none without a title. */
const TITLE_BLOCK = 22;
/**
 * Plotly's legend box pads its rows: its first row's text starts 8.7 px under
 * its top, its last row's ends 8.2 px over its bottom. The box stands this
 * many px up into the room above it, so its padding is the top margin, or the
 * gap under the title, and the plot stands at its bottom.
 */
const LEGEND_RISE = 8;
/** Plotly's line height over its lettering, and an annotation's padding inside its box, in px: its defaults. */
const PLOTLY_LINE_SPACING = 1.3;
const PLOTLY_ANNOTATION_PADDING = 1;
/** From the axis line to its title, in px, so the title stays inside {@link MARGIN}. */
const AXIS_TITLE_STANDOFF = 4;
/** Under what the file ends with, the x axis or the footer, to its bottom edge, in px. */
const BOTTOM_GAP = 6;
/** From the x axis's room to the summary's top, in px. */
const SUMMARY_GAP = 6;
/** From the summary's bottom to the footer's top, in px. */
const FOOTER_GAP = 6;
/** One line of text at {@link LETTERING}, in px: n lines take a little less than n of them. */
const LINE_HEIGHT = LETTERING.size * PLOTLY_LINE_SPACING;
/**
 * Higher than any legend, in px. Plotly's default is half the figure's
 * height, past which the legend scrolls and the file loses items.
 */
const LEGEND_MAX_HEIGHT = 100_000;
const LEGEND_LINE_WIDTH = 2;
const LEGEND_MARKER_SIZE = 8;
/** The file's ground, where the page shows the chart over its own. */
const PAPER = "#ffffff";

/**
 * Download `image` as `format`, named `fileName`. Plotly lays the legend out
 * by its labels, which nothing knows the width of before drawing, so the
 * figure is drawn once out of sight, its legend's height read, and the plot's
 * top and the file's height set from it. Rejects if the image could not be made.
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
 * any, then the legend, the plot at its declared ranges and its size's ratio
 * under it, the Input summary and the footer, if any, under the x axis, the
 * file as tall as they need.
 */
function figureOf(image: ImageDescription, legendHeight: number) {
  const { chart, title, summaryAndFooter } = image;
  // The summary's groups stand one under another, a slot's heading opening its own.
  const summary = summaryAndFooter?.summary.flat() ?? [];
  const footer = summaryAndFooter?.footer ?? [];
  const width = image.size.widthMm * PX_PER_MM;
  const sides = sideMarginsOf(chart.layout.y, MARGIN);
  const titleBottom = MARGIN.top + (title === null ? 0 : TITLE_BLOCK);
  const legendTop = titleBottom - LEGEND_RISE;
  const plotTop = legendHeight === 0 ? titleBottom : legendTop + legendHeight;
  const plotHeight = (width - sides.l - sides.r) / image.size.plotAspectRatio;
  const plotBottom = plotTop + plotHeight;
  const xAxisBottom = plotBottom + MARGIN.xAxis;
  const summaryTop = xAxisBottom + SUMMARY_GAP;
  const footerTop = summaryTop + summary.length * LINE_HEIGHT + FOOTER_GAP;
  const footerBottom = footerTop + footer.length * LINE_HEIGHT;
  const height = (summaryAndFooter === null ? xAxisBottom : footerBottom) + BOTTOM_GAP;
  // The hover grid is left out: nobody points at a file, and an SVG would
  // carry it as a bitmap.
  const drawn = toPlotlyData({ ...chart, traces: chart.traces.filter((trace) => trace.kind !== "hoverGrid") });
  const data: PlotlyData[] = [...drawn, ...chart.legend.map(legendTraceOf)];
  const layout = {
    width,
    height,
    margin: { ...sides, t: plotTop, b: height - plotTop - plotHeight, pad: 0, autoexpand: false },
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
      // Plotly fills the box with the paper's colour, over the plot's top edge, where the box stands.
      bgcolor: TRANSPARENT,
    },
    annotations: [
      ...chart.annotations.map((annotation) => {
        const plotlyAnnotation = toPlotlyAnnotation(annotation);
        return { ...plotlyAnnotation, font: { ...plotlyAnnotation.font, size: LETTERING.size } };
      }),
      ...(title === null ? [] : [titleAnnotationOf(title, plotTop - titleBottom)]),
      ...(summaryAndFooter === null
        ? []
        : [textBlockOf(summary, summaryTop - plotBottom), textBlockOf(footer, footerTop - plotBottom)]),
    ],
    xaxis: fileAxisOf(toPlotlyAxis(chart.layout.x)),
    yaxis: fileAxisOf(toPlotlyYAxis(chart.layout.y)),
  } satisfies PlotlyLayout;
  return { data, layout };
}

/**
 * The title, on the plot's left edge, its box's top at the top margin: its
 * line ends `above` px over the plot's top edge.
 */
function titleAnnotationOf(title: string, above: number) {
  return {
    text: title,
    xref: "paper",
    yref: "paper",
    x: 0,
    y: 1,
    xanchor: "left",
    yanchor: "bottom",
    yshift: above + TITLE_BLOCK - TITLE_LETTERING.size * PLOTLY_LINE_SPACING - PLOTLY_ANNOTATION_PADDING,
    showarrow: false,
    align: "left",
    font: TITLE_LETTERING,
  } as const;
}

/**
 * `lines` as one block on the plot's left edge, its top `below` px under the
 * plot's bottom edge. Plotly rounds the block's box, so it lands up to 2.3 px
 * lower, which the gap under it takes.
 */
function textBlockOf(lines: readonly string[], below: number) {
  return {
    text: lines.join("<br>"),
    xref: "paper",
    yref: "paper",
    x: 0,
    y: 0,
    xanchor: "left",
    yanchor: "top",
    yshift: -below,
    borderpad: 0,
    showarrow: false,
    align: "left",
    font: LETTERING,
  } as const;
}

/**
 * The screen's axis, its title held inside the margin rather than pushing the
 * plot, and lettered as the rest: Plotly sets a title 1.2 times the figure's font.
 */
function fileAxisOf<Axis extends ReturnType<typeof toPlotlyAxis>>(axis: Axis) {
  return {
    ...axis,
    automargin: false,
    title: { ...axis.title, standoff: AXIS_TITLE_STANDOFF, font: { size: LETTERING.size } },
  };
}

/**
 * One legend item: a trace that draws nothing and shows in Plotly's legend
 * in the item's swatch and colour. An empty `x` would show no item at all.
 */
function legendTraceOf(item: LegendItem): PlotlyData {
  const nothing = { type: "scatter", x: [null], y: [null], name: item.label, showlegend: true, hoverinfo: "skip" };
  switch (item.swatch) {
    case "fill":
      return { ...nothing, mode: "none", fill: "toself", fillcolor: item.color };
    case "line":
      return { ...nothing, mode: "lines", line: { color: item.color, width: LEGEND_LINE_WIDTH } };
    case "marker":
      return { ...nothing, mode: "markers", marker: { color: item.color, size: LEGEND_MARKER_SIZE } };
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
