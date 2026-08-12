<script lang="ts">
  import { Toggle } from "flowbite-svelte";
  import PlotlyCanvas from "./PlotlyCanvas.svelte";
  import ChartExportMenu from "./ChartExportMenu.svelte";
  import ChartControls from "./ChartControls.svelte";
  import ChartModeControl from "./ChartModeControl.svelte";
  import ChartLegend from "./ChartLegend.svelte";
  import type {
    ChartId as ChartIdType,
    ModelChartDefinition,
  } from "../../models/chartOptions";
  import type { PlotlyChartResponseDto } from "../../models/comfortDtos";
  import type { ComfortModel as ComfortModelType } from "../../models/comfortModels";
  import type { ChartControlsViewModel } from "../../state/comfortTool/types";

  interface Props {
    chartResult: PlotlyChartResponseDto | null;
    isLoading: boolean;
    chartDefinition: ModelChartDefinition;
    chartOptions: readonly ModelChartDefinition[];
    selectedChart: ChartIdType;
    selectedModel: ComfortModelType;
    onSelectChart: (chartId: ChartIdType) => void;
    chartControls: ChartControlsViewModel;
    legendZones: ReadonlyArray<{ label: string; color: string }> | null;
    legendTitle: string;
  }

  let {
    chartResult,
    isLoading,
    chartDefinition,
    chartOptions,
    selectedChart,
    selectedModel,
    onSelectChart,
    chartControls,
    legendZones,
    legendTitle,
  }: Props = $props();

  let exportChart: ((type: "png" | "svg") => void) | undefined =
    $state(undefined);
  let showZones = $state(true);
  const heightClass = "h-[480px] xl:h-[480px]";
  const chartPanelIdPrefix = `chart-panel-${Math.random().toString(36).slice(2, 10)}`;

  $effect(() => {
    selectedChart;
    showZones = true;
  });

  const showChartControls = $derived(
    chartControls.baseline !== null ||
      chartControls.axes !== null ||
      chartControls.explore !== null,
  );
  const controlsIdPrefix = $derived(
    `${chartPanelIdPrefix}-${selectedModel}-${selectedChart}`,
  );
  const showZonesToggle = $derived(chartDefinition.showsZoneToggle);
</script>

<div
  class="mt-4 border-t border-stone-200 pt-4"
  data-testid="comfort-chart-panel"
>
  <header
    class="grid min-w-0 gap-x-4 gap-y-2 lg:grid-cols-[max-content_minmax(0,1fr)]"
    data-testid="chart-header"
  >
    <ChartModeControl control={chartControls.mode} />
    <p
      class="min-w-0 text-xs leading-5 text-stone-600 lg:col-span-2 lg:row-start-2"
      data-testid="chart-mode-caption"
    >
      {chartControls.mode.caption}
    </p>
    <div
      class="flex min-w-0 flex-wrap items-center gap-2 lg:col-start-2 lg:row-start-1 lg:justify-end"
      data-testid="chart-toolbar"
    >
      {#if showChartControls}
        <ChartControls
          idPrefix={controlsIdPrefix}
          controls={chartControls}
        />
      {/if}
      <div class="flex items-center gap-1.5">
        <span class="text-xs font-medium text-stone-500">Chart:</span>
        <ChartExportMenu
          {chartOptions}
          currentChart={chartDefinition}
          {selectedChart}
          {onSelectChart}
          onExport={(type) => exportChart?.(type)}
        />
      </div>
      {#if showZonesToggle}
        <div class="flex items-center gap-1.5">
          <span class="text-xs font-medium text-stone-500">Zones:</span>
          <Toggle
            checked={showZones}
            onchange={(e) => (showZones = e.currentTarget.checked)}
            color="teal"
            size="small"
          />
        </div>
      {/if}
    </div>
  </header>

  <div class="mt-4 min-w-0" data-testid="comfort-chart-visual">
    <div
      class={`${heightClass} relative overflow-hidden rounded-lg bg-stone-50/50`}
    >
      <PlotlyCanvas
        {chartResult}
        {isLoading}
        emptyMessage={chartDefinition.emptyMessage}
        {heightClass}
        {showZones}
        onRegisterExport={(handler) => (exportChart = handler)}
      />
    </div>

    {#if chartDefinition.showsLegend}
      <ChartLegend zones={legendZones} {legendTitle} />
    {/if}
  </div>
</div>
