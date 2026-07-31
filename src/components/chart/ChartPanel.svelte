<script lang="ts">
  /**
   * @component
   * Renders a configurable chart panel with support for dynamic axis selection,
   * multiple export formats, and integrated loading states.
   */
  import { Toggle } from "flowbite-svelte";
  import PlotlyCanvas from "./PlotlyCanvas.svelte";
  import ChartExportMenu from "./ChartExportMenu.svelte";
  import ChartControls from "./ChartControls.svelte";
  import ChartModeControl from "./ChartModeControl.svelte";
  import ChartLegend from "./ChartLegend.svelte";
  import { chartMetaById, type ChartId as ChartIdType } from "../../models/chartOptions";
  import type { PlotlyChartResponseDto } from "../../models/comfortDtos";
  import type { ComfortModel as ComfortModelType } from "../../models/comfortModels";
  import type { ChartControlsViewModel } from "../../state/comfortTool/types";

  interface Props {
    chartResult: PlotlyChartResponseDto | null;
    isLoading: boolean;
    emptyMessage: string;
    heightClass: string;
    chartOptions: Array<{ name: string; value: ChartIdType }>;
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
    emptyMessage,
    heightClass,
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
  const chartPanelIdPrefix = `chart-panel-${Math.random().toString(36).slice(2, 10)}`;

  // Reset zone visibility whenever the active chart changes.
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
  const showZonesToggle = $derived(
    !!chartMetaById[selectedChart].hasZoneVisibilityToggle,
  );
</script>

<div
  class="mt-4 border-t border-stone-200 pt-4"
  data-testid="comfort-chart-panel"
>
  <header class="flex items-start justify-between gap-4">
    <ChartModeControl control={chartControls.mode} />
    <div class="flex flex-wrap items-center justify-end gap-2 pr-[24px]">
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
          {selectedChart}
          activeChartId={selectedChart}
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
        {emptyMessage}
        {heightClass}
        {showZones}
        onRegisterExport={(handler) => (exportChart = handler)}
      />
    </div>

    <ChartLegend zones={legendZones} {legendTitle} />
  </div>
</div>
