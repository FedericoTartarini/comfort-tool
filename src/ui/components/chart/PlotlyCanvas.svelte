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
  } from "../../../charts/plotlyExport";
  import type { PublicationColumn } from "../../../charts/chartTheme";
  import type { ChartHoverProbe } from "../../../engines/comfort/charts/chartBuildResult";
  import {
    createFieldHoverProbeTrace,
    findProbeTraceIndex,
    nativeHoverSkipTraceIndices,
    plotDisplayCoordinates,
    probeRestyleAttributes,
    type PlotlyGraphDiv,
  } from "./plotlyFieldHover";

  interface Props {
    chartResult: ChartPayload | null;
    isLoading: boolean;
    emptyMessage: string;
    heightClass?: string;
    showPlotTitle?: boolean;
    hoverProbe?: ChartHoverProbe;
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
    hoverProbe = undefined,
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

  let activeHoverProbe: ChartHoverProbe | undefined;
  let hoverGeneration = 0;
  let pointerRaf = 0;
  let pendingPointer: PointerEvent | null = null;

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
    const zoneCount = "zones" in input && input.zones ? input.zones.length : 0;
    const regionCount = "regions" in input && input.regions ? input.regions.length : 0;
    return `${payload.type}:${fillCount}:${seriesCount}:${curveCount}:${regionCount}:${zoneCount}`;
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

  async function attachHoverProbeTrace(
    plotly: PlotlyModule,
    gd: PlotlyGraphDiv,
  ) {
    if (findProbeTraceIndex(gd) < 0) {
      if (plotly.addTraces) {
        await plotly.addTraces(gd, createFieldHoverProbeTrace());
      } else {
        const currentData = gd.data ?? [];
        await plotly.react(
          gd,
          [...currentData, createFieldHoverProbeTrace()],
          (gd as HTMLElement & { layout?: Record<string, unknown> }).layout ?? {},
          { responsive: true, displaylogo: false, displayModeBar: "hover" },
        );
      }
    }
    const skipIndices = nativeHoverSkipTraceIndices(gd);
    if (skipIndices.length > 0 && plotly.restyle) {
      // Field hover follows the pointer; do not let Compare markers steal closest hover.
      await plotly.restyle(gd, { hoverinfo: "skip" }, skipIndices);
    }
  }

  async function hideProbe(
    plotly: PlotlyModule,
    gd: PlotlyGraphDiv,
    probeIndex: number,
  ) {
    if (!plotly.restyle) return;
    await plotly.restyle(gd, { x: [[null]], y: [[null]] }, [probeIndex]);
  }

  async function driveHoverProbe(event: PointerEvent) {
    const gd = chartElement as PlotlyGraphDiv | null;
    const plotly = plotlyModule;
    const probe = activeHoverProbe;
    if (!gd || !plotly?.restyle || !plotly.Fx || !probe) return;

    const coords = plotDisplayCoordinates(gd, event.clientX, event.clientY);
    let probeIndex = findProbeTraceIndex(gd);
    if (probeIndex < 0) {
      await attachHoverProbeTrace(plotly, gd);
      probeIndex = findProbeTraceIndex(gd);
    }
    if (probeIndex < 0) return;

    const generation = (hoverGeneration += 1);

    if (!coords) {
      await hideProbe(plotly, gd, probeIndex);
      if (generation !== hoverGeneration) return;
      plotly.Fx.unhover(gd);
      return;
    }

    const hit = probe.probeDisplay(coords.xDisplay, coords.yDisplay);
    if (!hit) {
      await hideProbe(plotly, gd, probeIndex);
      if (generation !== hoverGeneration) return;
      plotly.Fx.unhover(gd);
      return;
    }

    await plotly.restyle(
      gd,
      probeRestyleAttributes(coords.xDisplay, coords.yDisplay, hit),
      [probeIndex],
    );
    if (generation !== hoverGeneration) return;
    plotly.Fx.hover(gd, [{ curveNumber: probeIndex, pointNumber: 0 }]);
  }

  function onPointerMove(event: PointerEvent) {
    if (!activeHoverProbe) return;
    pendingPointer = event;
    if (pointerRaf !== 0) return;
    pointerRaf = requestAnimationFrame(() => {
      pointerRaf = 0;
      const latest = pendingPointer;
      pendingPointer = null;
      if (latest) void driveHoverProbe(latest);
    });
  }

  function onPointerLeave() {
    pendingPointer = null;
    if (pointerRaf !== 0) {
      cancelAnimationFrame(pointerRaf);
      pointerRaf = 0;
    }
    const gd = chartElement as PlotlyGraphDiv | null;
    const plotly = plotlyModule;
    if (!gd || !plotly?.Fx) return;
    const probeIndex = findProbeTraceIndex(gd);
    if (probeIndex >= 0) void hideProbe(plotly, gd, probeIndex);
    plotly.Fx.unhover(gd);
  }

  async function drawChart() {
    activeHoverProbe = hoverProbe;
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
      const data = figure.data;
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
            data,
            layout,
            config,
            updateType === "dot" ? 400 : 500,
          );
          if (hoverProbe) {
            await attachHoverProbeTrace(plotly, chartElement as PlotlyGraphDiv);
          }
          prevChartResult = chartResult;
          return;
        }
      }

      chartError = "";
      await plotly.react(chartElement, data, layout, config);
      if (hoverProbe) {
        await attachHoverProbeTrace(plotly, chartElement as PlotlyGraphDiv);
      }
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
    chartElement?.addEventListener("pointermove", onPointerMove);
    chartElement?.addEventListener("pointerleave", onPointerLeave);
    if (onRegisterExport) onRegisterExport(exportChart);
    return () => {
      chartElement?.removeEventListener("pointermove", onPointerMove);
      chartElement?.removeEventListener("pointerleave", onPointerLeave);
      if (pointerRaf !== 0) cancelAnimationFrame(pointerRaf);
      resizeObserver?.disconnect();
      resizeObserver = null;
      if (chartElement) void destroy(chartElement);
    };
  });

  $effect(() => {
    chartResult;
    hoverProbe;
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
