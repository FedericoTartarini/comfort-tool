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
  import ExportImageDialog from "$lib/ui/inputs/ExportImageDialog.svelte";
  import InputCalculators from "$lib/ui/inputs/InputCalculators.svelte";
  import InputPanel, { type SlotColumn } from "$lib/ui/inputs/InputPanel.svelte";
  import ModelSelect from "$lib/ui/inputs/ModelSelect.svelte";
  import ModelSwitchDialog from "$lib/ui/inputs/ModelSwitchDialog.svelte";
  import SessionControls from "$lib/ui/inputs/SessionControls.svelte";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import PageFrame from "$lib/ui/layout/PageFrame.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { raiseNotice } from "$lib/ui/outputs/notices";
  import ResultTable from "$lib/ui/outputs/ResultTable.svelte";
  import { Separator } from "$lib/ui/primitives/separator";
  import { inAppLinkTo, inAppSwitch } from "./inAppSwitch";
  import { defaultModel, modelChoicesOn } from "./navigation";
  import PageNavigation from "./PageNavigation.svelte";

  // The app's one session, which the address moves (`App.svelte`).
  const { session, outputs } = getOpenSession();
  const tab = getTabControls();
  const inApp = inAppSwitch(session);

  /** Explore compares nothing: slot 1's column alone, for the input panel and the input calculators. */
  const columns = $derived<readonly [SlotColumn]>([{ inputSlot: session.slots[0], outputs: outputs.slots[0] }]);
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
      oncopyrefused={() => raiseNotice("copyRefused")}
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
      rows={outputs.slots}
      unitSystem={session.unitSystem}
      labelledby={headingId}
    />
  {/snippet}

  {#snippet chartActions()}
    <Inline gap="2" align="center">
      <BandsDialog model={session.model} chart={session.chart} unitSystem={session.unitSystem} />
      <ExportImageDialog
        chart={outputs.chart}
        model={session.model}
        chartType={session.chart.type}
        runs={outputs.drawnRuns}
        unitSystem={session.unitSystem}
        bands={session.chart.bands}
        onfailed={() => raiseNotice("imageFailed")}
      />
    </Inline>
  {/snippet}

  {#snippet chart()}
    <Stack gap="4">
      <ChartControls model={session.model} chart={session.chart} drawnAxes={outputs.drawnAxes} />
      {#if outputs.chart}
        <div class="chart-area">
          <PlotlyChart spec={outputs.chart} />
          <ChartLegend entries={outputs.chart.legend} />
        </div>
      {/if}
    </Stack>
  {/snippet}
</PageFrame>
