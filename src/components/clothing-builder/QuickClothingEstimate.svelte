<svelte:options runes={true} />

<script lang="ts">
  import { Badge, Button, ButtonGroup, Input, Label } from "flowbite-svelte";

  import { FieldKey } from "../../models/fieldKeys";
  import { fieldMetaByKey } from "../../models/inputFieldsMeta";
  import { inputDisplayMetaById } from "../../models/inputSlotPresentation";
  import { InputId, type InputId as InputIdType } from "../../models/inputSlots";
  import type { UnitSystem as UnitSystemType } from "../../models/units";
  import { predictClothingInsulation } from "../../services/comfort/clothingTools";

  let {
    activeInputId,
    visibleInputIds,
    unitSystem,
    maxClothingValue,
    onSelectInput,
    onApplyClothingValue,
    onClose,
  }: {
    activeInputId: InputIdType;
    visibleInputIds: InputIdType[];
    unitSystem: UnitSystemType;
    maxClothingValue: number;
    onSelectInput: (inputId: InputIdType) => void;
    onApplyClothingValue: (inputId: InputIdType, value: number) => void;
    onClose: () => void;
  } = $props();

  let targetInputId = $state<InputId.Input1 | InputId.Input2 | InputId.Input3>(InputId.Input1);
  let predictiveOutdoorTemperature = $state<string>("");

  const predictiveTemperatureInputId = "quick-clothing-predictive-temperature";
  const temperatureStep = fieldMetaByKey[FieldKey.DryBulbTemperature].step;
  const temperatureDisplayUnits = $derived(fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem]);
  const targetInputMeta = $derived(inputDisplayMetaById[targetInputId]);
  const predictiveOutdoorTemperatureValue = $derived.by(() => {
    const normalizedValue = predictiveOutdoorTemperature.trim();
    if (!normalizedValue) {
      return null;
    }

    const parsedValue = Number(normalizedValue);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  });
  const predictedClothingValue = $derived.by(() => {
    if (predictiveOutdoorTemperatureValue === null) {
      return null;
    }

    return predictClothingInsulation(predictiveOutdoorTemperatureValue, unitSystem);
  });
  const predictedClothingDisplayValue = $derived.by(() => (
    predictedClothingValue === null ? "0.00" : predictedClothingValue.toFixed(2)
  ));

  $effect(() => {
    if (visibleInputIds.includes(activeInputId)) {
      targetInputId = activeInputId;
      return;
    }

    if (!visibleInputIds.includes(targetInputId)) {
      targetInputId = visibleInputIds[0] ?? InputId.Input1;
    }
  });

  function handleSelectTargetInput(inputId: InputIdType) {
    targetInputId = inputId;
    onSelectInput(inputId);
  }

  function handleApplyPrediction() {
    if (predictedClothingValue === null) {
      return;
    }

    onSelectInput(targetInputId);
    onApplyClothingValue(targetInputId, predictedClothingValue);
    onClose();
  }
</script>

<section class="grid gap-5 p-5 md:p-6">
  <div>
    {#if visibleInputIds.length > 1}
      <ButtonGroup>
        {#each visibleInputIds as inputId}
          <Button
            size="sm"
            onclick={() => handleSelectTargetInput(inputId)}
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

  <div class="grid gap-2">
    <Label for={predictiveTemperatureInputId} class="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
      Outdoor air temperature at 6 a.m. ({temperatureDisplayUnits})
    </Label>
    <Input
      id={predictiveTemperatureInputId}
      type="number"
      step={temperatureStep}
      value={predictiveOutdoorTemperature}
      placeholder={`Enter temperature in ${temperatureDisplayUnits}`}
      oninput={(event) => (predictiveOutdoorTemperature = event.currentTarget.value)}
      class="rounded-2xl border-stone-300 bg-stone-50"
    />
  </div>

  <div class="panel-muted px-4 py-4">
    <p class="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Estimated Clothing</p>
    <p class="mt-2 text-sm font-semibold text-stone-900">{predictedClothingDisplayValue} clo</p>
    {#if predictedClothingValue !== null && predictedClothingValue > maxClothingValue}
      <Badge color="yellow" class="mt-3 text-xs">
        Exceeds the recommended input range ({maxClothingValue.toFixed(1)} clo)
      </Badge>
    {/if}
  </div>

  <Button
    onclick={handleApplyPrediction}
    disabled={predictedClothingValue === null}
    class="w-full bg-stone-900 text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
  >
    Apply to {targetInputMeta.shortLabel}
  </Button>
</section>
