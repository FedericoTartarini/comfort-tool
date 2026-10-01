<script lang="ts">
  import { splitViolations, warningFor } from "$lib/core/applicability";
  import type { RegisteredModel } from "$lib/core/modelDeclaration";
  import { classifiedOutputs, formatResultCell } from "$lib/core/resultCell";
  import { standards } from "$lib/core/standard";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import type { SlotOutputs } from "$lib/state/compute.svelte";
  import { copy } from "$lib/text/copy";
  import * as Table from "$lib/ui/primitives/table";

  interface Props {
    model: RegisteredModel;
    /** One row per compared slot, in slot order. */
    rows: readonly SlotOutputs[];
    unitSystem: UnitSystem;
    /** While Compare is on, a row wears its slot's hue and a caption line names the row it is about. */
    compare: boolean;
  }

  let { model, rows, unitSystem, compare }: Props = $props();

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
  const standardEntry = $derived(model.standard ? standards.find((entry) => entry.id === model.standard) : undefined);

  function notCalculatedNote(row: SlotOutputs): string {
    const note = row.result ? copy.outOfRangeKeptResult : copy.outOfRangeEmptyResult;
    return compare ? copy.slotNote(row.badge.name, note) : note;
  }
</script>

<div class="result-table">
  <Table.Root>
    <Table.Header>
      <Table.Row>
        <Table.Head>{copy.inputColumn}</Table.Head>
        {#if hasCompliance}
          <Table.Head>{copy.complianceColumn}</Table.Head>
        {/if}
        {#each model.table as quantity (quantity)}
          <Table.Head>{quantity.label}</Table.Head>
        {/each}
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#each tableRows as { row, classified, caveats } (row)}
        <Table.Row>
          <Table.Cell>
            {#if compare}
              <span class="band">
                <span class="swatch" style:background-color={row.badge.hue.zoneLine}></span>
                {row.badge.name}
              </span>
            {:else}
              {row.badge.name}
            {/if}
          </Table.Cell>
          {#if hasCompliance}
            <Table.Cell>
              {#each classified as entry (entry.quantity)}
                <span class="band">
                  {#if entry.color}
                    <span class="swatch" style:background-color={entry.color}></span>
                  {/if}
                  {entry.quantity.label}: {entry.category}
                </span>
              {/each}
              {#each caveats as violation (violation)}
                <span class="band caveat">{warningFor(violation, unitSystem)}</span>
              {/each}
            </Table.Cell>
          {/if}
          {#each model.table as quantity (quantity)}
            <Table.Cell>{formatResultCell(row.result, quantity, unitSystem)}</Table.Cell>
          {/each}
        </Table.Row>
      {/each}
    </Table.Body>
    {#if uncalculatedRows.length > 0 || standardEntry}
      <Table.Caption>
        {#each uncalculatedRows as row (row)}<span class="note">{notCalculatedNote(row)}</span>{/each}
        {#if standardEntry}
          <span class="standard">{copy.standardCaption(standardEntry.displayName, standardEntry.year)}</span>
        {/if}
      </Table.Caption>
    {/if}
  </Table.Root>
</div>

<style>
  .result-table :global(th) {
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .band {
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    margin-right: 0.75em;
    white-space: nowrap;
  }

  .swatch {
    display: inline-block;
    width: 0.75em;
    height: 0.75em;
    border: 1px solid var(--border);
    border-radius: 50%;
  }

  .caveat {
    color: var(--muted-foreground);
    font-size: var(--font-size-caption);
    white-space: normal;
  }

  .note:not(:first-child),
  .standard:not(:first-child) {
    margin-left: 0.75em;
  }
</style>
