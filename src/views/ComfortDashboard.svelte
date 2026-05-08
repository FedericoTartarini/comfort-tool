<svelte:options runes={true} />

<script lang="ts">
  /**
   * @component
   * Main dashboard layout that combines input, results, and chart panels
   * in a responsive grid layout. Receives state via ComfortToolController.
   */
  import { Card } from "flowbite-svelte";

  import ChartPanel from "../components/chart/ChartPanel.svelte";
  import InputPanel from "../components/input-panel/InputPanel.svelte";
  import ResultsPanel from "../components/ResultsPanel.svelte";
  import type { ChartId } from "../models/chartOptions";
  import type { FieldKey } from "../models/fieldKeys";
  import type { ComfortToolController } from "../state/comfortTool/types";

  let {
    toolState,
  }: {
    toolState: ComfortToolController;
  } = $props();

  function handleSelectChart(nextChart: ChartId) {
    toolState.actions.setSelectedChart(nextChart);
  }

  function handleSelectXAxis(fieldKey: string) {
    toolState.actions.setDynamicXAxis(fieldKey as FieldKey);
  }

  function handleSelectYAxis(fieldKey: string) {
    toolState.actions.setDynamicYAxis(fieldKey as FieldKey);
  }

  function handleSelectBaselineInput(inputId: string) {
    toolState.actions.setChartBaselineInputId(inputId as any);
  }
</script>

<main id="overview" class="bg-stone-50 px-4 py-4 sm:px-6 lg:px-8">
  <div class="mx-auto max-w-7xl grid gap-4 xl:grid-cols-[25rem_1fr]">
    <!-- Left Sidebar: Environmental and Personal Inputs -->
    <aside id="inputs-panel" class="scroll-mt-32">
      <InputPanel {toolState} />
    </aside>

    <!-- Main Section: Results Table and Interactive Charts -->
    <section class="grid gap-4">
      <Card size="none" class="p-3 shadow-sm scroll-mt-32 border-stone-300">
        <!-- Summary of calculation results -->
        <ResultsPanel
          activeInputId={toolState.state.ui.activeInputId}
          visibleInputIds={toolState.selectors.getVisibleInputIds()}
          resultSections={toolState.selectors.getResultSections()}
          errorMessage={toolState.state.ui.errorMessage}
          isLoading={toolState.state.ui.isLoading}
          embedded={true}
        />

        <!-- Visual representation of comfort models -->
        <ChartPanel
          title=""
          description=""
          chartResult={toolState.selectors.getCurrentChartResult()}
          isLoading={toolState.state.ui.isLoading}
          emptyMessage={toolState.selectors.getCurrentChartEmptyMessage()}
          heightClass={toolState.selectors.getCurrentChartHeightClass()}
          chartOptions={toolState.selectors.getCurrentChartOptions()}
          selectedChart={toolState.selectors.getCurrentSelectedChart()}
          selectedModel={toolState.state.ui.selectedModel}
          onSelectChart={handleSelectChart}
          dynamicXAxis={toolState.state.ui.dynamicXAxis}
          dynamicYAxis={toolState.state.ui.dynamicYAxis}
          dynamicAxisOptions={toolState.selectors.getDynamicAxisOptions()}
          baselineInputId={toolState.state.ui.chartBaselineInputId}
          onSelectBaselineInput={handleSelectBaselineInput}
          visibleInputIds={toolState.selectors.getVisibleInputIds()}
          compareEnabled={toolState.state.ui.compareEnabled}
          onSelectXAxis={handleSelectXAxis}
          onSelectYAxis={handleSelectYAxis}
          embedded={true}
        />
      </Card>
    </section>
  </div>
</main>
