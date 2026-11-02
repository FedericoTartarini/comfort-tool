/**
 * The chart adapter's conversion of a {@link ChartSpec} into Plotly's traces
 * and layout (ADR §4.4), out of `PlotlyChart.svelte` so that whatever draws a
 * chart with Plotly draws it from this one conversion (ADR-0002 decision 64,
 * rule 7). It reads the spec alone and touches no node.
 */
import type { PlotlyAnnotation, PlotlyData, PlotlyLayout } from "plotly.js-cartesian-dist-min";
import { chartInk } from "$lib/core/bandPalette";
import type {
  Annotation,
  AxisSide,
  AxisSpec,
  ChartSpec,
  HoverGridTrace,
  HoverMode,
  PathTrace,
  PointTrace,
  Trace,
  YAxisSpec,
} from "$lib/core/charts/chartSpec";

/**
 * Plotly's colour for painting nothing: the page behind the plot. Not a
 * colour of the chart, which the spec resolves, but how the adapter tells
 * Plotly to leave a surface unpainted.
 */
export const TRANSPARENT = "rgba(0, 0, 0, 0)";

/**
 * The spec's traces drawn in their order, the first at the bottom, except the
 * hover grid: plotly.js 4.0.0 draws every heatmap under every scatter,
 * whatever their order (its `traceLayerClasses`), and the grid is drawn
 * fully transparent, so where it lies does not show. No trace gets a
 * `zorder`: traces of different `zorder`s break the viewport after Reset
 * axes and Pan from the modebar (plotly.js #7320, open on 4.2.0; USYD-145).
 */
export function toPlotlyData(source: ChartSpec): PlotlyData[] {
  return source.traces.map(dataOf);
}

function dataOf(trace: Trace): PlotlyData {
  switch (trace.kind) {
    case "path":
      return pathData(trace);
    case "point":
      return pointData(trace);
    case "hoverGrid":
      return hoverGridData(trace);
  }
}

/**
 * A path's pieces as one scatter, joined by `null`, which Plotly draws as a
 * gap. A filled one closes each ring and fills them together by the nonzero
 * rule, so a ring wound opposite to the one around it is a hole (measured on
 * plotly.js 4.0.0: one SVG path, each ring closed, `fill-rule: nonzero`;
 * `.scratch/chart-verification/evidence/scripts-01/holes.html`).
 */
function pathData(trace: PathTrace): PlotlyData {
  const joined = (axis: "x" | "y") =>
    trace.pieces.flatMap((piece, index): (number | null)[] => (index === 0 ? [...piece[axis]] : [null, ...piece[axis]]));
  return {
    type: "scatter",
    mode: "lines",
    x: joined("x"),
    y: joined("y"),
    line: { color: trace.color, width: trace.width },
    fill: trace.fill ? "toself" : "none",
    fillcolor: trace.fill,
    name: trace.label ?? "",
    text: trace.label ?? "",
    hoverinfo: hoverInfo(trace.hover),
    showlegend: false,
  };
}

function pointData(trace: PointTrace): PlotlyData {
  return {
    type: "scatter",
    mode: "markers",
    x: [trace.x],
    y: [trace.y],
    marker: { color: trace.color, size: 11, line: { color: "#ffffff", width: 2 } },
    name: trace.label,
    // ADR §4.4: the slot markers do not capture the pointer either.
    hoverinfo: hoverInfo(trace.hover),
    text: trace.label,
    showlegend: false,
  };
}

/**
 * A field's hover readout, written whole by the spec builder: the adapter
 * only breaks its lines, and adds no template of its own.
 */
function carryHover(trace: HoverGridTrace) {
  return {
    text: trace.hoverText.map((row) => row.map((lines) => lines.join("<br>"))),
    hoverinfo: hoverInfo(trace.hover),
  };
}

/**
 * Cells the pointer reads but nobody sees: a heatmap, which answers per cell,
 * drawn fully transparent. Its `z` only sizes the grid.
 */
