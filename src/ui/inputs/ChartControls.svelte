<script lang="ts">
  import type { ChartType } from "$lib/core/chartType";
  import type { ChartAxes, RegisteredModel } from "$lib/core/modelDeclaration";
  import type { Quantity } from "$lib/core/quantities";
  import type { DrawnAxes } from "$lib/state/compute.svelte";
  import type { ChartState } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import { Label } from "$lib/ui/primitives/label";
  import * as Select from "$lib/ui/primitives/select";
  import * as ToggleGroup from "$lib/ui/primitives/toggle-group";

  interface Props {
    model: RegisteredModel;
    chart: ChartState;
    /** The axes of the chart on screen, not of the live slot; `null` hides the picker. */
    drawnAxes: DrawnAxes | null;
  }

  let { model, chart, drawnAxes }: Props = $props();

  const id = $props.id();
  // Options are addressed by position in these lists rather than by any string
  // id: a select's or a toggle group's value is text, and a chart type or a
  // Quantity is compared by identity.
  const types: readonly ChartType[] = $derived(model.charts.map((declaredChart) => declaredChart.type));
  // ADR §4.4: each axis excludes the quantity the other one holds — x === y is
  // not a chart.
  const xChoices = $derived(drawnAxes?.choices.filter((quantity) => quantity !== drawnAxes.selected.y) ?? []);
  const yChoices = $derived(drawnAxes?.choices.filter((quantity) => quantity !== drawnAxes.selected.x) ?? []);
</script>

<Inline gap="4" align="baseline">
  <Inline gap="2" align="center">
    <span id="{id}-type">{copy.chart}</span>
    <!-- A click on the chosen type asks for none (an empty value), which the setter ignores. -->
    <ToggleGroup.Root
      type="single"
      variant="outline"
      size="sm"
      aria-labelledby="{id}-type"
      bind:value={
        () => String(types.indexOf(chart.type)),
        (value) => {
          if (value !== "") {
            chart.type = types[Number(value)];
          }
        }
      }
    >
      {#each types as type, index (type)}
        <ToggleGroup.Item value={String(index)}>{type.title}</ToggleGroup.Item>
      {/each}
    </ToggleGroup.Root>
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
