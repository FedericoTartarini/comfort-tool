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
  HoverGridTrace,
  HoverMode,
  PathTrace,
  PointTrace,
  Trace,
} from "$lib/core/charts/chartSpec";

/**
 * Plotly's colour for painting nothing: the page behind the plot. Not a
 * colour of the chart, which the spec resolves, but how the adapter tells
 * Plotly to leave a surface unpainted.
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
 * draws every heatmap under every scatter, whatever their order (its
 * `traceLayerClasses`).
 */
const plotlyLayerOf = {
  hoverGrid: 0,
  path: 1,
  point: 1,
} satisfies Record<Trace["kind"], number>;

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

export function toPlotlyLayout(source: ChartSpec): PlotlyLayout {
  return {
    autosize: true,
    uirevision: viewportRevision(source),
    margin: { l: 64, r: 16, t: 12, b: 48 },
    // ADR §4.4: the chart's one legend is rendered beside or under it by ChartLegend.
    showlegend: false,
    hovermode: "closest",
    hoverlabel: READOUT_LABEL,
    annotations: source.annotations.map(toPlotlyAnnotation),
    plot_bgcolor: chartInk.ground,
    paper_bgcolor: TRANSPARENT,
    xaxis: toPlotlyAxis(source.layout.x),
    yaxis: toPlotlyAxis(source.layout.y),
  };
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
