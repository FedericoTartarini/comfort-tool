<!--
  Explore (ADR-0002 decision 57): the session's controls as the Standard page
  has them, slot 1's inputs with no Compare, the result table and the charts of
  slot 1 alone. Which page is current is the session's, set by the address;
  the session compares slot 1 alone here, whatever Compare holds, so a switch
  asks about slot 1 alone. The model select offers every registered model, and
  the Bands dialog edits the model's Band list the charts paint (decision 59),
  opened from the chart card's heading row (decision 73, rule 8).
-->
<script lang="ts">
  import { page } from "$lib/core/page";
  import { getOpenSession, getTabControls } from "$lib/state/openSession";
  import ChartLegend from "$lib/ui/charts/ChartLegend.svelte";
  import PlotlyChart from "$lib/ui/charts/PlotlyChart.svelte";
  import BandsDialog from "$lib/ui/inputs/BandsDialog.svelte";
  import ChartControls from "$lib/ui/inputs/ChartControls.svelte";
  import ChartTypeSelect from "$lib/ui/inputs/ChartTypeSelect.svelte";
  import ExportImageDialog from "$lib/ui/inputs/ExportImageDialog.svelte";
  import InputCalculators from "$lib/ui/inputs/InputCalculators.svelte";
  import InputPanel, { type ComparedSlot } from "$lib/ui/inputs/InputPanel.svelte";
  import ModelSelect from "$lib/ui/inputs/ModelSelect.svelte";
  import ModelSwitchDialog from "$lib/ui/inputs/ModelSwitchDialog.svelte";
  import SessionControls from "$lib/ui/inputs/SessionControls.svelte";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import PageFrame from "$lib/ui/layout/PageFrame.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { raiseToast } from "$lib/ui/layout/toasts";
  import ResultTable from "$lib/ui/results/ResultTable.svelte";
  import { Separator } from "$lib/ui/primitives/separator";
  import { inAppLinkTo, inAppSwitch } from "./inAppSwitch";
  import { defaultModel, modelChoicesOn } from "./navigation";
  import PageNavigation from "./PageNavigation.svelte";

  // The app's one session, which the address moves (`App.svelte`).
  const { session, computation } = getOpenSession();
  const tab = getTabControls();
  const inApp = inAppSwitch(session);

  /** Explore compares slot 1 alone: its column, for the input panel and the input calculators. */
  const columns = $derived<readonly [ComparedSlot]>([{ inputSlot: session.slots[0], computation: computation.slots[0] }]);
</script>

<PageFrame mark={inAppLinkTo({ page: page.standard, model: defaultModel() }, inApp.follow)}>
  {#snippet navigation()}
    <PageNavigation {session} onfollow={inApp.follow} />
  {/snippet}

  {#snippet sessionControls()}
    <SessionControls
      {session}
      onreset={tab.reset}
      link={tab.link}
      oncopyrefused={() => raiseToast("copyRefused")}
    />
  {/snippet}

  {#snippet inputs()}
    <!-- What the card computes, the model, ruled off from the values it computes from (decision 73, rule 8). -->
    <Stack gap="4">
      <ModelSelect
        choices={modelChoicesOn(session)}
        model={session.model}
        onchoose={(model) => inApp.follow({ page: session.page, model })}
      />
      <Separator />
      <InputPanel
        model={session.model}
        {columns}
        unitSystem={session.unitSystem}
        atmosphericPressure={session.atmosphericPressure}
        entryModeSetters={session}
        entryWriter={session}
      />
      <InputCalculators
        model={session.model}
        {columns}
        unitSystem={session.unitSystem}
        atmosphericPressure={session.atmosphericPressure}
        calculatorWriter={session}
      />
      <ModelSwitchDialog
        pending={session.pendingSwitch}
        unitSystem={session.unitSystem}
        onaccept={inApp.accept}
        ondecline={() => session.declineSwitch()}
      />
    </Stack>
  {/snippet}

  {#snippet results(headingId)}
    <ResultTable
      model={session.model}
      rows={computation.slots}
      unitSystem={session.unitSystem}
      labelledby={headingId}
    />
  {/snippet}

  {#snippet chartType()}
    <ChartTypeSelect model={session.model} chart={session.chart} />
  {/snippet}

  {#snippet chartActions()}
    <Inline gap="2" align="center">
      <BandsDialog model={session.model} chart={session.chart} unitSystem={session.unitSystem} />
      <ExportImageDialog
        chart={computation.chart}
        model={session.model}
        chartType={session.chart.type}
        runs={computation.drawnRuns}
        unitSystem={session.unitSystem}
        bands={session.chart.bands}
        onfailed={() => raiseToast("imageFailed")}
      />
    </Inline>
  {/snippet}

  {#snippet chart()}
    <Stack gap="4">
      <ChartControls chart={session.chart} drawnAxes={computation.drawnAxes} />
      {#if computation.chart}
        <div class="chart-area">
          <ChartLegend entries={computation.chart.legend} />
          <PlotlyChart spec={computation.chart} />
        </div>
      {/if}
    </Stack>
  {/snippet}
</PageFrame>
