<svelte:options runes={true} />

<script lang="ts">
  import { onMount, tick } from "svelte";

  import { downloadPublicationChart } from "../../services/plotlyExport";
  import {
    toPlotlyFigure,
    type PlotlyFigure,
  } from "../../services/plotlyFigure";
  import type { PlotlyChartResponseDto } from "../../models/comfortDtos";

  interface Props {
    chartResult: PlotlyChartResponseDto | null;
    isLoading: boolean;
    emptyMessage: string;
    heightClass?: string;
    showPlotTitle?: boolean;
    showZones?: boolean;
    onRegisterExport?:
      | ((handler: (type: "png" | "svg") => void) => void)
      | undefined;
  }

  let {
    chartResult,
    isLoading,
    emptyMessage,
    heightClass = "h-[420px]",
    showPlotTitle = false,
    showZones = true,
    onRegisterExport = undefined,
  }: Props = $props();

  interface PlotlyModule {
    react: (
      root: HTMLDivElement,
      data: PlotlyFigure["data"],
      layout: PlotlyFigure["layout"],
      config: PlotlyFigure["config"],
    ) => Promise<void>;
    purge: (root: HTMLDivElement) => void;
    toImage: (
      figure: {
        data: PlotlyFigure["data"];
        layout: PlotlyFigure["layout"];
        config: PlotlyFigure["config"];
      },
      options: {
        format: "png" | "svg";
        width: number;
        height: number;
        scale: number;
      },
    ) => Promise<string>;
    Plots?: {
      resize: (root: HTMLDivElement) => Promise<void> | void;
    };
  }

  let chartElement = $state<HTMLDivElement | null>(null);
  let plotlyModule = $state<PlotlyModule | null>(null);
  let resizeObserver: ResizeObserver | null = null;

  let hasRenderedChart = $state(false);
  let chartError = $state("");
  let chartHeightStyle = $derived(
    chartResult?.layout?.height && chartResult.layout.height > 0
      ? `height: ${chartResult.layout.height}px;`
      : undefined,
  );

  async function loadPlotly(): Promise<PlotlyModule> {
    if (plotlyModule) {
      return plotlyModule;
    }
    const importedModule = await import("plotly.js-dist-min");
    const moduleCandidate: unknown = importedModule.default ?? importedModule;
    plotlyModule = moduleCandidate as PlotlyModule;
    return plotlyModule;
  }

  function chartWithVisibleZones(
    chart: PlotlyChartResponseDto,
  ): PlotlyChartResponseDto {
    if (showZones) return chart;
    return {
      ...chart,
      traces: chart.traces.filter((trace) => !trace.isBackgroundZone),
    };
  }

  async function exportChart(format: "png" | "svg") {
    if (!chartResult) return;
    try {
      const plotly = await loadPlotly();
      await downloadPublicationChart(
        plotly,
        chartWithVisibleZones(chartResult),
        format,
      );
    } catch (error) {
      chartError =
        error instanceof Error ? error.message : "Chart export failed.";
    }
  }

  function backgroundSignature(traces: Array<{ type: string }>): string {
    return (
      traces
        .filter((t) => t.type !== "scatter")
        .map((t) => t.type)
        .join(",")
    );
  }

  function classifyUpdate(
    prev: { layout: { title: string }; traces: Array<{ type: string }> },
    next: { layout: { title: string }; traces: Array<{ type: string }> },
  ): "dot" | "background" | "full" {
    if (prev.layout.title !== next.layout.title) return "full";
    if (backgroundSignature(prev.traces) !== backgroundSignature(next.traces))
      return "background";
    return "dot";
  }

  // WAAPI avoids Plotly transition flicker while retaining its final layout.
  async function animateDots(
    plotly: NonNullable<typeof plotlyModule>,
    figure: PlotlyFigure,
    durationMs: number,
  ): Promise<void> {
    if (!chartElement) return;

    const firstRects = Array.from(
      chartElement.querySelectorAll<SVGPathElement>(".scatterlayer path.point"),
    ).map((el) => el.getBoundingClientRect());

    await plotly.react(chartElement, figure.data, figure.layout, figure.config);

    if (firstRects.length === 0) return;

    const lastEls = Array.from(
      chartElement.querySelectorAll<SVGPathElement>(".scatterlayer path.point"),
    );

    if (lastEls.length !== firstRects.length) return;

    lastEls.forEach((el, i) => {
      const lastRect = el.getBoundingClientRect();
      const dx = firstRects[i].left - lastRect.left;
      const dy = firstRects[i].top - lastRect.top;

      if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) return;

      // CSS translate composes with Plotly's transform-based marker positioning.
      el.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0px 0px" }], {
        duration: durationMs,
        easing: "ease-in-out",
        fill: "none",
      });
    });
  }

  let prevChartResult: typeof chartResult | null = null;

  async function resizeRenderedChart() {
    if (!chartElement || !plotlyModule?.Plots || !hasRenderedChart) return;

    const { width, height } = chartElement.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;

    try {
      await plotlyModule.Plots.resize(chartElement);
    } catch {
      // Detached elements can race observer cleanup; the next resize retries.
    }
  }

  async function renderChart() {
    if (!chartResult) {
      hasRenderedChart = false;
      chartError = "";
      prevChartResult = null;
      return;
    }
    if (!chartElement) await tick();
    if (!chartElement) return;

    try {
      const plotly = await loadPlotly();
      const chartPayload = chartWithVisibleZones(chartResult);
      const figure = toPlotlyFigure(chartPayload, { showPlotTitle });

      if (hasRenderedChart && prevChartResult) {
        const updateType = classifyUpdate(prevChartResult, chartResult);

        if (updateType === "dot") {
          await animateDots(plotly, figure, 400);
          prevChartResult = chartResult;
          return;
        }

        if (updateType === "background") {
          await animateDots(plotly, figure, 500);
          prevChartResult = chartResult;
          return;
        }
      }

      chartError = "";
      await plotly.react(
        chartElement,
        figure.data,
        figure.layout,
        figure.config,
      );
      hasRenderedChart = true;
      await resizeRenderedChart();
      prevChartResult = chartResult;
    } catch (error) {
      hasRenderedChart = false;
      chartError =
        error instanceof Error ? error.message : "Chart rendering failed.";
    }
  }

  onMount(() => {
    if (chartElement && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        void resizeRenderedChart();
      });
      resizeObserver.observe(chartElement);
    }
    void renderChart();
    if (onRegisterExport) onRegisterExport(exportChart);
    return () => {
      resizeObserver?.disconnect();
      resizeObserver = null;
      if (chartElement && plotlyModule) plotlyModule.purge(chartElement);
    };
  });

  $effect(() => {
    chartResult;
    showZones;
    if (onRegisterExport) onRegisterExport(exportChart);
    void renderChart();
  });
</script>

<figure class="relative mt-2 min-w-0">
  <div class="w-full overflow-hidden bg-white">
    <div
      data-testid="comfort-chart-plot"
      class={`plotly-panel h-full w-full min-w-0 max-w-full ${chartHeightStyle ? "" : heightClass}`}
      style={chartHeightStyle}
      bind:this={chartElement}
    ></div>
  </div>

  {#if chartError}
    <p
      class="absolute inset-0 flex items-center justify-center bg-white/92 p-6 text-sm text-red-600"
    >
      {chartError}
    </p>
  {:else if !chartResult}
    <p
      class="absolute inset-0 flex items-center justify-center bg-white/92 p-6 text-sm text-stone-500"
    >
      {isLoading ? "Calculating chart..." : emptyMessage}
    </p>
  {:else if isLoading && !hasRenderedChart}
    <p
      class="absolute inset-0 flex items-center justify-center bg-white/75 p-6 text-sm text-stone-500"
    >
      Rendering chart...
    </p>
  {/if}
</figure>
