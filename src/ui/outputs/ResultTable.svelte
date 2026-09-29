<script lang="ts">
  import { splitViolations, warningFor, type ViolationRow } from "$lib/core/applicability";
  import type { ModelResult, RegisteredModel } from "$lib/core/modelDeclaration";
  import { classifiedOutputs, formatResultCell } from "$lib/core/resultCell";
  import { standards } from "$lib/core/standard";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import { copy } from "$lib/text/copy";
  import * as Table from "$lib/ui/primitives/table";

  interface Props {
    model: RegisteredModel;
    /** The slot's last valid result; `null` before the first run. */
    result: ModelResult | null;
    unitSystem: UnitSystem;
    slotName: string;
    notCalculated: boolean;
    violations: readonly ViolationRow[];
  }

  let { model, result, unitSystem, slotName, notCalculated, violations }: Props = $props();

  // ADR §4.3: the Compliance column appears only when the model has a
  // classified output or a broken output row. An output-role violation also
  // opens the column: a PMV of 2.4 is shown, with the row it broke as its caveat.
  const classified = $derived(classifiedOutputs(model, result));
  const caveats = $derived(splitViolations(violations).outputs);
  const hasCompliance = $derived(classified.length > 0 || caveats.length > 0);
  const standardEntry = $derived(model.standard ? standards.find((entry) => entry.id === model.standard) : undefined);
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
      <Table.Row>
        <Table.Cell>{slotName}</Table.Cell>
        {#if hasCompliance}
          <Table.Cell>
            {#each classified as entry (entry.quantity)}
              <span class="band">
                <span class="swatch" style:background-color={entry.color}></span>
                {entry.quantity.label}: {entry.category}
              </span>
            {/each}
            {#each caveats as violation (violation)}
              <span class="band caveat">{warningFor(violation, unitSystem)}</span>
            {/each}
          </Table.Cell>
        {/if}
        {#each model.table as quantity (quantity)}
          <Table.Cell>{formatResultCell(result, quantity, unitSystem)}</Table.Cell>
        {/each}
      </Table.Row>
    </Table.Body>
    {#if notCalculated || standardEntry}
      <Table.Caption>
        {#if notCalculated}<span>{result ? copy.outOfRangeKeptResult : copy.outOfRangeEmptyResult}</span>{/if}
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

  .standard:not(:first-child) {
    margin-left: 0.75em;
  }
</style>
