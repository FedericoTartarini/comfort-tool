<script lang="ts">
  import { warningFor, type ViolationRow } from "$lib/core/applicability";
  import { colorForBand } from "$lib/core/bandPalette";
  import { resultValue } from "$lib/core/libraryInputs";
  import type { ModelResult, RegisteredModel } from "$lib/core/modelDeclaration";
  import { formatNumber } from "$lib/core/numberFormat";
  import { quantityFor, type Quantity } from "$lib/core/quantities";
  import { standards } from "$lib/core/standard";
  import { displayUnitFor } from "$lib/core/units";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import { copy } from "$lib/text/copy";
  import * as Table from "$lib/ui/primitives/table";

  interface Props {
    model: RegisteredModel;
    /** The slot's last valid result; `null` before the first run. */
    result: ModelResult | null;
    unitSystem: UnitSystem;
    slotName: string;
    outOfRange: boolean;
    violations: readonly ViolationRow[];
  }

  let { model, result, unitSystem, slotName, outOfRange, violations }: Props = $props();

  interface ClassifiedOutput {
    readonly quantity: Quantity;
    readonly category: string | number;
    readonly color: string | undefined;
  }

  // ADR §4.3: the Compliance column appears only when the model has a
  // classified output or a broken output row. Colour a category by its
  // position in the output's own classifier (ADR-0002 decision 8).
  // An output-role violation also opens the column: a PMV of 2.4 is shown, with
  // the row it broke as its caveat.
  const classified = $derived<readonly ClassifiedOutput[]>(
    result
      ? Object.entries(model.info.outputs).flatMap(([key, variable]) => {
          const classifier = variable.classifier;
          const quantity = classifier ? quantityFor(key) : undefined;
          if (!classifier || !quantity) {
            return [];
          }
          const category = resultValue(result, quantity);
          if (category === undefined) {
            return [];
          }
          return [{ quantity, category, color: colorForBand(classifier, category) }];
        })
      : [],
  );
  const caveats = $derived(violations.filter((violation) => violation.role === "output"));
  const hasCompliance = $derived(classified.length > 0 || caveats.length > 0);
  const standardEntry = $derived(model.standard ? standards.find((entry) => entry.id === model.standard) : undefined);

  function cellText(quantity: Quantity): string {
    const value = result ? resultValue(result, quantity) : undefined;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return copy.notAvailable;
    }
    const unit = displayUnitFor(quantity, unitSystem);
    const text = formatNumber(unit.fromSi(value));
    return unit.symbol ? `${text} ${unit.symbol}` : text;
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
          <Table.Cell>{cellText(quantity)}</Table.Cell>
        {/each}
      </Table.Row>
    </Table.Body>
    {#if outOfRange || standardEntry}
      <Table.Caption>
        {#if outOfRange}<span>{result ? copy.outOfRangeKeptResult : copy.outOfRangeEmptyResult}</span>{/if}
        {#if standardEntry}
          <span class="edition">{copy.standardCaption(standardEntry.displayName, standardEntry.year)}</span>
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

  .edition:not(:first-child) {
    margin-left: 0.75em;
  }
</style>
