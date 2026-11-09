<script lang="ts">
  import type { LegendItem } from "$lib/core/charts/chartSpec";

  interface Props {
    items: readonly LegendItem[];
  }

  let { items }: Props = $props();
</script>

<!-- ADR §4.4: the whole chart has exactly one legend and it is always here,
     a row above the plot that wraps (ADR-0002 decision 89, rule 3). Plotly's
     own is off. -->
<ul class="chart-legend">
  <!-- Keyed by the item, not its label: an edited Band list may hold two bands of one label, or two unlabelled. -->
  {#each items as item (item)}
    <li class="swatch-label">
      <span class="swatch swatch-{item.swatch}" style:--swatch-color={item.color}></span>
      {item.label}
    </li>
  {/each}
</ul>
