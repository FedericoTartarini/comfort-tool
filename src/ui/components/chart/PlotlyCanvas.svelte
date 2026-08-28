<svelte:options runes={true} />

<script lang="ts">
  import { onMount, tick } from "svelte";

  import {
    assembleChart,
    destroy,
    loadPlotly,
    prepareFigure,
    type PlotlyModule,
  } from "../../../charts";
  import type { ChartPayload } from "../../../charts/types";
  import {
    downloadPublicationChart,
    type ChartExportFormat,
    type PublicationExportHandler,
  } from "../../../engines/plotlyExport";
  import type { PublicationColumn } from "../../../engines/chartTheme";

  interface Props {
    chartResult: ChartPayload | null;
    isLoading: boolean;
    emptyMessage: string;
    heightClass?: string;
    showPlotTitle?: boolean;
    onRegisterExport?:
      | ((handler: PublicationExportHandler) => void)
      | undefined;
  }

  let {
    chartResult,
    isLoading,
    emptyMessage,
    heightClass = "h-[420px]",
    showPlotTitle = false,
    onRegisterExport = undefined,
  }: Props = $props();

  let chartElement = $state<HTMLDivElement | null>(null);
  let plotlyModule = $state<PlotlyModule | null>(null);
  let resizeObserver: ResizeObserver | null = null;

  let hasRenderedChart = $state(false);
  let chartError = $state("");
  let chartHeightStyle = $derived(
    chartResult?.input.height && chartResult.input.height > 0
      ? `height: ${chartResult.input.height}px;`
      : undefined,
  );

  async function exportChart(
    format: ChartExportFormat,
    column: PublicationColumn,
  ) {
    if (!chartResult) return;
    try {
      const plotly = await loadPlotly();
      await downloadPublicationChart(
        plotly,
        chartResult,
        format,
        column,
      );
    } catch (error) {
      chartError =
        error instanceof Error ? error.message : "Chart export failed.";
    }
  }

  function backgroundSignature(payload: ChartPayload): string {
    const input = payload.input;
    const fillCount = "fills" in input && input.fills ? input.fills.length : 0;
    const seriesCount = "series" in input && input.series ? input.series.length : 0;
    const curveCount = "curves" in input && input.curves ? input.curves.length : 0;
    const regionCount = "regions" in input && input.regions ? input.regions.length : 0;
    return `${payload.type}:${fillCount}:${seriesCount}:${curveCount}:${regionCount}`;
  }

  function classifyUpdate(
    prev: ChartPayload,
    next: ChartPayload,
  ): "dot" | "background" | "full" {
    if (prev.input.title !== next.input.title) return "full";
    if (prev.type !== next.type) return "full";
    if (backgroundSignature(prev) !== backgroundSignature(next)) return "background";
    return "dot";
  }

  async function animateDots(
    plotly: PlotlyModule,
    data: unknown[],
    layout: Record<string, unknown>,
    config: Record<string, unknown>,
    durationMs: number,
  ): Promise<void> {
    if (!chartElement) return;

    const firstRects = Array.from(
      chartElement.querySelectorAll<SVGPathElement>(".scatterlayer path.point"),
    ).map((el) => el.getBoundingClientRect());

    await plotly.react(chartElement, data, layout, config);

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

      el.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0px 0px" }], {
        duration: durationMs,
        easing: "ease-in-out",
        fill: "none",
      });
    });
  }

  let prevChartResult: ChartPayload | null = null;

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

  async function drawChart() {
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
      plotlyModule = plotly;
      const assembled = assembleChart(chartResult);
      const figure = prepareFigure(assembled);
      const layout = showPlotTitle
        ? figure.layout
        : { ...figure.layout, title: undefined };
      const config = {
        responsive: true,
        displaylogo: false,
        displayModeBar: "hover" as const,
      };

      if (hasRenderedChart && prevChartResult) {
        const updateType = classifyUpdate(prevChartResult, chartResult);

        if (updateType === "dot" || updateType === "background") {
          await animateDots(
            plotly,
            figure.data,
            layout,
            config,
            updateType === "dot" ? 400 : 500,
          );
          prevChartResult = chartResult;
          return;
        }
      }

      chartError = "";
      await plotly.react(chartElement, figure.data, layout, config);
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
    void drawChart();
    if (onRegisterExport) onRegisterExport(exportChart);
    return () => {
      resizeObserver?.disconnect();
      resizeObserver = null;
      if (chartElement) void destroy(chartElement);
    };
  });

  $effect(() => {
    chartResult;
    if (onRegisterExport) onRegisterExport(exportChart);
    void drawChart();
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
