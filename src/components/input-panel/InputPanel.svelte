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
  import { InputControlId } from "../../models/inputControls";
  import ToolControls from "./ToolControls.svelte";
  import type { ComfortToolController } from "../../state/comfortTool/types";
  import type { ComfortModel as ComfortModelType } from "../../models/comfortModels";

  interface Props {
    toolState: ComfortToolController;
    allowedModelIds: readonly ComfortModelType[];
    onSelectModel: (modelId: ComfortModelType) => void;
  }

  let { toolState, allowedModelIds, onSelectModel }: Props = $props();

  let clothingBuilderOpen = $state(false);
  const inputControls = $derived(toolState.selectors.getInputControls());
  const maxClothingValue = $derived(
    inputControls.find((control) => control.id === InputControlId.ClothingInsulation)?.maxValue,
  );

  $effect(() => {
    if (maxClothingValue === undefined) {
      clothingBuilderOpen = false;
    }
  });

  function handleApplyClothingValue(inputId: InputIdType, value: number) {
    toolState.actions.setActiveInputId(inputId);
    toolState.actions.updateInput(
      inputId,
      InputControlId.ClothingInsulation,
      value.toFixed(2),
    );
  }

  function isInputVisible(inputId: InputIdType) {
    return toolState.selectors.getVisibleInputIds().includes(inputId);
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

  <ToolControls {toolState} {allowedModelIds} {onSelectModel} />

  <div class="mt-4 bg-white">
    {#if toolState.state.ui.compareEnabled}
      <fieldset class="px-1 pb-2">
        <legend class="sr-only">Visible compare inputs</legend>
        <ul class="grid gap-2 md:grid-cols-3">
          {#each inputOrder as inputId}
            <li class="w-full">
              <Button
                color="none"
                class={`w-full rounded-sm border px-2 py-1.5 text-left ${getCompareToggleClasses(inputId)}`}
                onclick={() =>
                  toolState.actions.toggleCompareInputVisibility(inputId)}
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
      {#each inputControls as control}
        <InputFieldRow
          {toolState}
          {control}
          onOpenClothingBuilder={() => {
            clothingBuilderOpen = true;
          }}
        />
      {/each}
    </div>

    <InputModifiers {toolState} />
  </div>
</Card>

{#if maxClothingValue !== undefined}
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
      activeInputId={toolState.state.ui.activeInputId}
      visibleInputIds={toolState.selectors.getVisibleInputIds()}
      {maxClothingValue}
      onSelectInput={toolState.actions.setActiveInputId}
      onApplyClothingValue={handleApplyClothingValue}
      onClose={() => {
        clothingBuilderOpen = false;
      }}
    />
  </Modal>
{/if}
