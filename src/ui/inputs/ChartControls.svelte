<script lang="ts">
  import { dynamicAxisQuantities, resolvedAxes } from "$lib/core/charts/dynamicChart";
  import { chartType } from "$lib/core/chartType";
  import type { RegisteredModel } from "$lib/core/modelDeclaration";
  import type { ChartState, InputSlot } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import { Button } from "$lib/ui/primitives/button";
  import { Label } from "$lib/ui/primitives/label";
  import * as Select from "$lib/ui/primitives/select";

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
      <Select.Root
        type="single"
        value={String(xChoices.indexOf(selected.x))}
        onValueChange={(value) => chart.setAxes({ x: xChoices[Number(value)] })}
      >
        <Select.Trigger id="{id}-x">{selected.x.label}</Select.Trigger>
        <Select.Content>
          {#each xChoices as quantity, index (quantity)}
            <Select.Item value={String(index)} label={quantity.label} />
          {/each}
        </Select.Content>
      </Select.Root>

      <Label for="{id}-y">{copy.yAxis}</Label>
      <Select.Root
        type="single"
        value={String(yChoices.indexOf(selected.y))}
        onValueChange={(value) => chart.setAxes({ y: yChoices[Number(value)] })}
      >
        <Select.Trigger id="{id}-y">{selected.y.label}</Select.Trigger>
        <Select.Content>
          {#each yChoices as quantity, index (quantity)}
            <Select.Item value={String(index)} label={quantity.label} />
          {/each}
        </Select.Content>
      </Select.Root>
    </Inline>
  {/if}
</Inline>
