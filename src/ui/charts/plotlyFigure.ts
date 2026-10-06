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
  AxisSpec,
  ChartSpec,
  ContourFillTrace,
  ContourLineTrace,
  HoverGridTrace,
  HoverMode,
  PathTrace,
  PointTrace,
  Trace,
} from "$lib/core/charts/chartSpec";

/**
 * Plotly's colour for painting nothing: a contour line's fill and the page
 * behind the plot. Not a colour of the chart, which the spec resolves, but how
 * the adapter tells Plotly to leave a surface unpainted.
 */
const TRANSPARENT = "rgba(0, 0, 0, 0)";

/**
 * The spec's traces drawn in their order, the first at the bottom. Plotly
 * draws a subplot's traces by type, in order only within one, so a trace
 * whose type it would draw under the one before opens the next `zorder`,
 * which it draws over every lower one.
 */
export function toPlotlyData(source: ChartSpec): PlotlyData[] {
  let zorder = 0;
  let layer = 0;
  return source.traces.map((trace) => {
    const next = plotlyLayerOf[trace.kind];
    if (next < layer) {
      zorder += 1;
    }
    layer = next;
    return { ...dataOf(trace), zorder };
  });
}

/**
 * Where Plotly draws each trace kind within one `zorder`: plotly.js 4.0.0
 * draws every heatmap under every contour under every scatter, whatever
 * their order (its `traceLayerClasses`).
 */
const plotlyLayerOf = {
  hoverGrid: 0,
  contourFill: 1,
  contourLine: 1,
  path: 2,
  point: 2,
} satisfies Record<Trace["kind"], number>;

function dataOf(trace: Trace): PlotlyData {
  switch (trace.kind) {
    case "path":
      return pathData(trace);
    case "point":
      return pointData(trace);
    case "contourFill":
      return contourFillData(trace);
    case "contourLine":
      return contourLineData(trace);
    case "hoverGrid":
      return hoverGridData(trace);
  }
}

function pathData(trace: PathTrace): PlotlyData {
  return {
    type: "scatter",
    mode: "lines",
    x: trace.x,
    y: trace.y,
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
 * A region's fill: one constraint contour painting the cells of its
 * interval, its lines hidden. ADR §4.4 calls for a contour rather than a
 * heatmap, which paints one rectangle per grid cell and so draws every
 * boundary as a staircase; and one contour draws levels at a single fixed
 * spacing, while a classifier's Edges need not be evenly spaced, so each
 * region brings its own.
 */
function contourFillData(trace: ContourFillTrace): PlotlyData {
  return {
    ...contourOf(trace),
    contours: { ...constraintOf(trace), showlines: false },
    fillcolor: trace.color,
    line: { width: 0 },
  };
}

/**
 * A region's line: the same constraint contour with a transparent fill and
 * its lines shown, which strokes where the field crosses the interval's
 * values and nothing else, no side along the edge of the field or of a
 * cell with no number. Measured on plotly.js 4.0.0 for an interval and for
 * a single value; directly over a fill of the same interval it draws, pixel
 * for pixel, what one contour with that fill and these lines draws.
 */
function contourLineData(trace: ContourLineTrace): PlotlyData {
  return {
    ...contourOf(trace),
    contours: { ...constraintOf(trace), showlines: true },
    fillcolor: TRANSPARENT,
    line: { color: trace.color, width: trace.width },
  };
}

/** What a region's fill and line share: the field, never drawn across a cell with no number. */
function contourOf(trace: ContourFillTrace | ContourLineTrace) {
  return {
    type: "contour",
    x: trace.x,
    y: trace.y,
    z: trace.z,
    connectgaps: false,
    showscale: false,
    hoverinfo: hoverInfo(trace.hover),
    showlegend: false,
  };
}

/**
 * The constraint of a region's interval: between its two values, or below
 * the upper where there is no lower.
 *
 * Measured on plotly.js 4.0.0, not read off its documentation: a constraint
 * paints the side that *fails* the operation. So `"]["` paints inside the
 * interval and `">"` paints below the value. Nothing in the test suite
 * renders a chart, which is why the package is pinned to exactly that
 * version — an upgrade has to re-measure this before it ships.
 */
function constraintOf({ lower, upper }: ContourFillTrace | ContourLineTrace) {
  return lower === undefined
    ? { type: "constraint", operation: ">", value: upper }
    : { type: "constraint", operation: "][", value: [lower, upper] };
}

/**
 * A field's hover readout, written whole by the spec builder: the component
 * only breaks its lines, and adds no template of its own.
 */
function carryHover(trace: HoverGridTrace) {
  return {
    text: trace.hoverText.map((row) => row.map((lines) => lines.join("<br>"))),
    hoverinfo: hoverInfo(trace.hover),
    // Plotly tints a hover label with the trace's own colour, a heatmap's
    // from its colour scale; the chart reads one grey label over every band
    // and zone.
    hoverlabel: { bgcolor: "#444444" },
  };
}

/**
 * Cells the pointer reads but nobody sees: a heatmap, which answers per cell
 * as the contour does, drawn fully transparent. Its `z` only sizes the grid.
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

function annotation(entry: Annotation): PlotlyAnnotation {
  return {
    x: entry.x,
    y: entry.y,
    text: entry.text,
    showarrow: false,
    xanchor: "right",
    yanchor: "top",
    font: { size: 10, color: "#64748b" },
  };
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

export function toPlotlyLayout(source: ChartSpec): PlotlyLayout {
  return {
    autosize: true,
    uirevision: viewportRevision(source),
    margin: { l: 64, r: 16, t: 12, b: 48 },
    // ADR §4.4: the chart's one legend is rendered below it by ChartLegend.
    showlegend: false,
    hovermode: "closest",
    annotations: source.annotations.map(annotation),
    plot_bgcolor: chartInk.ground,
    paper_bgcolor: TRANSPARENT,
    xaxis: axis(source.layout.x),
    yaxis: axis(source.layout.y),
  };
}

function axis(axisSpec: AxisSpec) {
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
