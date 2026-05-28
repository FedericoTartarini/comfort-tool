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
  import type { ComfortToolController } from "../state/comfortTool/types";

  interface Props {
    toolState: ComfortToolController;
  }

  let { toolState }: Props = $props();
</script>

<main id="overview" class="bg-stone-50 px-4 py-4 sm:px-6 lg:px-8">
  <div class="mx-auto grid w-full max-w-7xl gap-4 xl:grid-cols-[25rem_minmax(0,1fr)]">
    <!-- Left Sidebar: Environmental and Personal Inputs -->
    <aside id="inputs-panel" class="min-w-0 scroll-mt-32">
      <InputPanel {toolState} />
    </aside>

    <!-- Main Section: Results Table and Interactive Charts -->
    <section class="grid min-w-0 gap-4">
      <Card size="none" class="w-full min-w-0 border-stone-300 p-3 shadow-sm scroll-mt-32">
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
          onSelectChart={toolState.actions.setSelectedChart}
          dynamicXAxis={toolState.state.ui.dynamicXAxis}
          dynamicYAxis={toolState.state.ui.dynamicYAxis}
          dynamicAxisOptions={toolState.selectors.getDynamicAxisOptions()}
          baselineInputId={toolState.state.ui.chartBaselineInputId}
          onSelectBaselineInput={toolState.actions.setChartBaselineInputId}
          visibleInputIds={toolState.selectors.getVisibleInputIds()}
          compareEnabled={toolState.state.ui.compareEnabled}
          onSelectXAxis={toolState.actions.setDynamicXAxis}
          onSelectYAxis={toolState.actions.setDynamicYAxis}
          lockYAxis={toolState.selectors.getCurrentChartLockYAxis()}
          legendZones={toolState.selectors.getCurrentChartLegendZones()}
          legendTitle={toolState.selectors.getCurrentChartLegendTitle()}
          embedded={true}
        />
      </Card>
    </section>
  </div>
</main>
