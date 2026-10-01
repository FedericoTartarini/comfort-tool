<!--
  Explore (ADR-0002 decision 57): the session's controls as the Standard page
  has them, slot 1's inputs with no Compare, the result table and the charts of
  slot 1 alone. Which page is current is the session's, set by the address;
  the session compares slot 1 alone here, whatever Compare holds, so a switch
  asks about slot 1 alone. The model select offers every registered model, and
  the Bands panel edits the model's Band list the charts paint (decision 59).
-->
<script lang="ts">
  import { getOpenSession } from "$lib/state/openSession";
  import { copy } from "$lib/text/copy";
  import ChartLegend from "$lib/ui/charts/ChartLegend.svelte";
  import PlotlyChart from "$lib/ui/charts/PlotlyChart.svelte";
  import BandsPanel from "$lib/ui/inputs/BandsPanel.svelte";
  import ChartControls from "$lib/ui/inputs/ChartControls.svelte";
  import InputPanel from "$lib/ui/inputs/InputPanel.svelte";
  import ModelSelect from "$lib/ui/inputs/ModelSelect.svelte";
  import ModelSwitchDialog from "$lib/ui/inputs/ModelSwitchDialog.svelte";
  import SessionControls from "$lib/ui/inputs/SessionControls.svelte";
  import UnitSystemControls from "$lib/ui/inputs/UnitSystemControls.svelte";
  import Grid from "$lib/ui/layout/Grid.svelte";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import ResultTable from "$lib/ui/outputs/ResultTable.svelte";
  import { inAppSwitch } from "./inAppSwitch";
  import { modelChoicesOn } from "./navigation";
  import PageNavigation from "./PageNavigation.svelte";

  // The app's one session, which the address moves (`App.svelte`).
  const { session, outputs } = getOpenSession();
  const inApp = inAppSwitch(session);
</script>

<main>
  <Stack gap="6">
    <Inline justify="between" align="center">
      <h1>{copy.appTitle}</h1>
      <UnitSystemControls {session} />
    </Inline>

    <Grid columns="12rem minmax(0, 24rem) minmax(0, 1fr)" gap="6">
      <PageNavigation {session} onfollow={inApp.follow} />

      <section>
        <Stack gap="4">
          <h2>{copy.inputs}</h2>
          <ModelSelect
            choices={modelChoicesOn(session)}
            model={session.model}
            onchoose={(model) => inApp.follow({ page: session.page, model })}
          />
          <SessionControls {session} atmosphericPressureOutOfRange={outputs.atmosphericPressureOutOfRange} />
          <InputPanel
            model={session.model}
            inputSlot={session.slots[0]}
            unitSystem={session.unitSystem}
            atmosphericPressure={session.atmosphericPressure}
            outOfRangeQuantities={outputs.slots[0].outOfRangeQuantities}
            violations={outputs.slots[0].violations}
          />
          <ModelSwitchDialog
            pending={session.pendingSwitch}
            namesSlots={false}
            unitSystem={session.unitSystem}
            onaccept={inApp.accept}
            ondecline={() => session.declineSwitch()}
          />
        </Stack>
      </section>

      <section>
        <Stack gap="4">
          <ResultTable model={session.model} rows={outputs.slots} unitSystem={session.unitSystem} compare={false} />

          <ChartControls model={session.model} chart={session.chart} drawnAxes={outputs.drawnAxes} />

          {#if outputs.chart}
            <Stack gap="2">
              <PlotlyChart spec={outputs.chart} />
              <ChartLegend entries={outputs.chart.legend} />
            </Stack>
          {/if}

          <BandsPanel model={session.model} chart={session.chart} unitSystem={session.unitSystem} />
        </Stack>
      </section>
    </Grid>
  </Stack>
</main>
