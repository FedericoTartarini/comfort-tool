<script lang="ts">
  import { chartInk } from "$lib/core/bandPalette";
  import { slotBadges } from "$lib/core/slotBadge";
  import { getOpenSession, getTabControls } from "$lib/state/openSession";
  import { slotPositions, type SlotPosition } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import ChartLegend from "$lib/ui/charts/ChartLegend.svelte";
  import PlotlyChart from "$lib/ui/charts/PlotlyChart.svelte";
  import ChartControls from "$lib/ui/inputs/ChartControls.svelte";
  import ExportImageDialog from "$lib/ui/inputs/ExportImageDialog.svelte";
  import InputPanel, { type SlotColumn } from "$lib/ui/inputs/InputPanel.svelte";
  import ModelSelect from "$lib/ui/inputs/ModelSelect.svelte";
  import ModelSwitchDialog from "$lib/ui/inputs/ModelSwitchDialog.svelte";
  import SessionControls from "$lib/ui/inputs/SessionControls.svelte";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import PageFrame from "$lib/ui/layout/PageFrame.svelte";
  import SlotColumns from "$lib/ui/layout/SlotColumns.svelte";
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
  const id = $props.id();

  /** Slot 1 cannot be disabled: its button is pressed and does nothing. */
  function toggleSlot(position: SlotPosition) {
    if (position !== 0) {
      session.setSlotEnabled(position, !session.isSlotEnabled(position));
    }
  }

  /** The input panel's columns: slot 1 alone, or on Compare the three, `null` for a slot not compared. */
  const columns = $derived.by((): readonly [SlotColumn, ...(SlotColumn | null)[]] => {
    const columnAt = (position: SlotPosition): SlotColumn | null => {
      const inputSlot = session.slots[position];
      const slotOutputs = outputs.slots.find((slot) => slot.position === position);
      return inputSlot && slotOutputs ? { inputSlot, outputs: slotOutputs } : null;
    };
    const first = { inputSlot: session.slots[0], outputs: outputs.slots[0] };
    return session.compare ? [first, columnAt(1), columnAt(2)] : [first];
  });
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
      <!--
        While Compare is on, a slot button at the head of each slot column; a
        disabled slot's column is empty below its button (ADR-0002 decision 50).
        The rows reflow inside the column, which keeps its width (decision 67, rule 10).
      -->
      {#if session.compare}
        <SlotColumns count={slotPositions.length}>
          {#each slotPositions as position (position)}
            <Button
              size="sm"
              variant={session.isSlotEnabled(position) ? "default" : "outline"}
              aria-pressed={session.isSlotEnabled(position)}
              onclick={() => toggleSlot(position)}
            >
              <span class="swatch swatch-marker" style:--swatch-color={chartInk.marker(slotBadges[position].hue)}></span>
              {slotBadges[position].name}
            </Button>
          {/each}
        </SlotColumns>
      {/if}
      <InputPanel
        model={session.model}
        {columns}
        unitSystem={session.unitSystem}
        atmosphericPressure={session.atmosphericPressure}
        entryModeSetters={session}
      />
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
      <h2 id="{id}-results">{copy.results}</h2>
      <ResultTable
        model={session.model}
        rows={outputs.slots}
        unitSystem={session.unitSystem}
        compare={session.compare}
        labelledby="{id}-results"
      />

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
