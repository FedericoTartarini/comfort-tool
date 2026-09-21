<script lang="ts">
  import type { PlotlyAnnotation, PlotlyConfig, PlotlyData, PlotlyLayout } from "plotly.js-cartesian-dist-min";
  import type {
    Annotation,
    BandFill,
    BandTrace,
    ChartSpec,
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
  let drawn = false;

  // The bundle is 3 MB, so it loads with the first chart rather than with the
  // app. The attachment deliberately reads no chart data: it must not tear the
  // plot down and rebuild it every time an input changes.
  function mount(node: HTMLElement) {
    element = node;
    void import("plotly.js-cartesian-dist-min").then((module) => {
      plotly = module.default;
    });
    return () => {
      plotly?.purge(node);
      element = undefined;
      drawn = false;
    };
  }

  // Plotly is an external system, so synchronising it is what $effect is for
  // (ADR §6). `react` diffs against the drawn figure and keeps the viewport.
  $effect(() => {
    const data = toData(spec);
    const layout = toLayout(spec);
    const node = element;
    const api = plotly;
    if (!node || !api) {
      return;
    }
    if (drawn) {
      void api.react(node, data, layout, CONFIG);
    } else {
      drawn = true;
      void api.newPlot(node, data, layout, CONFIG);
    }
  });

  const CONFIG: PlotlyConfig = {
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

  function toData(source: ChartSpec): PlotlyData[] {
    return source.traces.flatMap((trace) => {
      switch (trace.kind) {
        case "path":
          return [pathData(trace)];
        case "point":
          return [pointData(trace)];
        case "bands":
          return bandData(trace);
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
      // A filled band answers anywhere inside itself rather than at its
      // vertices, which is what "the field never snaps" means for a polygon.
      hoveron: "fills",
      hoverinfo: trace.hover === "off" ? "skip" : "text",
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
      hoverinfo: trace.hover === "off" ? "skip" : "text",
      text: trace.label,
      showlegend: false,
    };
  }

  /**
   * One trace per band, each filling that band's own interval of the surface.
   * ADR §4.4 calls for a contour rather than a heatmap, which paints one
   * rectangle per grid cell and made every boundary a staircase; and one
   * contour draws levels at a single fixed spacing, while a classifier's Edges
   * need not be evenly spaced, so each band brings its own.
   *
   * Every band fills up to the *last* band's upper Edge and they are drawn in
   * band order, so each boundary is one fill's edge laid over the next fill's
   * interior. Two fills meeting edge to edge can show a seam; a fill over an
   * interior cannot.
   *
   * Measured on plotly.js 4.0.0, not read off its documentation: a constraint
   * paints the side that *fails* the operation. So `"]["` paints inside the
   * interval and `">"` paints below the value. Nothing in the test suite
   * renders a chart, which is why the package is pinned to exactly that
   * version — an upgrade has to re-measure this before it ships.
   */
  function bandData(trace: BandTrace): PlotlyData[] {
    const lastEdge = trace.bands[trace.bands.length - 1].upper;
    return trace.bands.map((band, index) => ({
      type: "contour",
      x: trace.x,
      y: trace.y,
      z: trace.z,
      contours: { ...constrainFill(band, lastEdge), showlines: false },
      fillcolor: band.color,
      line: { width: 0 },
      connectgaps: false,
      showscale: false,
      // One label for the pointer, from the band whose fill reaches furthest:
      // a contour answers off the surface, so the first trace reads for the
      // whole field, past the last Edge and inside a hole included.
      ...(index === 0 ? carryHover(trace) : { hoverinfo: "skip" }),
      showlegend: false,
    }));
  }

  /** To the band's own interval, or to everything below the last Edge for the band that is open below. */
  function constrainFill(band: BandFill, lastEdge: number) {
    return band.lower === undefined
      ? { type: "constraint", operation: ">", value: lastEdge }
      : { type: "constraint", operation: "][", value: [band.lower, lastEdge] };
  }

  function carryHover(trace: BandTrace) {
    return {
      text: trace.hoverText,
      hoverinfo: trace.hover === "off" ? "skip" : "text",
      hovertemplate: "%{x}, %{y}<br>%{text}<extra></extra>",
      // Plotly tints a hover label with the trace's own colour where it has
      // one, which a filled band does; the chart reads one grey label in every
      // band, as it did when the surface was a single trace.
      hoverlabel: { bgcolor: "#444444" },
    };
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
      plot_bgcolor: "#ffffff",
      paper_bgcolor: "rgba(0, 0, 0, 0)",
      xaxis: axis(source.layout.x),
      yaxis: axis(source.layout.y),
    };
  }

  function axis(axisSpec: ChartSpec["layout"]["x"]) {
    return {
      title: { text: axisSpec.title },
      range: [...axisSpec.range],
      tickformat: axisSpec.tickFormat,
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
