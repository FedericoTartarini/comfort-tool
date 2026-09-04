<script lang="ts">
  import { dynamicAxisQuantities, resolvedAxes } from "$lib/core/charts/dynamicChart";
  import { chartType } from "$lib/core/chartType";
  import type { RegisteredModel } from "$lib/core/modelDeclaration";
  import type { ChartState, InputSlot } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import { Button } from "$lib/ui/primitives/button";
  import { Label } from "$lib/ui/primitives/label";

  interface Props {
    model: RegisteredModel;
    inputSlot: InputSlot;
    chart: ChartState;
  }

  let { model, inputSlot, chart }: Props = $props();

  const id = $props.id();
  // Options are addressed by position in this list rather than by any string
  // id: a <select> value is text, and a Quantity is compared by identity.
  const axisChoices = $derived(dynamicAxisQuantities(model, inputSlot.temperature.mode));
  const showAxes = $derived(chart.type === chartType.dynamic);
  // The chart remembers the axis the user picked; the entry mode decides which
  // temperature quantity that actually is right now.
  const selected = $derived(resolvedAxes(model, chart.axes, inputSlot.temperature.mode));
  // ADR §4.4: each axis excludes the quantity the other one holds — x === y is
  // not a chart.
  const xChoices = $derived(axisChoices.filter((quantity) => quantity !== selected.y));
  const yChoices = $derived(axisChoices.filter((quantity) => quantity !== selected.x));
</script>

<Inline gap="4" align="baseline">
  <Inline gap="2" align="center">
    <span>{copy.chart}</span>
    {#each model.charts as declaration (declaration.type)}
      <Button
        size="sm"
        variant={chart.type === declaration.type ? "default" : "outline"}
        onclick={() => chart.setType(declaration.type)}
      >
        {declaration.type.title}
      </Button>
    {/each}
  </Inline>

  {#if showAxes}
    <Inline gap="2" align="center">
      <Label for="{id}-x">{copy.xAxis}</Label>
      <select
        id="{id}-x"
        value={String(xChoices.indexOf(selected.x))}
        onchange={(event) => chart.setAxes({ x: xChoices[Number(event.currentTarget.value)] })}
      >
        {#each xChoices as quantity, index (quantity)}
          <option value={String(index)}>{quantity.label}</option>
        {/each}
      </select>

      <Label for="{id}-y">{copy.yAxis}</Label>
      <select
        id="{id}-y"
        value={String(yChoices.indexOf(selected.y))}
        onchange={(event) => chart.setAxes({ y: yChoices[Number(event.currentTarget.value)] })}
      >
        {#each yChoices as quantity, index (quantity)}
          <option value={String(index)}>{quantity.label}</option>
        {/each}
      </select>
    </Inline>
  {/if}
</Inline>

<style>
  select {
    height: 2rem;
    padding: 0 0.5rem;
    font-size: 0.875rem;
    color: var(--foreground);
    background-color: var(--background);
    border: 1px solid var(--input);
    border-radius: var(--radius);
  }
</style>
