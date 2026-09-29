<script lang="ts">
  import type { ChartAxes, RegisteredModel } from "$lib/core/modelDeclaration";
  import type { Quantity } from "$lib/core/quantities";
  import type { DrawnAxes } from "$lib/state/compute.svelte";
  import type { ChartState } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import { Button } from "$lib/ui/primitives/button";
  import { Label } from "$lib/ui/primitives/label";
  import * as Select from "$lib/ui/primitives/select";

  interface Props {
    model: RegisteredModel;
    chart: ChartState;
    /** The axes of the chart on screen, not of the live slot; `null` hides the picker. */
    drawnAxes: DrawnAxes | null;
  }

  let { model, chart, drawnAxes }: Props = $props();

  const id = $props.id();
  // Options are addressed by position in these lists rather than by any string
  // id: a <select> value is text, and a Quantity is compared by identity.
  // ADR §4.4: each axis excludes the quantity the other one holds — x === y is
  // not a chart.
  const xChoices = $derived(drawnAxes?.choices.filter((quantity) => quantity !== drawnAxes.selected.y) ?? []);
  const yChoices = $derived(drawnAxes?.choices.filter((quantity) => quantity !== drawnAxes.selected.x) ?? []);
</script>

<Inline gap="4" align="baseline">
  <Inline gap="2" align="center">
    <span>{copy.chart}</span>
    {#each model.charts as declaredChart (declaredChart.type)}
      <Button
        size="sm"
        variant={chart.type === declaredChart.type ? "default" : "outline"}
        onclick={() => (chart.type = declaredChart.type)}
      >
        {declaredChart.type.title}
      </Button>
    {/each}
  </Inline>

  {#if drawnAxes}
    <Inline gap="2" align="center">
      {@render axisPicker("x", copy.xAxis, xChoices, drawnAxes.selected.x)}
      {@render axisPicker("y", copy.yAxis, yChoices, drawnAxes.selected.y)}
    </Inline>
  {/if}
</Inline>

{#snippet axisPicker(axis: keyof ChartAxes, label: string, choices: readonly Quantity[], selected: Quantity)}
  <Label for="{id}-{axis}">{label}</Label>
  <Select.Root
    type="single"
    value={String(choices.indexOf(selected))}
    onValueChange={(value) => chart.setAxes({ [axis]: choices[Number(value)] })}
  >
    <Select.Trigger id="{id}-{axis}">{selected.label}</Select.Trigger>
    <Select.Content>
      {#each choices as quantity, index (quantity)}
        <Select.Item value={String(index)} label={quantity.label} />
      {/each}
    </Select.Content>
  </Select.Root>
{/snippet}
