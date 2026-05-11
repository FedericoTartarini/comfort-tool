<svelte:options runes={true} />

<script lang="ts">
  import { ClothingZone } from "../models/clothingZones";
  import { FieldKey } from "../models/fieldKeys";
  import { fieldMetaByKey } from "../models/inputFieldsMeta";
  import { InputId, type InputId as InputIdType } from "../models/inputSlots";
  import type { UnitSystem as UnitSystemType } from "../models/units";
  import {
    buildSelectedClothingSections,
    filterClothingGarments,
    sumSelectedGarmentClo,
  } from "../services/comfort/clothingTools";
  import { clothingGarmentOptions } from "../services/comfort/referenceValues";
  import ClothingGarmentList from "./clothing-builder/ClothingGarmentList.svelte";
  import ClothingSelectionSummary from "./clothing-builder/ClothingSelectionSummary.svelte";
  import ClothingZonePicker from "./clothing-builder/ClothingZonePicker.svelte";

  let {
    activeInputId,
    visibleInputIds,
    unitSystem,
    onSelectInput,
    onApplyClothingValue,
    onClose,
  }: {
    activeInputId: InputIdType;
    visibleInputIds: InputIdType[];
    unitSystem: UnitSystemType;
    onSelectInput: (inputId: InputIdType) => void;
    onApplyClothingValue: (inputId: InputIdType, value: number) => void;
    onClose: () => void;
  } = $props();

  let targetInputId = $state<InputIdType>(InputId.Input1);
  let activeZoneId = $state(ClothingZone.UpperBody);
  let searchQuery = $state("");
  let selectedGarmentIds = $state<string[]>([]);

  const maxClothingValue = fieldMetaByKey[FieldKey.ClothingInsulation].maxValue;

  $effect(() => {
    if (visibleInputIds.includes(activeInputId)) {
      targetInputId = activeInputId;
      return;
    }

    if (!visibleInputIds.includes(targetInputId)) {
      targetInputId = visibleInputIds[0] ?? InputId.Input1;
    }
  });

  const filteredGarments = $derived.by(() => (
    filterClothingGarments(clothingGarmentOptions, activeZoneId, searchQuery)
  ));
  const totalClothingValue = $derived.by(() => (
    sumSelectedGarmentClo(selectedGarmentIds, clothingGarmentOptions)
  ));
  const selectedSections = $derived.by(() => (
    buildSelectedClothingSections(selectedGarmentIds, clothingGarmentOptions)
  ));

  function handleSelectTargetInput(inputId: InputIdType) {
    targetInputId = inputId;
    onSelectInput(inputId);
  }

  function handleToggleGarment(garmentId: string, shouldSelect: boolean) {
    if (shouldSelect) {
      if (!selectedGarmentIds.includes(garmentId)) {
        selectedGarmentIds = [...selectedGarmentIds, garmentId];
      }
      return;
    }

    selectedGarmentIds = selectedGarmentIds.filter((id) => id !== garmentId);
  }

  function handleRemoveGarment(garmentId: string) {
    selectedGarmentIds = selectedGarmentIds.filter((id) => id !== garmentId);
  }

  function clearSelection() {
    selectedGarmentIds = [];
    searchQuery = "";
  }

  function applyClothingValue(value: number) {
    onSelectInput(targetInputId);
    onApplyClothingValue(targetInputId, value);
    onClose();
  }
</script>

<section class="p-4 sm:p-5 md:p-6 xl:h-full xl:min-h-0">
  <div class="grid gap-4 sm:gap-5 xl:h-full xl:min-h-0 xl:grid-cols-3 xl:gap-6">
    <ClothingZonePicker
      {activeZoneId}
      onSelectZone={(zoneId) => {
        activeZoneId = zoneId;
      }}
    />

    <ClothingGarmentList
      {activeZoneId}
      {searchQuery}
      garments={filteredGarments}
      {selectedGarmentIds}
      onSearchChange={(value) => {
        searchQuery = value;
      }}
      onToggleGarment={handleToggleGarment}
    />

    <ClothingSelectionSummary
      {visibleInputIds}
      {targetInputId}
      selectedCount={selectedGarmentIds.length}
      {maxClothingValue}
      totalClothingValue={totalClothingValue}
      selectedSections={selectedSections}
      onSelectTargetInput={handleSelectTargetInput}
      onRemoveGarment={handleRemoveGarment}
      onClearSelection={clearSelection}
      onApply={() => applyClothingValue(totalClothingValue)}
    />
  </div>
</section>
