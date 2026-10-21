<script lang="ts">
  import { chartInk } from "$lib/core/bandPalette";
  import { page } from "$lib/core/page";
import { palette } from "$lib/core/palette";
  import { slotNames } from "$lib/core/slotBadge";
  import { getOpenSession, getTabControls } from "$lib/state/openSession";
  import { slotPositions, type SlotPosition } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import ChartLegend from "$lib/ui/charts/ChartLegend.svelte";
  import PlotlyChart from "$lib/ui/charts/PlotlyChart.svelte";
  import ChartControls from "$lib/ui/inputs/ChartControls.svelte";
  import ExportImageDialog from "$lib/ui/inputs/ExportImageDialog.svelte";
  import InputCalculators from "$lib/ui/inputs/InputCalculators.svelte";
  import InputPanel, { type SlotColumn } from "$lib/ui/inputs/InputPanel.svelte";
  import ModelSelect from "$lib/ui/inputs/ModelSelect.svelte";
  import ModelSwitchDialog from "$lib/ui/inputs/ModelSwitchDialog.svelte";
  import SessionControls from "$lib/ui/inputs/SessionControls.svelte";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import PageFrame from "$lib/ui/layout/PageFrame.svelte";
  import SlotColumns from "$lib/ui/layout/SlotColumns.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import ResultTable from "$lib/ui/outputs/ResultTable.svelte";
  import { Label } from "$lib/ui/primitives/label";
  import { Separator } from "$lib/ui/primitives/separator";
  import { Switch } from "$lib/ui/primitives/switch";
  import { Toggle } from "$lib/ui/primitives/toggle";
  import { inAppLinkTo, inAppSwitch } from "./inAppSwitch";
  import { defaultModel, modelChoicesOn } from "./navigation";
  import PageNavigation from "./PageNavigation.svelte";

  // The app's one session, which the address moves (`App.svelte`).
  const { session, outputs } = getOpenSession();
  const tab = getTabControls();
  const inApp = inAppSwitch(session);
  const id = $props.id();

  /** Slot 1 cannot be disabled: its button is pressed and does nothing. */
  function setSlotEnabled(position: SlotPosition, enabled: boolean) {
    if (position !== 0) {
      session.setSlotEnabled(position, enabled);
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

<PageFrame
  notice={tab.notice}
  onclosenotice={tab.closeNotice}
  mark={inAppLinkTo({ page: page.standard, model: defaultModel() }, inApp.follow)}
>
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
    <!-- What the card computes, the model, ruled off from the values it computes from (decision 73, rule 8). -->
    <Stack gap="4">
      <ModelSelect
        choices={modelChoicesOn(session)}
        model={session.model}
        onchoose={(model) => inApp.follow({ page: session.page, model })}
      />
      <Separator />
      <!--
        While Compare is on, a slot button at the head of each slot column; a
        disabled slot's column is empty below its button (ADR-0002 decision 50).
        The rows reflow inside the column, which keeps its width (decision 67, rule 10).
      -->
      {#if session.compare}
        <SlotColumns count={slotPositions.length}>
          {#each slotPositions as position (position)}
            <Toggle
              size="sm"
              variant="outline"
              bind:pressed={() => session.isSlotEnabled(position), (pressed) => setSlotEnabled(position, pressed)}
            >
              <span class="swatch swatch-marker" style:--swatch-color={chartInk.marker(palette.slots[position])}></span>
              {slotNames[position]}
            </Toggle>
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
      <InputCalculators
        model={session.model}
        {columns}
        unitSystem={session.unitSystem}
        atmosphericPressure={session.atmosphericPressure}
      />
      <ModelSwitchDialog
        pending={session.pendingSwitch}
        comparedSlots={outputs.slots}
        unitSystem={session.unitSystem}
        onaccept={inApp.accept}
        ondecline={() => session.declineSwitch()}
      />
    </Stack>
  {/snippet}

  <!--
    Compare is a setting on or off that takes effect at once, so a switch with its label (ADR-0002 decision 76,
    rule 1), at the Inputs heading row's right end, where no model's name can move it (decision 73, rule 8).
  -->
  {#snippet inputsActions()}
    <Inline gap="2" align="center">
      <Switch id="{id}-compare" bind:checked={() => session.compare, (checked) => session.setCompare(checked)} />
      <Label for="{id}-compare">{copy.compare}</Label>
    </Inline>
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
    <ExportImageDialog
      chart={outputs.chart}
      model={session.model}
      chartType={session.chart.type}
      runs={outputs.drawnRuns}
      unitSystem={session.unitSystem}
      onfailed={() => tab.raiseNotice("imageFailed")}
    />
  {/snippet}

  {#snippet chart()}
    <Stack gap="4">
      <ChartControls model={session.model} chart={session.chart} drawnAxes={outputs.drawnAxes} />
      {#if outputs.chart}
        <div class="chart-area">
          <PlotlyChart spec={outputs.chart} />
          <ChartLegend entries={outputs.chart.legend} />
        </div>
        <!-- Under the plot, a caption per slot whose Comfort zones are all empty, its swatch while the slots are named
             (ADR-0002 decision 83, rule 1); the axes, the marker, the hover and the legend stay as they are. -->
        {#if outputs.chart.notes.length > 0}
          <ul>
            {#each outputs.chart.notes as note (note)}
              <li class="caption">
                <span class="swatch-label">
                  {#if note.color}
                    <span class="swatch swatch-marker" style:--swatch-color={note.color}></span>
                  {/if}
                  {note.text}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </Stack>
  {/snippet}
</PageFrame>
