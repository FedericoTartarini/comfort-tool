<svelte:options runes={true} />

<script lang="ts">
  import { Input, Label } from "flowbite-svelte";

  import { clothingZoneMetaById, type ClothingZoneId } from "../../models/clothingZones";
  import type { ClothingGarmentOption } from "../../services/comfort/referenceValues";

  let {
    activeZoneId,
    searchQuery,
    garments,
    selectedGarmentIds,
    onSearchChange,
    onToggleGarment,
  }: {
    activeZoneId: ClothingZoneId;
    searchQuery: string;
    garments: ClothingGarmentOption[];
    selectedGarmentIds: string[];
    onSearchChange: (value: string) => void;
    onToggleGarment: (garmentId: string, shouldSelect: boolean) => void;
  } = $props();

  const garmentSearchInputId = "clothing-garment-search";
  const activeZoneMeta = $derived(clothingZoneMetaById[activeZoneId]);

  function isSelected(garmentId: string) {
    return selectedGarmentIds.includes(garmentId);
  }
</script>

<section class="panel-shell flex h-full min-h-0 flex-col overflow-hidden">
  <header class="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div class="min-w-0">
      <h3 class="text-sm font-semibold text-stone-900">{activeZoneMeta.label}</h3>
    </div>
    <p class="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-semibold text-stone-600">
      {garments.length} options
    </p>
  </header>

  <div class="mt-4 grid shrink-0 gap-2">
    <Label for={garmentSearchInputId} class="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
      Search in {activeZoneMeta.label.toLowerCase()}
    </Label>
    <Input
      id={garmentSearchInputId}
      type="text"
      value={searchQuery}
      placeholder={`Filter ${activeZoneMeta.label.toLowerCase()} garments`}
      oninput={(event) => onSearchChange(event.currentTarget.value)}
      class="rounded-2xl border-stone-300 bg-stone-50"
    />
  </div>

  <div class="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
    {#if garments.length === 0}
      <div class="panel-empty-state">
        <p class="text-sm font-semibold text-stone-700">No garments match this filter.</p>
      </div>
    {:else}
      {#each garments as garment}
        <button
          type="button"
          class={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
            isSelected(garment.id)
              ? "border-stone-900 bg-stone-900 text-white shadow-sm"
              : "border-stone-200 bg-white text-stone-800 hover:border-stone-300 hover:bg-stone-50"
          }`}
          onclick={() => onToggleGarment(garment.id, !isSelected(garment.id))}
        >
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold">{garment.article}</p>
            <p class={isSelected(garment.id) ? "mt-1 text-xs text-stone-300" : "mt-1 text-xs text-stone-500"}>
              {garment.clo.toFixed(2)} clo
            </p>
          </div>
          <span
            class={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
              isSelected(garment.id)
                ? "bg-white/15 text-white"
                : "bg-stone-900 text-white"
            }`}
          >
            {isSelected(garment.id) ? "Selected" : "Add"}
          </span>
        </button>
      {/each}
    {/if}
  </div>
</section>
