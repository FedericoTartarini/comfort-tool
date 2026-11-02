<script lang="ts">
  import type { ChartAxes } from "$lib/core/modelDeclaration";
  import type { Quantity } from "$lib/core/quantities";
  import type { DrawnAxes } from "$lib/state/compute.svelte";
  import type { ChartState } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import { Label } from "$lib/ui/primitives/label";
  import * as Select from "$lib/ui/primitives/select";

  interface Props {
    chart: ChartState;
    /** The axes of the chart on screen, not of the live slot; `null` hides the picker. */
    drawnAxes: DrawnAxes | null;
  }

  let { chart, drawnAxes }: Props = $props();

  const id = $props.id();
  // Options are addressed by position in these lists rather than by any string
  // id: a select's value is text, and a Quantity is compared by identity.
  // ADR §4.4: each axis excludes the quantity the other one holds — x === y is
  // not a chart.
  const xChoices = $derived(drawnAxes?.choices.filter((quantity) => quantity !== drawnAxes.selected.y) ?? []);
  const yChoices = $derived(drawnAxes?.choices.filter((quantity) => quantity !== drawnAxes.selected.x) ?? []);
</script>

<!--
  The chart card's view row (ADR-0002 decision 89, rule 6): the axis selects, drawn only where the chart declares
  axes, so a chart without them has no view row and a switch between the two moves the plot by this row. The chart
  type stands in the heading row (`ChartTypeSelect`).
-->
{#if drawnAxes}
  <Inline gap="2" align="center">
    {@render axisPicker("x", copy.xAxis, xChoices, drawnAxes.selected.x)}
    {@render axisPicker("y", copy.yAxis, yChoices, drawnAxes.selected.y)}
  </Inline>
{/if}

<!-- A label and its select are one item of the row, so a narrow row wraps them together. -->
{#snippet axisPicker(axis: keyof ChartAxes, label: string, choices: readonly Quantity[], selected: Quantity)}
  <Inline gap="2" align="center">
    <Label for="{id}-{axis}">{label}</Label>
    <Select.Root
      type="single"
      value={String(choices.indexOf(selected))}
      onValueChange={(value) => chart.setAxes({ [axis]: choices[Number(value)] })}
    >
      <Select.Trigger id="{id}-{axis}" size="sm">{selected.label}</Select.Trigger>
      <Select.Content>
        <Select.Group>
          {#each choices as quantity, index (quantity)}
            <Select.Item value={String(index)} label={quantity.label} />
          {/each}
        </Select.Group>
      </Select.Content>
    </Select.Root>
  </Inline>
{/snippet}
