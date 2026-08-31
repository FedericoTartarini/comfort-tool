<script lang="ts">
  import PlotlyChartCard from "./PlotlyChartCard.svelte";
  import ChartExportMenu from "./ChartExportMenu.svelte";
  import ChartControls from "./ChartControls.svelte";
  import ChartProfileBadge from "./ChartProfileBadge.svelte";
  import ChartLegend from "./ChartLegend.svelte";
  import type { ChartPayload } from "../../../charts/types";
  import type { ChartHoverProbe } from "../../../engines/comfort/charts/chartBuildResult";
  import type { ChartInstancePanelView } from "../../../state/pointSession/chartInstancePresentation";
  import type { ChartControlsViewModel } from "../../../state/pointSession/types";
  import type { PublicationExportHandler } from "../../../charts/plotlyExport";

  interface Props {
    chartResult: ChartPayload | null;
    isLoading: boolean;
    chartInstance: ChartInstancePanelView;
    chartInstances: readonly ChartInstancePanelView[];
    selectedChartInstanceId: string;
    onSelectChartInstance: (instanceId: string) => void;
    chartControls: ChartControlsViewModel;
    legendZones: ReadonlyArray<{ label: string; color: string }> | null;
    legendTitle: string;
    hoverProbe?: ChartHoverProbe;
  }

  let {
    chartResult,
    isLoading,
    chartInstance,
    chartInstances,
    selectedChartInstanceId,
    onSelectChartInstance,
    chartControls,
    legendZones,
    legendTitle,
    hoverProbe,
  }: Props = $props();

  let exportChart: PublicationExportHandler | undefined = $state(undefined);
  const heightClass = "h-[480px] xl:h-[480px]";
  const chartPanelIdPrefix = `chart-panel-${Math.random().toString(36).slice(2, 10)}`;

  const showChartControls = $derived(
    chartControls.baseline !== null ||
      chartControls.axes !== null ||
      chartControls.explore !== null,
  );
  const controlsIdPrefix = $derived(
    `${chartPanelIdPrefix}-${selectedChartInstanceId}`,
  );
</script>

<div
  class="mt-4 border-t border-stone-200 pt-4"
  data-testid="comfort-chart-panel"
>
  <header
    class="grid min-w-0 gap-x-4 gap-y-2 lg:grid-cols-[max-content_minmax(0,1fr)]"
    data-testid="chart-header"
  >
    <ChartProfileBadge control={chartControls.profileBadge} />
    <p
      class="min-w-0 text-xs leading-5 text-stone-600 lg:col-span-2 lg:row-start-2"
      data-testid="chart-profile-caption"
    >
      {chartControls.profileBadge.caption}
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
          {chartInstances}
          currentChart={chartInstance}
          selectedChartInstanceId={selectedChartInstanceId}
          onSelectChartInstance={onSelectChartInstance}
          onExport={(format, column) => exportChart?.(format, column)}
        />
      </div>
    </div>
  </header>

  <div class="mt-4">
    <PlotlyChartCard
      chartResult={chartResult}
      isLoading={isLoading}
      emptyMessage={chartInstance.emptyMessage}
      heightClass={heightClass}
      testId="comfort-chart-visual"
      hoverProbe={hoverProbe}
      onRegisterExport={(handler) => (exportChart = handler)}
    />

    {#if chartInstance.showsLegend}
      <ChartLegend zones={legendZones} {legendTitle} />
    {/if}
  </div>
</div>
