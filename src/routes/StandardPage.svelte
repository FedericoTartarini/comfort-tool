<script lang="ts">
  import { chartInk } from "$lib/core/bandPalette";
  import { slotBadges } from "$lib/core/slotBadge";
  import type { SlotOutputs } from "$lib/state/compute.svelte";
  import { getOpenSession, getTabControls } from "$lib/state/openSession";
  import { slotPositions, type InputSlot, type SlotPosition } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import ChartLegend from "$lib/ui/charts/ChartLegend.svelte";
  import PlotlyChart from "$lib/ui/charts/PlotlyChart.svelte";
  import ChartControls from "$lib/ui/inputs/ChartControls.svelte";
  import EntryModeControls from "$lib/ui/inputs/EntryModeControls.svelte";
  import ExportImageDialog from "$lib/ui/inputs/ExportImageDialog.svelte";
  import InputPanel from "$lib/ui/inputs/InputPanel.svelte";
  import ModelSelect from "$lib/ui/inputs/ModelSelect.svelte";
  import ModelSwitchDialog from "$lib/ui/inputs/ModelSwitchDialog.svelte";
  import SessionControls from "$lib/ui/inputs/SessionControls.svelte";
  import Grid from "$lib/ui/layout/Grid.svelte";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import PageFrame from "$lib/ui/layout/PageFrame.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import ResultTable from "$lib/ui/outputs/ResultTable.svelte";
  import { Button } from "$lib/ui/primitives/button";
  import { inAppSwitch } from "./inAppSwitch";
  import { modelChoicesOn } from "./navigation";
  import PageNavigation from "./PageNavigation.svelte";

  // The app's one session, which the address moves (`App.svelte`).
  const { session, outputs } = getOpenSession();
  const tab = getTabControls();
  const inApp = inAppSwitch(session);

  /** Slot 1 cannot be disabled: its button is pressed and does nothing. */
  function toggleSlot(position: SlotPosition) {
    if (position !== 0) {
      session.setSlotEnabled(position, !session.isSlotEnabled(position));
    }
  }

  /** What the column at `position` shows below its button: `null` while the slot is not compared. */
  function comparedAt(position: SlotPosition): { inputSlot: InputSlot; slotOutputs: SlotOutputs } | null {
    const inputSlot = session.slots[position];
    const slotOutputs = outputs.slots.find((slot) => slot.position === position);
    return inputSlot && slotOutputs ? { inputSlot, slotOutputs } : null;
  }

  // While Compare is on the inputs take three columns, so their column widens until it is one width (ticket 08).
  const inputWidth = $derived(session.compare ? "40rem" : "24rem");
</script>

{#snippet slotInputs(inputSlot: InputSlot, slotOutputs: SlotOutputs)}
  <InputPanel
    model={session.model}
    {inputSlot}
    unitSystem={session.unitSystem}
    atmosphericPressure={session.atmosphericPressure}
    outOfRangeQuantities={slotOutputs.outOfRangeQuantities}
    violations={slotOutputs.violations}
  />
{/snippet}

<PageFrame notice={tab.notice} onclosenotice={tab.closeNotice} {inputWidth}>
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
      <h2>{copy.inputs}</h2>
      <Inline gap="2" align="center">
        <ModelSelect
          choices={modelChoicesOn(session)}
          model={session.model}
          onchoose={(model) => inApp.follow({ page: session.page, model })}
        />
        <Button
          size="sm"
          variant={session.compare ? "default" : "outline"}
          aria-pressed={session.compare}
          onclick={() => session.setCompare(!session.compare)}
        >
          {copy.compare}
        </Button>
      </Inline>
      <!-- The session's entry modes, shown once: each converts every slot (ADR-0002 decision 51). -->
      <EntryModeControls {session} />
      <!--
        While Compare is on, a column per slot, a third of the width whether
        its slot is enabled or not, so enabling one moves no other; a
        disabled column is empty below its button. How it looks is Phase 5c's.
      -->
      {#if session.compare}
        <Grid columns="repeat(3, minmax(0, 1fr))" gap="4">
          {#each slotPositions as position (position)}
            {@const compared = comparedAt(position)}
            <Stack gap="4">
              <Button
                size="sm"
                variant={session.isSlotEnabled(position) ? "default" : "outline"}
                aria-pressed={session.isSlotEnabled(position)}
                onclick={() => toggleSlot(position)}
              >
                <span class="swatch" style:background-color={chartInk.zoneLine(slotBadges[position].hue)}></span>
                {slotBadges[position].name}
              </Button>
              {#if compared}
                {@render slotInputs(compared.inputSlot, compared.slotOutputs)}
              {/if}
            </Stack>
          {/each}
        </Grid>
      {:else}
        {@render slotInputs(session.slots[0], outputs.slots[0])}
      {/if}
      <ModelSwitchDialog
        pending={session.pendingSwitch}
        namesSlots={session.comparedPositions.length > 1}
        unitSystem={session.unitSystem}
        onaccept={inApp.accept}
        ondecline={() => session.declineSwitch()}
      />
    </Stack>
  {/snippet}

  {#snippet results()}
    <Stack gap="4">
      <ResultTable model={session.model} rows={outputs.slots} unitSystem={session.unitSystem} compare={session.compare} />

      <Inline gap="4" justify="between" align="center">
        <ChartControls model={session.model} chart={session.chart} drawnAxes={outputs.drawnAxes} />
        <ExportImageDialog
          chart={outputs.chart}
          model={session.model}
          chartType={session.chart.type}
          runs={outputs.drawnRuns}
          unitSystem={session.unitSystem}
          onfailed={() => tab.raiseNotice("imageFailed")}
        />
      </Inline>

      {#if outputs.chart}
        <Stack gap="2">
          <PlotlyChart spec={outputs.chart} />
          <ChartLegend entries={outputs.chart.legend} />
        </Stack>
      {/if}
    </Stack>
  {/snippet}
</PageFrame>

<style>
  .swatch {
    display: inline-block;
    width: 0.75em;
    height: 0.75em;
    border-radius: 50%;
  }
</style>
