<script lang="ts">
  import type { Measure, Quantity } from "jsthermalcomfort/io";
  import type { ApplicabilityLimit } from "jsthermalcomfort/reference";
  import { colorForBand, intervalColor } from "$lib/core/bandPalette";
  import type { RegisteredModel } from "$lib/core/modelDeclaration";
  import { formatNumber } from "$lib/core/numberFormat";
  import { displayUnitFor } from "$lib/core/units";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import { copy } from "$lib/text/copy";
  import * as Table from "$lib/ui/primitives/table";

  interface Props {
    model: RegisteredModel;
    /** The slot's last valid measures; `null` before the first result. */
    measures: readonly Measure[] | null;
    unitSystem: UnitSystem;
    slotName: string;
    outOfRange: boolean;
    violations: readonly ApplicabilityLimit[];
  }

  let { model, measures, unitSystem, slotName, outOfRange, violations }: Props = $props();

  // ADR §4.3: the Compliance column appears only when the model's measures
  // carry a category or intervals. Colour by band position (bandPalette) for
  // a category, by satisfaction for an interval.
  // An output-role violation also opens the column: a PMV of 2.4 is shown, with
  // the row it broke as its caveat.
  const classified = $derived(
    (measures ?? []).filter((measure) => measure.category !== undefined || measure.intervals.length > 0),
  );
  const caveats = $derived(violations.filter((limit) => limit.role === "output"));
  const hasCompliance = $derived(classified.length > 0 || caveats.length > 0);

  function cellText(quantity: Quantity): string {
    const measure = measures?.find((entry) => entry.quantity === quantity);
    if (!measure || !Number.isFinite(measure.value)) {
      return copy.notAvailable;
    }
    const unit = displayUnitFor(quantity, unitSystem);
    const text = formatNumber(unit.fromSi(measure.value));
    return unit.symbol ? `${text} ${unit.symbol}` : text;
  }

  function bandColor(measure: Measure): string | undefined {
    return model.model.tsv ? colorForBand(model.model.tsv, measure.value) : undefined;
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
            {#each classified as measure (measure.quantity)}
              {#if measure.category !== undefined}
                <span class="band">
                  <span class="swatch" style:background-color={bandColor(measure)}></span>
                  {measure.category}
                </span>
              {/if}
              {#each measure.intervals as interval (interval.label)}
                <span
                  class="band"
                  style:color={interval.satisfied ? intervalColor.satisfied : intervalColor.unsatisfied}
                >
                  {interval.label}
                </span>
              {/each}
            {/each}
            {#each caveats as limit (limit)}
              <span class="band caveat">{limit.warning}</span>
            {/each}
          </Table.Cell>
        {/if}
        {#each model.table as quantity (quantity)}
          <Table.Cell>{cellText(quantity)}</Table.Cell>
        {/each}
      </Table.Row>
    </Table.Body>
    {#if outOfRange || model.edition}
      <Table.Caption>
        {#if outOfRange}<span>{copy.outOfRange}</span>{/if}
        {#if model.edition}<span class="edition">{copy.edition(model.edition)}</span>{/if}
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
    font-size: 0.75rem;
    white-space: normal;
  }

  .edition:not(:first-child) {
    margin-left: 0.75em;
  }
</style>
