<script lang="ts">
  /**
   * @component
   * Renders a configurable chart panel with support for dynamic axis selection,
   * multiple export formats, and integrated loading states.
   */
  import { Card, Heading, Toggle } from "flowbite-svelte";
  import PlotlyCanvas from "./PlotlyCanvas.svelte";
  import ChartExportMenu from "./ChartExportMenu.svelte";
  import ChartAxisMenu from "./ChartAxisMenu.svelte";
  import ChartLegend from "./ChartLegend.svelte";
  import {
    ChartId,
    chartMetaById,
    type ChartId as ChartIdType,
  } from "../../models/chartOptions";
  import type { PlotlyChartResponseDto } from "../../models/comfortDtos";
  import type { ComfortModel as ComfortModelType } from "../../models/comfortModels";
  import type { FieldKey as FieldKeyType } from "../../models/fieldKeys";
  import type { InputId as InputIdType } from "../../models/inputSlots";
  import type {
    ExploreFieldChartConfig,
    ModelOutput,
    ModelOutputKey,
    NumericBand,
  } from "../../models/modelCapabilities";
  import type { UnitSystem as UnitSystemType } from "../../models/units";

  interface Props {
    title: string;
    description: string;
    chartResult: PlotlyChartResponseDto | null;
    isLoading: boolean;
    emptyMessage: string;
    heightClass: string;
    chartOptions: Array<{ name: string; value: ChartIdType }>;
    selectedChart: ChartIdType;
    selectedModel: ComfortModelType;
    onSelectChart: (chartId: ChartIdType) => void;
    dynamicXAxis?: FieldKeyType;
    dynamicYAxis?: FieldKeyType;
    onSelectXAxis?: (fieldKey: FieldKeyType) => void;
    onSelectYAxis?: (fieldKey: FieldKeyType) => void;
    dynamicXAxisOptions?: FieldKeyType[];
    dynamicYAxisOptions?: FieldKeyType[];
    baselineInputId?: InputIdType;
    onSelectBaselineInput?: (inputId: InputIdType) => void;
    visibleInputIds?: InputIdType[];
    compareEnabled?: boolean;
    embedded?: boolean;
    lockYAxis?: boolean;
    legendZones?: ReadonlyArray<{ label: string; color: string }> | null;
    legendTitle?: string;
    fieldChartConfig?: ExploreFieldChartConfig | null;
    chartableOutputs?: readonly ModelOutput[];
    defaultBands?: readonly NumericBand[];
    unitSystem: UnitSystemType;
    onSelectOutput?: (outputKey: ModelOutputKey) => void;
    onApplyBands?: (bands: readonly NumericBand[]) => boolean | void;
  }

  let {
    title,
    description,
    chartResult,
    isLoading,
    emptyMessage,
    heightClass,
    chartOptions,
    selectedChart,
    selectedModel,
    onSelectChart,
    dynamicXAxis,
    dynamicYAxis,
    onSelectXAxis,
    onSelectYAxis,
    dynamicXAxisOptions,
    dynamicYAxisOptions,
    baselineInputId,
    onSelectBaselineInput,
    visibleInputIds = [],
    compareEnabled = false,
    embedded = false,
    lockYAxis = false,
    legendZones = null,
    legendTitle = "",
    fieldChartConfig = null,
    chartableOutputs = [],
    defaultBands = [],
    unitSystem,
    onSelectOutput,
    onApplyBands,
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

  // Disable dynamic axis selection based on the currently selected chart's metadata properties (disabled when lockYAxis is true)
  const isDynamicChart = $derived(!!chartMetaById[selectedChart]?.isDynamic);
  const showAxisMenu = $derived(
    (compareEnabled || isDynamicChart) &&
      !!baselineInputId &&
      !!onSelectBaselineInput,
  );
  const axisMenuIdPrefix = $derived(
    `${chartPanelIdPrefix}-${selectedModel}-${selectedChart}`,
  );
  // The psychrometric chart is the only current chart with a user-toggleable zone layer.
  const showZonesToggle = $derived(selectedChart === ChartId.Psychrometric);
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
      {#if showAxisMenu}
        <ChartAxisMenu
          idPrefix={axisMenuIdPrefix}
          {dynamicXAxis}
          {dynamicYAxis}
          {dynamicXAxisOptions}
          {dynamicYAxisOptions}
          {baselineInputId}
          {onSelectBaselineInput}
          {visibleInputIds}
          {compareEnabled}
          {onSelectXAxis}
          {onSelectYAxis}
          {lockYAxis}
          {fieldChartConfig}
          {chartableOutputs}
          {defaultBands}
          {unitSystem}
          {onSelectOutput}
          {onApplyBands}
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
