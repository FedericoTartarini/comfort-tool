<svelte:options runes={true} />

<script lang="ts">
  import { Card } from "flowbite-svelte";

  import ChartPanel from "../components/chart/ChartPanel.svelte";
  import InputPanel from "../components/input-panel/InputPanel.svelte";
  import WorkspaceTwoColumnLayout from "../components/layout/WorkspaceTwoColumnLayout.svelte";
  import ResultsPanel from "../components/ResultsPanel.svelte";
  import {
    toChartInstancePanelView,
    type ChartInstancePanelView,
  } from "../../state/analysis/chartInstancePresentation";
  import type { AnalysisController } from "../../state/analysis/types";

  type ModelIdType = AnalysisController["state"]["ui"]["selectedModel"];

  interface Props {
    toolState: AnalysisController;
    allowedModelIds: readonly ModelIdType[];
    onSelectModel: (modelId: ModelIdType) => void;
  }

  let { toolState, allowedModelIds, onSelectModel }: Props = $props();

  function toPanelView(
    instance: ReturnType<
      AnalysisController["selectors"]["getCurrentChartInstance"]
    >,
  ): ChartInstancePanelView {
    return toChartInstancePanelView(instance);
  }

  const chartInstance = $derived(
    toPanelView(toolState.selectors.getCurrentChartInstance()),
  );
  const chartInstances = $derived(
    toolState.selectors.getCurrentChartInstances().map(toPanelView),
  );
</script>

<div id="overview">
  <WorkspaceTwoColumnLayout
    asideId="inputs-panel"
    asideClass="min-w-0 scroll-mt-32"
    mainClass="grid min-w-0 gap-4"
  >
    {#snippet aside()}
      <InputPanel
        panel={toolState.selectors.getInputPanelViewModel(allowedModelIds, onSelectModel)}
      />
    {/snippet}
    {#snippet main()}
      <Card
        size="none"
        class="w-full min-w-0 border-stone-300 p-3 shadow-sm scroll-mt-32"
      >
        <ResultsPanel
          visibleInputIds={toolState.selectors.getVisibleInputIds()}
          resultSections={toolState.selectors.getResultSections()}
          isLoading={toolState.state.ui.isLoading}
          embedded={true}
        />

        <ChartPanel
          chartResult={toolState.selectors.getCurrentChartResult()}
          isLoading={toolState.state.ui.isLoading}
          {chartInstance}
          {chartInstances}
          selectedChartInstanceId={toolState.selectors.getCurrentChartInstanceId()}
          selectedModel={toolState.state.ui.selectedModel}
          onSelectChartInstance={toolState.actions.setSelectedChartInstance}
          chartControls={toolState.selectors.getChartControlsViewModel()}
          legendZones={toolState.selectors.getCurrentChartLegendZones()}
          legendTitle={toolState.selectors.getCurrentChartLegendTitle()}
        />
      </Card>
    {/snippet}
  </WorkspaceTwoColumnLayout>
</div>
