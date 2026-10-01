<script module lang="ts">
  import type { PlotlyAnnotation, PlotlyConfig, PlotlyData, PlotlyLayout } from "plotly.js-cartesian-dist-min";

  const plotlyConfig: PlotlyConfig = {
    responsive: true,
    displaylogo: false,
    // plotly 4 shows the Chart Studio upload button by default (ADR §2.1).
    showSendToCloud: false,
    // `toImage` goes too: Plotly's own PNG would come out without the legend,
    // which lives below the chart. Image export with a matching legend, a
    // title and an input summary is Phase 5's.
    modeBarButtonsToRemove: [
      "toImage",
      "select2d",
      "lasso2d",
      "toggleSpikelines",
      "hoverClosestCartesian",
      "hoverCompareCartesian",
    ],
  };
</script>

<script lang="ts">
  import { chartInk } from "$lib/core/bandPalette";
  import type {
    Annotation,
    AxisSpec,
    BandFill,
    BandTrace,
    ChartSpec,
    ContourZoneTrace,
    HoverGridTrace,
    HoverMode,
    PathTrace,
    PointTrace,
  } from "$lib/core/charts/chartSpec";

  interface Props {
    spec: ChartSpec;
  }

  let { spec }: Props = $props();

  type Plotly = typeof import("plotly.js-cartesian-dist-min").default;

  let element = $state.raw<HTMLElement | undefined>(undefined);
  let plotly = $state.raw<Plotly | undefined>(undefined);

  // The bundle is 3 MB, so it loads with the first chart rather than with the
  // app. The attachment deliberately reads no chart data: it must not tear the
  // plot down and rebuild it every time an input changes.
  function mount(node: HTMLElement) {
    element = node;
    void import("plotly.js-cartesian-dist-min").then((module) => {
      plotly = module.default;
    });
    // `responsive` follows the window alone, and the chart's column also
    // narrows with the window unchanged: when Compare widens the inputs.
    // Only a drawn plot is resized.
    const observer = new ResizeObserver(() => {
      if (node.classList.contains("js-plotly-plot")) {
        void plotly?.Plots.resize(node);
      }
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      plotly?.purge(node);
      element = undefined;
    };
  }

  // Plotly is an external system, so synchronising it is what $effect is for
  // (ADR §6). `react` draws the plot on a node that holds none (plotly.js
  // 4.0.0 hands it to `newPlot`), and afterwards diffs against the drawn
  // figure and keeps the viewport.
  $effect(() => {
    const data = toData(spec);
    const layout = toLayout(spec);
    const node = element;
    const api = plotly;
    if (!node || !api) {
      return;
    }
    void api.react(node, data, layout, plotlyConfig);
  });

  function toData(source: ChartSpec): PlotlyData[] {
    return source.traces.flatMap((trace) => {
      switch (trace.kind) {
        case "path":
          return [pathData(trace)];
        case "point":
          return [pointData(trace)];
        case "bands":
          return bandData(trace);
        case "hoverGrid":
          return [hoverGridData(trace)];
        case "contourZone":
          return [contourZoneData(trace)];
      }
    });
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
   * One trace per band, each filling that band's own interval of the surface.
   * ADR §4.4 calls for a contour rather than a heatmap, which paints one
   * rectangle per grid cell and so draws every boundary as a staircase; and
   * one contour draws levels at a single fixed spacing, while a classifier's
   * Edges need not be evenly spaced, so each band brings its own.
   *
   * Every band fills up to the top of the contiguous bands from it up, those
   * that meet Edge to Edge, and they are drawn in band order, so each boundary
   * among them is one fill's edge laid over the next fill's interior. Two
   * fills meeting edge to edge can show a seam; a fill over an interior
   * cannot. Contiguity ends where an uncoloured band was left out, so its
   * interval stays unpainted rather than showing the fill below it.
   *
   * Measured on plotly.js 4.0.0, not read off its documentation: a constraint
   * paints the side that *fails* the operation. So `"]["` paints inside the
   * interval and `">"` paints below the value. Nothing in the test suite
   * renders a chart, which is why the package is pinned to exactly that
   * version — an upgrade has to re-measure this before it ships.
   */
  function bandData(trace: BandTrace): PlotlyData[] {
    return trace.bands.map((band, index) => ({
      type: "contour",
      x: trace.x,
      y: trace.y,
      z: trace.z,
      contours: { ...constrainFill(band, contiguousTopOf(trace.bands, index)), showlines: false },
      fillcolor: band.color,
      line: { width: 0 },
      connectgaps: false,
      showscale: false,
      hoverinfo: hoverInfo(trace.hover),
      showlegend: false,
    }));
  }

  /** The upper Edge of the last of the bands from `bands[index]` up that meet Edge to Edge. */
  function contiguousTopOf(bands: readonly BandFill[], index: number): number {
    let top = bands[index].upper;
    for (const band of bands.slice(index + 1)) {
      if (band.lower !== top) {
        break;
      }
      top = band.upper;
    }
    return top;
  }

  /** From the band's lower Edge, or from below for the band that is open below, up to `top`. */
  function constrainFill(band: BandFill, top: number) {
    return band.lower === undefined
      ? { type: "constraint", operation: ">", value: top }
      : { type: "constraint", operation: "][", value: [band.lower, top] };
  }

  /**
   * A Comfort zone cut from a scanned field: one contour filling the surface
   * between the zone's two limits, `"]["` painting inside the interval as
   * {@link bandData} measured, and outlined where the surface crosses them.
   */
  function contourZoneData(trace: ContourZoneTrace): PlotlyData {
    return {
      type: "contour",
      x: trace.x,
      y: trace.y,
      z: trace.z,
      contours: { type: "constraint", operation: "][", value: [trace.lower, trace.upper], showlines: true },
      fillcolor: trace.fill,
      line: { color: trace.color, width: trace.width },
      connectgaps: false,
      showscale: false,
      name: trace.label,
      hoverinfo: hoverInfo(trace.hover),
      showlegend: false,
    };
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

  function toLayout(source: ChartSpec): PlotlyLayout {
    return {
      autosize: true,
      uirevision: viewportRevision(source),
      margin: { l: 64, r: 16, t: 12, b: 48 },
      // ADR §4.4: the chart's one legend is rendered below it by ChartLegend.
      showlegend: false,
      hovermode: "closest",
      annotations: source.annotations.map(annotation),
      plot_bgcolor: chartInk.ground,
      paper_bgcolor: "rgba(0, 0, 0, 0)",
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
</script>

<div class="plot" {@attach mount}></div>

<style>
  .plot {
    width: 100%;
    height: 26rem;
  }
</style>
