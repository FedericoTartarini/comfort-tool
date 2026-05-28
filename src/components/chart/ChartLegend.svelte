<script lang="ts">
  /**
   * @component
   * ChartLegend.svelte
   *
   * Renders the thermal comfort zone legends dynamically based on passed zones and title.
   */

  type LegendZone = {
    readonly label: string;
    readonly color: string;
  };

  interface Props {
    zones: ReadonlyArray<LegendZone> | null;
    legendTitle: string;
  }

  let { zones = null, legendTitle = "" }: Props = $props();
</script>

{#snippet legendSection(title: string, zonesList: ReadonlyArray<LegendZone>)}
  <div
    class="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-stone-100 pt-4"
  >
    <span class="text-xs font-semibold uppercase tracking-wider text-stone-400"
      >{title}</span
    >
    <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      {#each zonesList as zone}
        <div class="flex items-center gap-1.5">
          <div
            class="h-2.5 w-2.5 rounded-full border border-stone-200 shadow-sm"
            style="background-color: {zone.color}"
          ></div>
          <span class="text-xs font-medium text-stone-500"
            >{zone.label}</span
          >
        </div>
      {/each}
    </div>
  </div>
{/snippet}

{#if zones && zones.length > 0}
  {@render legendSection(legendTitle, zones)}
{/if}
