<script lang="ts">
  /**
   * @component
   * ChartLegend.svelte
   *
   * Renders the thermal comfort zone legends for various charts.
   * Dynamically displays color-coded categories for PMV, UTCI, Adaptive, and other thermal models.
   */
  import {
    ChartId,
    type ChartId as ChartIdType,
  } from "../../models/chartOptions";
  import type { ComfortModel as ComfortModelType } from "../../models/comfortModels";
  import { ComfortModel } from "../../models/comfortModels";
  import {
    adaptiveAshraeZones,
    adaptiveEnZones,
    heatIndexZones,
    humidexZones,
    windChillZones,
    pmvZones,
    utciStressBands,
  } from "../../services/comfort/helpers";

  let {
    selectedChart,
    selectedModel,
  }: { selectedChart: ChartIdType; selectedModel: ComfortModelType } = $props();

  const utciZones = utciStressBands.map((band) => ({
    label: band.label,
    color: band.color,
  }));

  const isPmvChart = $derived(
    selectedChart === ChartId.Psychrometric ||
      selectedChart === ChartId.PmvDynamic,
  );

  const isUtciChart = $derived(
    selectedChart === ChartId.Stress || selectedChart === ChartId.UtciDynamic,
  );
</script>

{#if isPmvChart}
  <div
    class="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-stone-100 pt-4"
  >
    <span class="text-xs font-semibold uppercase tracking-wider text-stone-400"
      >PMV Zones</span
    >
    <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      {#each pmvZones as zone}
        <div class="flex items-center gap-1.5">
          <div
            class="h-2.5 w-2.5 rounded-full border border-stone-200 shadow-sm"
            style="background-color: {zone.color}"
          ></div>
          <span class="text-[11px] font-medium text-stone-500"
            >{zone.label}</span
          >
        </div>
      {/each}
    </div>
  </div>
{/if}

{#if isUtciChart}
  <div
    class="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-stone-100 pt-4"
  >
    <span class="text-xs font-semibold uppercase tracking-wider text-stone-400"
      >UTCI Zones</span
    >
    <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      {#each utciZones as zone}
        <div class="flex items-center gap-1.5">
          <div
            class="h-2.5 w-2.5 rounded-full border border-stone-200 shadow-sm"
            style="background-color: {zone.color}"
          ></div>
          <span class="text-[11px] font-medium text-stone-500"
            >{zone.label}</span
          >
        </div>
      {/each}
    </div>
  </div>
{/if}

{#if selectedChart === ChartId.HeatIndexRanges || selectedChart === ChartId.HeatIndexDynamic}
  <div
    class="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-stone-100 pt-4"
  >
    <span class="text-xs font-semibold uppercase tracking-wider text-stone-400"
      >Heat Index</span
    >
    <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      {#each heatIndexZones as zone}
        <div class="flex items-center gap-1.5">
          <div
            class="h-2.5 w-2.5 rounded-full border border-stone-200 shadow-sm"
            style="background-color: {zone.color}"
          ></div>
          <span class="text-[11px] font-medium text-stone-500"
            >{zone.label}</span
          >
        </div>
      {/each}
    </div>
  </div>
{/if}

{#if selectedChart === ChartId.Humidex || selectedChart === ChartId.HumidexDynamic}
  <div
    class="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-stone-100 pt-4"
  >
    <span class="text-xs font-semibold uppercase tracking-wider text-stone-400"
      >Humidex</span
    >
    <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      {#each humidexZones as zone}
        <div class="flex items-center gap-1.5">
          <div
            class="h-2.5 w-2.5 rounded-full border border-stone-200 shadow-sm"
            style="background-color: {zone.color}"
          ></div>
          <span class="text-[11px] font-medium text-stone-500"
            >{zone.label}</span
          >
        </div>
      {/each}
    </div>
  </div>
{/if}

{#if selectedChart === ChartId.WindChill || selectedChart === ChartId.WindChillDynamic}
  <div
    class="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-stone-100 pt-4"
  >
    <span class="text-xs font-semibold uppercase tracking-wider text-stone-400"
      >Wind Chill</span
    >
    <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      {#each windChillZones as zone}
        <div class="flex items-center gap-1.5">
          <div
            class="h-2.5 w-2.5 rounded-full border border-stone-200 shadow-sm"
            style="background-color: {zone.color}"
          ></div>
          <span class="text-[11px] font-medium text-stone-500"
            >{zone.label}</span
          >
        </div>
      {/each}
    </div>
  </div>
{/if}

{#if selectedChart === ChartId.Adaptive || selectedChart === ChartId.AdaptiveDynamic}
  <div
    class="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-stone-100 pt-4"
  >
    <span class="text-xs font-semibold uppercase tracking-wider text-stone-400"
      >Adaptive Zones</span
    >
    <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      {#each selectedModel === ComfortModel.AdaptiveAshrae ? adaptiveAshraeZones : adaptiveEnZones as zone}
        <div class="flex items-center gap-1.5">
          <div
            class="h-2.5 w-2.5 rounded-full border border-stone-200 shadow-sm"
            style="background-color: {zone.color}"
          ></div>
          <span class="text-[11px] font-medium text-stone-500"
            >{zone.label}</span
          >
        </div>
      {/each}
    </div>
  </div>
{/if}
