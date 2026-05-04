<svelte:options runes={true} />

<script lang="ts">
  /**
   * @component
   * A wrapper for Plotly.js that provides chart rendering with marker/dot animations.
   * Uses Web Animations API for dot transitions, as native plotly animation causes flickering.
   * Includes tools for exporting charts as PNG or SVG images.
   */
  import { onMount, tick } from "svelte";

  import { toPlotlyFigure } from "../../services/plotlyFigure";

  // Component properties
  let {
    chartResult,
    isLoading,
    emptyMessage,
    heightClass = "h-[420px]",
    showPlotTitle = false,
    onRegisterExport = undefined,
  } = $props();

  // Component state
  let chartElement = $state<HTMLDivElement | null>(null);
  let plotlyModule = $state<{
    // React renders the chart in the given element
    react: (
      // The element to render the chart in
      root: HTMLDivElement,
      // The data to render
      data: unknown[],
      // The layout to render
      layout: object,
      // The config to render
      config: object,
    ) => Promise<void>;
    // Purge removes the chart from the given element
    purge: (root: HTMLDivElement) => void;
    // Download the chart as an image
    downloadImage: (
      // The element to download the chart from
      root: HTMLDivElement,
      // The options for the download
      options: Record<string, unknown>,
    ) => Promise<void>;
  } | null>(null);

  // Boolean state to track if the chart has been rendered
  let hasRenderedChart = $state(false);
  // String state to track errors
  let chartError = $state("");
  // Derived state to calculate the height style for the chart
  let chartHeightStyle = $derived(
    // If the chart result has a layout with a height greater than 0, use it. Else, use the default height class.
    chartResult?.layout?.height && chartResult.layout.height > 0
      ? `height: ${chartResult.layout.height}px;`
      : undefined,
  );

  // Asynchronously load the Plotly.js library
  async function loadPlotly() {
    // Return the module if it has already been loaded
    if (plotlyModule) {
      return plotlyModule;
    }
    // Dynamically import the Plotly.js library
    const importedModule = await import("plotly.js-dist-min");
    // Assign the module to plotlyModule state variable as the plotly module type
    plotlyModule = (importedModule.default ??
      importedModule) as typeof plotlyModule;
    // Return the module
    return plotlyModule;
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  // Get the export filename from the chart title
  function getExportFilename() {
    // Get the chart title, or use the default filename if no title is provided
    const titleText =
      chartResult?.layout?.title?.trim() || "cbe-thermal-comfort-chart";
    // Return the sanitized title as the filename
    return (
      titleText
        .toLowerCase()
        // Remove any characters that are not alphanumeric
        .replace(/[^a-z0-9]+/g, "-")
        // Remove any leading or trailing hyphens
        .replace(/^-+|-+$/g, "") || "cbe-thermal-comfort-chart"
    );
  }

  // Export the chart as an image
  async function exportChart(format: "png" | "svg") {
    // Return if the chart element or result is not available
    if (!chartElement || !chartResult) return;
    // Try to export the chart
    try {
      // Load the Plotly.js library
      const plotly = await loadPlotly();
      // Download the chart as an image
      await plotly.downloadImage(chartElement, {
        // Set the format to png or svg
        format,
        // Set the filename
        filename: getExportFilename(),
        // Set the scale to 2 (double image size/quality) for png format, or leave as default for svg format.
        ...(format === "png" ? { scale: 2 } : {}),
      });
    } catch (error) {
      // Set the error message
      chartError =
        error instanceof Error ? error.message : "Chart export failed.";
    }
  }

  // ── Transition classification ────────────────────────────────────────────────

  // Create a signature of the background traces in order to detect any changes in them,
  // which helps us decide whether to play a smooth transition.
  function backgroundSignature(traces: Array<{ type: string }>): string {
    return (
      traces
        // Filter out scatter traces (the dots we animate)
        .filter((t) => t.type !== "scatter")
        // Get the type of each background trace
        .map((t) => t.type)
        // Join the types into a string
        .join(",")
    );
  }

  // Classify the type (dot, background, or full) of update based on the changes in the chart.
  function classifyUpdate(
    prev: { layout: { title: string }; traces: Array<{ type: string }> },
    next: { layout: { title: string }; traces: Array<{ type: string }> },
  ): "dot" | "background" | "full" {
    // If the title has changed, it's a full update.
    if (prev.layout.title !== next.layout.title) return "full";
    // If the background signature has changed, it's a background update.
    if (backgroundSignature(prev.traces) !== backgroundSignature(next.traces))
      return "background";
    // Otherwise, it's just a dot update.
    return "dot";
  }

  // ── Dot animation ────────────────────────────────────────────────────────────

  // Animates scatter marker dots using WAAPI.
  async function animateDots(
    // The Plotly.js module
    plotly: NonNullable<typeof plotlyModule>,
    // The figure to animate
    figure: { data: unknown[]; layout: object; config: object },
    // The duration of the animation in milliseconds
    durationMs: number,
  ): Promise<void> {
    // Return if the chart element is not available
    if (!chartElement) return;

    // Snapshot current marker positions before the chart update.
    const firstRects = Array.from(
      // Get all scatter marker elements
      chartElement.querySelectorAll<SVGPathElement>(".scatterlayer path.point"),
      // Map each element to its bounding rectangle
    ).map((el) => el.getBoundingClientRect());

    // Update the chart. All traces render at their final correct state.
    // Do not include a transition in the layout here because we want an instant teleport that we then animate manually.
    await plotly.react(chartElement, figure.data, figure.layout, figure.config);

    // Return if no markers were found
    if (firstRects.length === 0) return;

    // Query marker elements after react() (they may be new instances).
    const lastEls = Array.from(
      // Get all scatter marker elements
      chartElement.querySelectorAll<SVGPathElement>(".scatterlayer path.point"),
    );

    // If the number of markers changed (e.g. trace added/removed), simple index mapping is unreliable.
    // Skip animation in this case.
    if (lastEls.length !== firstRects.length) return;

    // For each marker, animate from its old pixel position to its new one.
    lastEls.forEach((el, i) => {
      // Get the current bounding rectangle of the marker
      const lastRect = el.getBoundingClientRect();
      // Calculate the difference between the old and new positions
      const dx = firstRects[i].left - lastRect.left;
      const dy = firstRects[i].top - lastRect.top;

      // Skip if the movement is sub-pixel (static point).
      if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) return;

      // Use the CSS 'translate' property instead of 'transform'.
      // Plotly often uses the 'transform' attribute or style for positioning.
      // The 'translate' property is independent and additive to 'transform',
      // so it won't override Plotly's positioning logic.
      el.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0px 0px" }], {
        duration: durationMs,
        easing: "ease-in-out",
        fill: "none",
      });
    });
  }

  // ── Rendering ────────────────────────────────────────────────────────────────

  // Stores the previous chart data to determine the animation type (dots vs. full redraw), initialized to null.
  let prevChartResult: typeof chartResult | null = null;

  // Render the chart to the canvas.
  async function renderChart() {
    // Return if the chart result is not available
    if (!chartResult) {
      // Reset the hasRenderedChart flag and chartError
      hasRenderedChart = false;
      chartError = "";
      prevChartResult = null;
      return;
    }
    // Wait for the next tick to ensure the chart element is available
    if (!chartElement) await tick();
    // Return if the chart element is still not available
    if (!chartElement) return;

    try {
      // Load the Plotly.js library
      const plotly = await loadPlotly();
      // Deep clone the chart result to avoid mutating the original data.
      const chartPayload = JSON.parse(JSON.stringify(chartResult));
      // Convert the chart payload to a Plotly figure.
      const figure = toPlotlyFigure(chartPayload);
      // Hide the plot title if the showPlotTitle flag is false.
      if (!showPlotTitle) {
        // Set the plot title to undefined
        figure.layout.title = undefined;
        // Adjust the top margin if it is a number, to prevent the title from overlapping with the chart's border.
        if (typeof figure.layout.margin?.t === "number") {
          // Set the top margin to 24px or the current top margin minus 24px, whichever is greater
          figure.layout.margin.t = Math.max(24, figure.layout.margin.t - 24);
        }
      }

      // If the chart has been rendered before and the previous chart result is available,
      // determine the type of update and animate the dots accordingly.
      if (hasRenderedChart && prevChartResult) {
        // Determine the type of update.
        const updateType = classifyUpdate(prevChartResult, chartResult);

        // If the scatter trace data has changed, animate the dots with a shorter duration.
        if (updateType === "dot") {
          await animateDots(plotly, figure, 400);
          // Update the previous chart result
          prevChartResult = chartResult;
          // Return to prevent instant react() below
          return;
        }

        // If the background traces have changed, animate the dots with a longer duration.
        if (updateType === "background") {
          await animateDots(plotly, figure, 500);
          // Update the previous chart result
          prevChartResult = chartResult;
          // Return to prevent instant react() below
          return;
        }

        // If the title has changed, fall through to instant react() below.
      }

      // Clear the error message
      chartError = "";
      // Update the chart with the new figure
      await plotly.react(
        chartElement,
        figure.data,
        figure.layout,
        figure.config,
      );
      // Set the hasRenderedChart flag to true
      hasRenderedChart = true;
      // Update the previous chart result
      prevChartResult = chartResult;
    } catch (error) {
      // Set the hasRenderedChart flag to false
      hasRenderedChart = false;
      // Set the chart error message
      chartError =
        error instanceof Error ? error.message : "Chart rendering failed.";
    }
  }

  onMount(() => {
    // Render the chart
    void renderChart();
    // Register the export function if it is provided
    if (onRegisterExport) onRegisterExport(exportChart);
    return () => {
      // Purge the chart element if it is available
      if (chartElement && plotlyModule) plotlyModule.purge(chartElement);
    };
  });

  // Use $effect() to re-render the chart when the chart result changes.
  $effect(() => {
    // Re-render the chart when the chart result changes.
    chartResult;
    // Register the export function if it is provided
    if (onRegisterExport) onRegisterExport(exportChart);
    // Render the chart
    void renderChart();
  });
</script>

<!-- HTML Template -->
<figure class="relative mt-2 min-w-0">
  <section class="w-full overflow-hidden bg-white">
    <div
      class={`plotly-panel h-full w-full min-w-0 max-w-full ${chartHeightStyle ? "" : heightClass}`}
      style={chartHeightStyle}
      bind:this={chartElement}
    ></div>
  </section>

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