function hoverGridData(trace: HoverGridTrace): PlotlyData {
  return {
    type: "heatmap",
    x: trace.x,
    y: trace.y,
    z: trace.hoverText.map((row) => row.map(() => 0)),
    opacity: 0,
    showscale: false,
    ...carryHover(trace),
    showlegend: false,
  };
}

/** What Plotly reads off a trace's hover mode: its text, or nothing at all. */
function hoverInfo(mode: HoverMode): "skip" | "text" {
  return mode === "off" ? "skip" : "text";
}

export function toPlotlyAnnotation(entry: Annotation) {
  return {
    x: entry.x,
    y: entry.y,
    text: entry.text,
    showarrow: false,
    xanchor: "right",
    yanchor: "top",
    font: { size: 10, color: "#64748b" },
  } satisfies PlotlyAnnotation;
}

/**
 * Plotly keeps the viewport the user zoomed or panned to for as long as this
 * does not change, even though the layout carries an explicit range. So a
 * changed input redraws inside the current viewport, while a changed axis or
 * unit system resets it.
 */
function viewportRevision(source: ChartSpec): string {
  const { x, y } = source.layout;
  return [x.title, x.range, y.title, y.range].join("|");
}

/**
 * The hover readout on the pointer, one look over every trace (ADR-0002
 * decision 67, rule 5). Plotly would otherwise tint a label with its trace's
 * own colour, a heatmap's from its colour scale; a trace's label settings
 * default to these.
 */
const READOUT_LABEL = {
  font: chartInk.readoutFont,
  bgcolor: chartInk.readoutGround,
  bordercolor: chartInk.readoutEdge,
};

/**
 * The room beside a plot, in px: `axisRoom` for the y axis's ticks and title
 * on its side, `halfTick` on the other for half of the x axis's end tick,
 * which Plotly centres on the plot's edge.
 */
interface SideRoom {
  readonly axisRoom: number;
  readonly halfTick: number;
}

/** The page's room around the plot, in px: beside it, and above and under it. */
const PAGE_MARGIN = { axisRoom: 64, halfTick: 16, top: 12, bottom: 48 };

/** A plot's left and right margins, `room` laid out by the side `yAxis` stands on. */
export function sideMarginsOf(yAxis: YAxisSpec, room: SideRoom) {
  return sideOf(yAxis) === "right"
    ? { l: room.halfTick, r: room.axisRoom }
    : { l: room.axisRoom, r: room.halfTick };
}

/** The side a y axis stands on: the left unless its spec says otherwise. */
function sideOf(axisSpec: YAxisSpec): AxisSide {
  return axisSpec.side ?? "left";
}

export function toPlotlyLayout(source: ChartSpec): PlotlyLayout {
  return {
    autosize: true,
    uirevision: viewportRevision(source),
    margin: {
      ...sideMarginsOf(source.layout.y, PAGE_MARGIN),
      t: PAGE_MARGIN.top,
      b: PAGE_MARGIN.bottom,
    },
    // ADR §4.4: the chart's one legend is rendered above it by ChartLegend (ADR-0002 decision 89, rule 3).
    showlegend: false,
    hovermode: "closest",
    hoverlabel: READOUT_LABEL,
    annotations: source.annotations.map(toPlotlyAnnotation),
    plot_bgcolor: chartInk.ground,
    paper_bgcolor: TRANSPARENT,
    xaxis: toPlotlyAxis(source.layout.x),
    yaxis: toPlotlyYAxis(source.layout.y),
  };
}

/** The y axis, on the side its spec names. */
export function toPlotlyYAxis(axisSpec: YAxisSpec) {
  return { ...toPlotlyAxis(axisSpec), side: sideOf(axisSpec) };
}

export function toPlotlyAxis(axisSpec: AxisSpec) {
  return {
    title: { text: axisSpec.title },
    range: [...axisSpec.range],
    zeroline: false,
    gridcolor: "#eef1f5",
    linecolor: "#cbd5e1",
    mirror: true,
    showline: true,
  };
}
