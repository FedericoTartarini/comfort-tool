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
  import ChoiceSelect from "./ChoiceSelect.svelte";

  interface Props {
    model: RegisteredModel;
    chart: ChartState;
    /** The axes of the chart on screen, not of the live slot; `null` hides the picker. */
    drawnAxes: DrawnAxes | null;
  }

  let { model, chart, drawnAxes }: Props = $props();

  const id = $props.id();
  // Options are addressed by position in these lists rather than by any string
  // id: a select's value is text, and a chart type or a Quantity is compared by
  // identity.
  const types: readonly ChartType[] = $derived(model.charts.map((declaredChart) => declaredChart.type));
  const typeGroups = $derived([{ options: types.map((type, index) => ({ key: String(index), label: type.title })) }]);
  // ADR §4.4: each axis excludes the quantity the other one holds — x === y is
  // not a chart.
  const xChoices = $derived(drawnAxes?.choices.filter((quantity) => quantity !== drawnAxes.selected.y) ?? []);
  const yChoices = $derived(drawnAxes?.choices.filter((quantity) => quantity !== drawnAxes.selected.x) ?? []);
</script>

<!--
  The chart card's view row (ADR-0002 decision 73, rule 8 as revised 2026-10-12): the chart type, then the axis
  selects where the chart declares axes. Every control in it is the small size, so the row, while it holds one line, is
  one height on both chart types and a switch between them moves no row and not the plot.
-->
<Inline gap="2" align="center">
  <!-- Named, not labelled: the card's heading says "Chart" once, so the label is a screen reader's alone (ADR-0002
       decision 87, rule 4). -->
  <Label for="{id}-type" class="chart-type-label">{copy.chartType}</Label>
  <ChoiceSelect
    id="{id}-type"
    size="sm"
    groups={typeGroups}
    chosen={String(types.indexOf(chart.type))}
    onchoose={(key) => (chart.type = types[Number(key)])}
  />
  {#if drawnAxes}
    {@render axisPicker("x", copy.xAxis, xChoices, drawnAxes.selected.x)}
    {@render axisPicker("y", copy.yAxis, yChoices, drawnAxes.selected.y)}
  {/if}
</Inline>

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
