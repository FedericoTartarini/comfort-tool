<script module lang="ts">
  import type { PlotlyConfig } from "plotly.js-cartesian-dist-min";

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
  import type { ChartSpec } from "$lib/core/charts/chartSpec";
  import { toPlotlyData, toPlotlyLayout } from "./plotlyFigure";

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
    const data = toPlotlyData(spec);
    const layout = toPlotlyLayout(spec);
    const node = element;
    const api = plotly;
    if (!node || !api) {
      return;
    }
    void api.react(node, data, layout, plotlyConfig);
  });
</script>

<div class="plot" {@attach mount}></div>

<style>
  .plot {
    width: 100%;
    height: 26rem;
  }
</style>
