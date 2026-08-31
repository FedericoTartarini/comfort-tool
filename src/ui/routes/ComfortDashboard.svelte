<svelte:options runes={true} />

<script lang="ts">
  import { Card } from "flowbite-svelte";

  import ChartPanel from "../components/chart/ChartPanel.svelte";
  import InputPanel from "../components/input-panel/InputPanel.svelte";
  import TwoColumnLayout from "../components/layout/TwoColumnLayout.svelte";
  import ResultsPanel from "../components/ResultsPanel.svelte";
  import {
    toChartInstancePanelView,
    type ChartInstancePanelView,
  } from "../../state/pointSession/chartInstancePresentation";
  import type { PointSession } from "../../state/pointSession/types";

  interface Props {
    pointSession: PointSession;
  }

  let { pointSession }: Props = $props();

  function toPanelView(
    instance: PointSession["chartInstance"],
  ): ChartInstancePanelView {
    return toChartInstancePanelView(instance);
  }

  const inputPanel = $derived(pointSession.inputPanel);
  const chartBuild = $derived(pointSession.chartBuild);
  const chartInstance = $derived(toPanelView(pointSession.chartInstance));
  const chartInstances = $derived(pointSession.chartInstances.map(toPanelView));
  const isLoading = $derived(pointSession.isLoading);
</script>

<div id="overview">
  <TwoColumnLayout
    asideId="inputs-panel"
    asideClass="min-w-0 scroll-mt-32"
    mainClass="grid min-w-0 gap-4"
  >
    {#snippet aside()}
      <InputPanel panel={inputPanel} />
    {/snippet}
    {#snippet main()}
      <Card
        size="none"
        class="w-full min-w-0 border-stone-300 p-3 shadow-sm scroll-mt-32"
      >
        <ResultsPanel
          visibleInputIds={pointSession.visibleInputIds}
          resultSections={pointSession.resultSections}
          {isLoading}
          embedded={true}
        />

        <ChartPanel
          chartResult={chartBuild.payload}
          hoverProbe={chartBuild.hoverProbe}
          {isLoading}
          {chartInstance}
          {chartInstances}
          selectedChartInstanceId={pointSession.chartInstanceId}
          onSelectChartInstance={pointSession.actions.setSelectedChartInstance}
          chartControls={pointSession.chartControls}
          legendZones={pointSession.chartLegendZones}
          legendTitle={pointSession.chartLegendTitle}
        />
      </Card>
    {/snippet}
  </TwoColumnLayout>
</div>
