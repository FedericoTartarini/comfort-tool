<script lang="ts">
  import type { LegendEntry } from "$lib/core/charts/chartSpec";

  interface Props {
    entries: readonly LegendEntry[];
  }

  let { entries }: Props = $props();
</script>

<!-- ADR §4.4: the whole chart has exactly one legend and it is always here,
     below the chart. Plotly's own is off. -->
<ul>
  {#each entries as entry (entry.label)}
    <li>
      <span class="swatch {entry.swatch}" style:--swatch-color={entry.color}></span>
      {entry.label}
    </li>
  {/each}
</ul>

<style>
  ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }

  li {
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    white-space: nowrap;
  }

  .swatch {
    display: inline-block;
    width: 0.85em;
    height: 0.85em;
    background-color: var(--swatch-color);
    border: 1px solid var(--border);
  }

  .swatch.line {
    height: 0;
    border: 0;
    border-top: 2px solid var(--swatch-color);
  }

  .swatch.marker {
    border-radius: 50%;
    border-color: var(--swatch-color);
  }
</style>
