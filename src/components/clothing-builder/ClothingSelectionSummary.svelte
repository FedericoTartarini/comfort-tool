<svelte:options runes={true} />

<script lang="ts">
  import { Badge, Button, ButtonGroup } from "flowbite-svelte";

  import { inputDisplayMetaById } from "../../models/inputSlotPresentation";
  import type { InputId as InputIdType } from "../../models/inputSlots";
  import type { ClothingSelectionSection } from "../../services/comfort/clothingTools";

  let {
    visibleInputIds,
    targetInputId,
    selectedCount,
    totalClothingValue,
    maxClothingValue,
    selectedSections,
    onSelectTargetInput,
    onRemoveGarment,
    onClearSelection,
    onApply,
  }: {
    visibleInputIds: InputIdType[];
    targetInputId: InputIdType;
    selectedCount: number;
    totalClothingValue: number;
    maxClothingValue: number;
    selectedSections: ClothingSelectionSection[];
    onSelectTargetInput: (inputId: InputIdType) => void;
    onRemoveGarment: (garmentId: string) => void;
    onClearSelection: () => void;
    onApply: () => void;
  } = $props();

  const targetInputMeta = $derived(inputDisplayMetaById[targetInputId]);
  const selectionSummaryLabel = $derived(
    selectedCount === 0 ? "No garments selected" : `${selectedCount} garments selected`,
  );
</script>

<section class="panel-shell flex h-full min-h-0 flex-col overflow-hidden">
  <header class="shrink-0">
    <p class="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Selected Outfit</p>
    <h3 class="mt-2 text-sm font-semibold text-stone-900">{selectionSummaryLabel}</h3>
    <div class="mt-3">
      {#if visibleInputIds.length > 1}
        <ButtonGroup>
          {#each visibleInputIds as inputId}
            <Button
              size="sm"
              onclick={() => onSelectTargetInput(inputId)}
              title={inputDisplayMetaById[inputId].label}
              class={inputId === targetInputId
                ? inputDisplayMetaById[inputId].ui.clothingTargetActiveClass
                : `border border-stone-200 bg-white ${inputDisplayMetaById[inputId].ui.clothingTargetInactiveClass}`}
            >
              {inputDisplayMetaById[inputId].shortLabel}
            </Button>
          {/each}
        </ButtonGroup>
      {:else}
        <div class={`inline-flex rounded-2xl px-3 py-2 text-sm font-semibold ${targetInputMeta.ui.clothingTargetActiveClass}`}>
          {targetInputMeta.label}
        </div>
      {/if}
    </div>
  </header>

  <div class="panel-muted mt-4 shrink-0 px-4 py-4">
    <p class="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Total Clothing Insulation</p>
    <p class="mt-2 text-sm font-semibold text-stone-900">{totalClothingValue.toFixed(2)} clo</p>
    {#if totalClothingValue > maxClothingValue}
      <Badge color="yellow" class="mt-3 text-xs">
        Exceeds the recommended input range ({maxClothingValue.toFixed(1)} clo)
      </Badge>
    {/if}
  </div>

  <div class="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
    {#if selectedSections.length === 0}
      <div class="panel-empty-state">
        <p class="text-sm font-semibold text-stone-700">Nothing selected yet.</p>
        <p class="mt-1 text-description-muted">Choose garments from any region to build the outfit total.</p>
      </div>
    {:else}
      {#each selectedSections as section}
        <section class="space-y-2">
          <header class="flex items-center justify-between gap-2">
            <h4 class="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{section.label}</h4>
            <span class="text-xs font-semibold text-stone-500">{section.garments.length}</span>
          </header>
          <ul class="space-y-2">
            {#each section.garments as garment}
              <li class="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 px-3 py-2">
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-stone-900">{garment.article}</p>
                  <p class="mt-1 text-xs text-stone-500">{garment.clo.toFixed(2)} clo</p>
                </div>
                <button
                  type="button"
                  class="shrink-0 rounded-full border border-stone-200 px-2.5 py-1 text-xs font-semibold text-stone-600 transition-colors hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900"
                  onclick={() => onRemoveGarment(garment.id)}
                >
                  Remove
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    {/if}
  </div>

  <footer class="mt-4 flex shrink-0 flex-col gap-2 sm:flex-row">
    <Button
      color="alternative"
      onclick={onClearSelection}
      class="flex-1 border border-stone-200 bg-white text-black hover:bg-stone-50"
    >
      Clear all
    </Button>
    <Button
      onclick={onApply}
      disabled={selectedCount === 0}
      class="flex-1 bg-stone-900 text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
    >
      Apply to {targetInputMeta.shortLabel}
    </Button>
  </footer>
</section>
