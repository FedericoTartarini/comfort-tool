<!--
  Explore (ADR-0002 decision 57): the session's controls as the Standard page
  has them, slot 1's inputs with no Compare, the result table and the charts of
  slot 1 alone. Which page is current is the session's, set by the address;
  the session compares slot 1 alone here, whatever Compare holds, so a switch
  asks about slot 1 alone. The model select offers every registered model, and
  the Bands panel edits the model's Band list the charts paint (decision 59),
  in a dialog the chart card's heading row opens (decision 73, rule 8).
-->
<script lang="ts">
  import { getOpenSession, getTabControls } from "$lib/state/openSession";
  import { copy } from "$lib/text/copy";
  import ChartLegend from "$lib/ui/charts/ChartLegend.svelte";
  import PlotlyChart from "$lib/ui/charts/PlotlyChart.svelte";
  import BandsPanel from "$lib/ui/inputs/BandsPanel.svelte";
  import ChartControls from "$lib/ui/inputs/ChartControls.svelte";
  import ExportImageDialog from "$lib/ui/inputs/ExportImageDialog.svelte";
  import InputPanel from "$lib/ui/inputs/InputPanel.svelte";
  import ModelSelect from "$lib/ui/inputs/ModelSelect.svelte";
  import ModelSwitchDialog from "$lib/ui/inputs/ModelSwitchDialog.svelte";
  import SessionControls from "$lib/ui/inputs/SessionControls.svelte";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import PageFrame from "$lib/ui/layout/PageFrame.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import ResultTable from "$lib/ui/outputs/ResultTable.svelte";
  import { Button } from "$lib/ui/primitives/button";
  import * as Dialog from "$lib/ui/primitives/dialog";
  import { inAppSwitch } from "./inAppSwitch";
  import { modelChoicesOn } from "./navigation";
  import PageNavigation from "./PageNavigation.svelte";

  // The app's one session, which the address moves (`App.svelte`).
  const { session, outputs } = getOpenSession();
  const tab = getTabControls();
  const inApp = inAppSwitch(session);
</script>

<PageFrame notice={tab.notice} onclosenotice={tab.closeNotice}>
  {#snippet navigation()}
    <PageNavigation {session} onfollow={inApp.follow} />
  {/snippet}

  {#snippet sessionControls()}
    <SessionControls
      {session}
      atmosphericPressureOutOfRange={outputs.atmosphericPressureOutOfRange}
      onreset={tab.reset}
      link={tab.link}
      oncopyrefused={() => tab.raiseNotice("copyRefused")}
    />
  {/snippet}

  {#snippet inputs()}
    <Stack gap="4">
      <ModelSelect
        choices={modelChoicesOn(session)}
        model={session.model}
        onchoose={(model) => inApp.follow({ page: session.page, model })}
      />
      <InputPanel
        model={session.model}
        columns={[{ inputSlot: session.slots[0], outputs: outputs.slots[0] }]}
        unitSystem={session.unitSystem}
        atmosphericPressure={session.atmosphericPressure}
        entryModeSetters={session}
      />
      <ModelSwitchDialog
        pending={session.pendingSwitch}
        namesSlots={false}
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
      compare={false}
      labelledby={headingId}
    />
  {/snippet}

  {#snippet chartActions()}
    <Inline gap="2" align="center">
      <ChartControls model={session.model} chart={session.chart} drawnAxes={outputs.drawnAxes} part="type" />
      <!-- Its edits are live, as decision 59 has them; Close only closes. A model with no Band list has nothing to edit. -->
      <Dialog.Root>
        <Dialog.Trigger disabled={session.chart.bands === null}>
          {#snippet child({ props })}
            <Button {...props} size="sm" variant="outline">{copy.bands}</Button>
          {/snippet}
        </Dialog.Trigger>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>{copy.bands}</Dialog.Title>
          </Dialog.Header>
          <BandsPanel model={session.model} chart={session.chart} unitSystem={session.unitSystem} />
          <Dialog.Footer>
            <Button variant="outline" onclick={() => session.chart.resetBands()}>{copy.bandsReset}</Button>
            <Dialog.Close>
              {#snippet child({ props })}
                <Button {...props}>{copy.bandsClose}</Button>
              {/snippet}
            </Dialog.Close>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Root>
      <ExportImageDialog
        chart={outputs.chart}
        model={session.model}
        chartType={session.chart.type}
        runs={outputs.drawnRuns}
        unitSystem={session.unitSystem}
        bands={session.chart.bands}
        onfailed={() => tab.raiseNotice("imageFailed")}
      />
    </Inline>
  {/snippet}

  {#snippet chart()}
    <Stack gap="4">
      <ChartControls model={session.model} chart={session.chart} drawnAxes={outputs.drawnAxes} part="axes" />
      {#if outputs.chart}
        <div class="chart-area">
          <PlotlyChart spec={outputs.chart} />
          <ChartLegend entries={outputs.chart.legend} />
        </div>
      {/if}
    </Stack>
  {/snippet}
</PageFrame>
