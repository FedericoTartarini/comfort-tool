<script lang="ts">
  import type { LegendEntry } from "$lib/core/charts/chartSpec";

  interface Props {
    entries: readonly LegendEntry[];
  }

  let { entries }: Props = $props();
</script>

<!-- ADR §4.4: the whole chart has exactly one legend and it is always here,
     beside the plot, or under it where the room beside it is too narrow
     (ADR-0002 decision 73, rules 8 and 10). Plotly's own is off. -->
<ul class="chart-legend">
  <!-- Keyed by the entry, not its label: an edited Band list may hold two bands of one label, or two unlabelled. -->
  {#each entries as entry (entry)}
    <li class="swatch-label">
      <span class="swatch swatch-{entry.swatch}" style:--swatch-color={entry.color}></span>
      {entry.label}
    </li>
  {/each}
</ul>
