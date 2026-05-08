<svelte:options runes={true} />

<script lang="ts">
  import { Button, Card, Heading, Modal } from "flowbite-svelte";

  import ClothingEnsembleBuilder from "../ClothingEnsembleBuilder.svelte";
  import QuickClothingEstimate from "../clothing-builder/QuickClothingEstimate.svelte";
  import InputFieldRow from "./InputFieldRow.svelte";
  import { inputOrder, type InputId as InputIdType } from "../../models/inputSlots";
  import { inputDisplayMetaById } from "../../models/inputSlotPresentation";
  import { FieldKey } from "../../models/fieldKeys";
  import { fieldMetaByKey } from "../../models/inputFieldsMeta";
  import { InputControlId } from "../../models/inputControls";
  import ToolControls from "./ToolControls.svelte";
  import type { ComfortToolController } from "../../state/comfortTool/types";

  let {
    toolState,
  }: {
    toolState: ComfortToolController;
  } = $props();

  let clothingBuilderOpen = $state(false);
  let quickClothingEstimateOpen = $state(false);
  const maxClothingValue = fieldMetaByKey[FieldKey.ClothingInsulation].maxValue;

  function handleApplyClothingValue(inputId, value) {
    toolState.actions.setActiveInputId(inputId);
    toolState.actions.updateInput(inputId, InputControlId.ClothingInsulation, value.toFixed(2));
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
    <h2 class="text-base font-semibold text-stone-900">Inputs</h2>
  </header>

  <ToolControls {toolState} />

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
                onclick={() => toolState.actions.toggleCompareInputVisibility(inputId)}
              >
                <span class="text-sm font-semibold">{inputDisplayMetaById[inputId].label}</span>
              </Button>
            </li>
          {/each}
        </ul>
      </fieldset>
    {/if}

    <div class="grid gap-1" aria-label="Input fields">
      {#each toolState.selectors.getInputControls() as control}
        <InputFieldRow
          {toolState}
          {control}
          onOpenClothingBuilder={() => {
            clothingBuilderOpen = true;
          }}
          onOpenQuickClothingEstimate={() => {
            quickClothingEstimateOpen = true;
          }}
        />
      {/each}
    </div>
  </div>
</Card>

<Modal
  bind:open={clothingBuilderOpen}
  size="xl"
  autoclose={false}
  outsideclose={true}
  class="modal-shell-soft"
  classHeader="items-start justify-end gap-4 px-5 py-4 md:px-6"
  classBody="h-[84svh] overflow-hidden p-0"
>
  <ClothingEnsembleBuilder
    activeInputId={toolState.state.ui.activeInputId}
    visibleInputIds={toolState.selectors.getVisibleInputIds()}
    unitSystem={toolState.state.ui.unitSystem}
    onSelectInput={toolState.actions.setActiveInputId}
    onApplyClothingValue={handleApplyClothingValue}
    onClose={() => {
      clothingBuilderOpen = false;
    }}
  />
</Modal>

<Modal
  bind:open={quickClothingEstimateOpen}
  size="md"
  autoclose={false}
  outsideclose={true}
  class="modal-shell-soft"
  classHeader="items-start justify-end gap-4 px-5 py-4 md:px-6"
  classBody="overflow-y-auto p-0"
>
  <QuickClothingEstimate
    activeInputId={toolState.state.ui.activeInputId}
    visibleInputIds={toolState.selectors.getVisibleInputIds()}
    unitSystem={toolState.state.ui.unitSystem}
    {maxClothingValue}
    onSelectInput={toolState.actions.setActiveInputId}
    onApplyClothingValue={handleApplyClothingValue}
    onClose={() => {
      quickClothingEstimateOpen = false;
    }}
  />
</Modal>
