<svelte:options runes={true} />

<script lang="ts">
  import { Button, Card, Modal } from "flowbite-svelte";

  import ClothingEnsembleBuilder from "../ClothingEnsembleBuilder.svelte";
  import InputFieldRow from "./InputFieldRow.svelte";
  import InputModifiers from "./InputModifiers.svelte";
  import {
    inputOrder,
    type InputId as InputIdType,
  } from "../../models/inputSlots";
  import { inputDisplayMetaById } from "../../models/inputSlotPresentation";
  import ToolControls from "./ToolControls.svelte";
  import type { InputPanelViewModel } from "../../state/comfortTool/types";

  interface Props {
    panel: InputPanelViewModel;
  }

  let { panel }: Props = $props();

  let clothingBuilderOpen = $state(false);

  $effect(() => {
    if (panel.clothingBuilder === null) {
      clothingBuilderOpen = false;
    }
  });

  function isInputVisible(inputId: InputIdType) {
    return panel.compare?.visibleInputIds.includes(inputId) ?? false;
  }

  function getCompareToggleClasses(inputId: InputIdType) {
    const inputUi = inputDisplayMetaById[inputId].ui;
    return isInputVisible(inputId)
      ? `border-solid bg-white ${inputUi.inputToggleVisibleClass}`
      : `border-dashed bg-stone-50 ${inputUi.inputToggleHiddenClass}`;
  }
</script>

<Card size="none" class="w-full border-stone-300 bg-white p-3 shadow-sm">
  <header class="flex items-start justify-between gap-3 pb-2">
    <h2 class="text-lg font-semibold text-stone-900">Inputs</h2>
  </header>

  <ToolControls tool={panel.tool} />

  <div class="mt-4 bg-white">
    {#if panel.compare}
      {@const compare = panel.compare}
      <fieldset class="px-1 pb-2">
        <legend class="sr-only">Visible compare inputs</legend>
        <ul class="grid gap-2 md:grid-cols-3">
          {#each inputOrder as inputId}
            <li class="w-full">
              <Button
                color="none"
                class={`w-full rounded-sm border px-2 py-1.5 text-left ${getCompareToggleClasses(inputId)}`}
                onclick={() => compare.onToggle(inputId)}
              >
                <span class="text-sm font-semibold"
                  >{inputDisplayMetaById[inputId].label}</span
                >
              </Button>
            </li>
          {/each}
        </ul>
      </fieldset>
    {/if}

    <div class="grid gap-1" aria-label="Input fields">
      {#each panel.fields as field}
        <InputFieldRow
          {field}
          onOpenClothingBuilder={() => {
            clothingBuilderOpen = true;
          }}
        />
      {/each}
    </div>

    {#if panel.modifiers}
      <InputModifiers modifiers={panel.modifiers} />
    {/if}
  </div>
</Card>

{#if panel.clothingBuilder}
  {@const clothingBuilder = panel.clothingBuilder}
  <Modal
    bind:open={clothingBuilderOpen}
    size="xl"
    autoclose={false}
    outsideclose={true}
    class="modal-shell-soft"
    classHeader="items-start justify-end gap-4 px-5 py-4 md:px-6"
    classBody="max-h-[84svh] overflow-y-auto p-0 xl:h-[84svh] xl:overflow-hidden"
  >
    <ClothingEnsembleBuilder
      activeInputId={clothingBuilder.activeInputId}
      visibleInputIds={clothingBuilder.visibleInputIds}
      maxClothingValue={clothingBuilder.maxValue}
      onSelectInput={clothingBuilder.onSelectInput}
      onApplyClothingValue={clothingBuilder.onApplyClothingValue}
      onClose={() => {
        clothingBuilderOpen = false;
      }}
    />
  </Modal>
{/if}
