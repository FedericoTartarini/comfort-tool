<svelte:options runes={true} />

<script lang="ts">
  import { Card } from "flowbite-svelte";

  import type { TimeSeriesChartViewModel } from "../../models/timeSeries";
  import ChartExportDropdown from "../chart/ChartExportDropdown.svelte";
  import PlotlyChartCard from "../chart/PlotlyChartCard.svelte";

  interface Props {
    chartDefinition: TimeSeriesChartViewModel;
    isLoading: boolean;
  }

  let { chartDefinition, isLoading }: Props = $props();

  let exportChart: ((type: "png" | "svg") => void) | undefined = $state(undefined);
  const exportTriggerId = $derived(`time-series-export-${chartDefinition.id}`);
</script>

<Card size="none" class="border-stone-300 p-3 shadow-sm">
  <header class="mb-2 flex flex-wrap items-center justify-end gap-2">
    <ChartExportDropdown
      triggerId={exportTriggerId}
      onExport={(type) => exportChart?.(type)}
    />
  </header>
  <PlotlyChartCard
    title={chartDefinition.title}
    description={chartDefinition.description}
    chartResult={chartDefinition.chart}
    isLoading={isLoading}
    emptyMessage={chartDefinition.emptyMessage}
    testId={chartDefinition.testId}
    heightClass={chartDefinition.heightClass}
    onRegisterExport={(handler) => (exportChart = handler)}
  />
</Card>
