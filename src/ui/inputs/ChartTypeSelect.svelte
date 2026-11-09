<script lang="ts">
  import type { ChartType } from "$lib/core/chartType";
  import type { ModelDeclaration } from "$lib/core/modelDeclaration";
  import type { ChartState } from "$lib/state/session.svelte";
  import { copy } from "$lib/text/copy";
  import { Label } from "$lib/ui/primitives/label";
  import ChoiceSelect from "./ChoiceSelect.svelte";

  interface Props {
    model: ModelDeclaration;
    chart: ChartState;
  }

  let { model, chart }: Props = $props();

  const id = $props.id();
  // Options are addressed by position in this list rather than by any string id: a select's value is text, and a
  // chart type is compared by identity.
  const types: readonly ChartType[] = $derived(model.charts.map((declaredChart) => declaredChart.type));
  const typeGroups = $derived([{ options: types.map((type, index) => ({ key: String(index), label: type.title })) }]);
</script>

<!--
  The chart type, in the chart card's heading row after its title (ADR-0002 decision 89, rule 6), at the small size
  of the row's buttons. Named, not labelled: the heading says "Chart" once, so the label is a screen reader's alone
  (decision 87, rule 4).
-->
<Label for="{id}-type" class="chart-type-label">{copy.chartType}</Label>
<ChoiceSelect
  id="{id}-type"
  size="sm"
  groups={typeGroups}
  chosen={String(types.indexOf(chart.type))}
  onchoose={(key) => (chart.type = types[Number(key)])}
/>
