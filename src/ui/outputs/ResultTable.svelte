<script lang="ts">
  import { splitViolations, warningFor } from "$lib/core/applicability";
  import { chartInk } from "$lib/core/bandPalette";
  import type { RegisteredModel } from "$lib/core/modelDeclaration";
  import { classifiedOutputs, formatResultCell } from "$lib/core/resultCell";
  import { standardCaptionFor } from "$lib/core/standard";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import type { SlotOutputs } from "$lib/state/compute.svelte";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import * as Table from "$lib/ui/primitives/table";

  interface Props {
    model: RegisteredModel;
    /** One row per compared slot, in slot order. */
    rows: readonly SlotOutputs[];
    unitSystem: UnitSystem;
    /** While Compare is on, a row wears its slot's hue and a caption line names the row it is about. */
    compare: boolean;
    /** The id of the Results heading, which names the table's scroll region (ADR-0002 decision 70, rule 2). */
    labelledby: string;
  }

  let { model, rows, unitSystem, compare, labelledby }: Props = $props();

  // ADR §4.3: the Compliance column appears only when the model has a
  // classified output or a broken output row. An output-role violation also
  // opens the column: a PMV of 2.4 is shown, with the row it broke as its caveat.
  const tableRows = $derived(
    rows.map((row) => ({
      row,
      classified: classifiedOutputs(model, row.result),
      caveats: splitViolations(row.violations).outputs,
    })),
  );
  const hasCompliance = $derived(tableRows.some((entry) => entry.classified.length > 0 || entry.caveats.length > 0));
  const uncalculatedRows = $derived(rows.filter((row) => row.notCalculated));
  const standardCaption = $derived(model.standard ? standardCaptionFor(model.standard) : undefined);

  function notCalculatedNote(row: SlotOutputs): string {
    const note = row.result ? copy.outOfRangeKeptResult : copy.outOfRangeEmptyResult;
    return compare ? copy.slotNote(row.badge.name, note) : note;
  }
</script>

<!-- A slot's swatch is its chart marker's. -->
{#snippet slotSwatch(row: SlotOutputs)}
  <span class="swatch swatch-marker" style:--swatch-color={chartInk.marker(row.badge.hue)}></span>
{/snippet}

<Stack gap="2">
  <!-- The table scrolls inside its region, not the page, by keyboard too (ADR-0002 decision 70): a scroll region
       is focusable so the arrow keys reach the columns to the right, which Svelte's rule does not except. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="table-scroll" role="region" tabindex="0" aria-labelledby={labelledby}>
    <Table.Root class="result-table">
      <Table.Header>
        <Table.Row>
          <Table.Head>{copy.inputColumn}</Table.Head>
          {#if hasCompliance}
            <Table.Head>{copy.complianceColumn}</Table.Head>
          {/if}
          {#each model.table as quantity (quantity)}
            <Table.Head class="value">{quantity.label}</Table.Head>
          {/each}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each tableRows as { row, classified, caveats } (row)}
          <Table.Row>
            <Table.Cell>
              {#if compare}
                <span class="swatch-label">
                  {@render slotSwatch(row)}
                  {row.badge.name}
                </span>
              {:else}
                {row.badge.name}
              {/if}
            </Table.Cell>
            {#if hasCompliance}
              <Table.Cell>
                <Inline gap="2">
                  {#each classified as entry (entry.quantity)}
                    <span class="swatch-label">
                      {#if entry.color}
                        <span class="swatch swatch-fill" style:--swatch-color={entry.color}></span>
                      {/if}
                      {entry.quantity.label}: {entry.category}
                    </span>
                  {/each}
                  {#each caveats as violation (violation)}
                    <span class="caption caveat">{warningFor(violation, unitSystem)}</span>
                  {/each}
                </Inline>
              </Table.Cell>
            {/if}
            {#each model.table as quantity (quantity)}
              <Table.Cell class="value">{formatResultCell(row.result, quantity, unitSystem)}</Table.Cell>
            {/each}
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>

  {#if uncalculatedRows.length > 0 || standardCaption}
    <div class="caption">
      <Inline gap="4">
        {#each uncalculatedRows as row (row)}
          <span class="swatch-label">
            {#if compare}
              {@render slotSwatch(row)}
            {/if}
            {notCalculatedNote(row)}
          </span>
        {/each}
        {#if standardCaption}
          <span>{standardCaption}</span>
        {/if}
      </Inline>
    </div>
  {/if}
</Stack>
