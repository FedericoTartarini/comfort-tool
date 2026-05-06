<script lang="ts">
  /**
   * @component
   * The primary container for comfort tool visualizations.
   * Orchestrates the display of the chart canvas, header information, axis selection,
   * legends, and export controls.
   */
  import { Card, Heading, Toggle } from "flowbite-svelte";
  import PlotlyCanvas from "./PlotlyCanvas.svelte";
  import ChartExportMenu from "./ChartExportMenu.svelte";
  import ChartAxisMenu from "./ChartAxisMenu.svelte";
  import ChartLegend from "./ChartLegend.svelte";
  import { ChartId, type ChartId as ChartIdType } from "../../models/chartOptions";
  import type { PlotlyChartResponseDto } from "../../models/comfortDtos";

  let {
    title,
    description,
    chartResult,
    isLoading,
    emptyMessage,
    heightClass,
    chartOptions,
    selectedChart,
    onSelectChart,
    dynamicXAxis,
    dynamicYAxis,
    onSelectXAxis,
    onSelectYAxis,
    dynamicAxisOptions,
    baselineInputId,
    onSelectBaselineInput,
    visibleInputIds = [],
    compareEnabled = false,
    embedded = false,
  }: {
    title: string;
    description: string;
    chartResult: PlotlyChartResponseDto | null;
    isLoading: boolean;
    emptyMessage: string;
    heightClass: string;
    chartOptions: Array<{ name: string; value: ChartIdType }>;
    selectedChart: ChartIdType;
    onSelectChart: (chartId: ChartIdType) => void;
    dynamicXAxis?: string;
    dynamicYAxis?: string;
    onSelectXAxis?: (fieldKey: string) => void;
    onSelectYAxis?: (fieldKey: string) => void;
    dynamicAxisOptions?: string[];
    baselineInputId?: string;
    onSelectBaselineInput?: (inputId: string) => void;
    visibleInputIds?: string[];
    compareEnabled?: boolean;
    embedded?: boolean;
  } = $props();

  let exportChart: ((type: "png" | "svg") => void) | undefined =
    $state(undefined);
  let showZones = $state(true);

  // Reset zone visibility whenever the active chart changes.
  $effect(() => {
    selectedChart;
    showZones = true;
  });

  // Disable dynamic axis selection for heat index, humidex, and wind chill dynamic charts
  const lockYAxis = $derived(
    ([
      ChartId.HeatIndexDynamic,
      ChartId.HumidexDynamic,
      ChartId.WindChillDynamic,
    ] as ChartIdType[]).includes(selectedChart),
  );
</script>

{#snippet content()}
  <header class="flex items-start justify-between gap-4">
    <div class="min-w-0">
      {#if title}
        <Heading tag="h3" class="text-sm font-semibold text-stone-900"
          >{title}</Heading
        >
      {/if}
      {#if description}
        <p class="mt-1 text-xs text-stone-500">{description}</p>
      {/if}
    </div>

    <div class="flex flex-wrap items-center justify-end gap-2 pr-[24px]">
      {#if (compareEnabled || ([ChartId.PmvDynamic, ChartId.UtciDynamic, ChartId.AdaptiveDynamic, ChartId.HeatIndexDynamic, ChartId.HumidexDynamic, ChartId.WindChillDynamic] as ChartIdType[]).includes(selectedChart)) && baselineInputId && onSelectBaselineInput}
        <ChartAxisMenu
          {dynamicXAxis}
          {dynamicYAxis}
          axisOptions={dynamicAxisOptions}
          {baselineInputId}
          {onSelectBaselineInput}
          {visibleInputIds}
          {compareEnabled}
          {onSelectXAxis}
          {onSelectYAxis}
          {lockYAxis}
        />
      {/if}
      <div class="flex items-center gap-1.5">
        <span class="text-xs font-medium text-stone-500">Chart:</span>
        <ChartExportMenu
          {chartOptions}
          {selectedChart}
          activeChartId={selectedChart}
          {onSelectChart}
          onExport={(type) => exportChart?.(type)}
        />
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-xs font-medium text-stone-500">Zones:</span>
        <Toggle
          checked={showZones}
          onchange={(e) => (showZones = e.currentTarget.checked)}
          color="teal"
          size="small"
        />
      </div>
    </div>
  </header>

  <div
    class={`mt-4 ${heightClass} relative overflow-hidden rounded-lg bg-stone-50/50`}
  >
    <PlotlyCanvas
      {chartResult}
      {isLoading}
      {emptyMessage}
      {heightClass}
      {showZones}
      onRegisterExport={(handler) => (exportChart = handler)}
    />
  </div>

  <ChartLegend {selectedChart} />
{/snippet}

{#if embedded}
  <div class="mt-4 border-t border-stone-200 pt-4">
    {@render content()}
  </div>
{:else}
  <Card size="none" class="w-full border-stone-300 p-4 shadow-sm">
    {@render content()}
  </Card>
{/if}
