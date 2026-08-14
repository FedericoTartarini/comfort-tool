<svelte:options runes={true} />

<script lang="ts">
  import { Button, Input, Label, Toggle } from "flowbite-svelte";

  import { inputDisplayMetaById } from "../../models/inputSlotPresentation";
  import type { InputId as InputIdType } from "../../models/inputSlots";
  import type { UnitSystem as UnitSystemType } from "../../models/units";
  import {
    setInputModifierDraftEnabled,
    updateInputModifierDraftInput,
  } from "../../state/comfortTool/modifierState";
  import type {
    InputModifierControlViewModel,
    InputModifierDraftEntry,
    ModifierFieldControlViewModel,
  } from "../../state/comfortTool/types";

  interface Props {
    modifierControls: InputModifierControlViewModel[];
    visibleInputIds: InputIdType[];
    unitSystem: UnitSystemType;
    draft: readonly InputModifierDraftEntry[];
    applyError: string;
    onDraftChange: (draft: InputModifierDraftEntry[]) => void;
    onCancel: () => void;
    onApply: () => void;
  }

  let {
    modifierControls,
    visibleInputIds,
    unitSystem,
    draft,
    applyError,
    onDraftChange,
    onCancel,
    onApply,
  }: Props = $props();

  function matrixColumns() {
    return `repeat(${visibleInputIds.length}, minmax(0, 1fr))`;
  }

  function isModifierToggleDisabled(
    modifier: InputModifierControlViewModel,
    inputId: InputIdType,
  ) {
    return !(modifier.completeByInput[inputId] ?? false)
      && !(modifier.activeByInput[inputId] ?? false);
  }

  function setModifierEnabled(
    modifier: InputModifierControlViewModel,
    inputId: InputIdType,
    enabled: boolean,
  ) {
    const nextDraft = setInputModifierDraftEnabled(
      draft,
      inputId,
      modifier.id,
      enabled,
    );
    if (nextDraft) onDraftChange(nextDraft);
  }

  function commitModifierInput(
    modifier: InputModifierControlViewModel,
    field: ModifierFieldControlViewModel,
    inputId: InputIdType,
    input: HTMLInputElement,
  ) {
    const nextDraft = updateInputModifierDraftInput(
      draft,
      inputId,
      modifier.id,
      field.key,
      input.value,
      unitSystem,
    );
    if (!nextDraft) {
      input.value = field.displayValuesByInput[inputId] ?? "";
      return;
    }
    onDraftChange(nextDraft);
  }
</script>

<div class="flex max-h-[calc(84svh-4.5rem)] min-h-0 flex-col">
  <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 md:px-6">
    <p class="text-sm text-stone-600">
      Configure optional calculations that derive effective SI inputs. Base input values remain unchanged.
    </p>

    {#if applyError}
      <p class="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
        {applyError}
      </p>
    {/if}

    <div class="mt-4 grid gap-4 xl:grid-cols-2">
      {#each modifierControls as modifier}
        <fieldset class="min-w-0 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <legend class="px-1 text-sm font-semibold text-stone-900">{modifier.label}</legend>
          <p class="text-xs text-stone-500">{modifier.description}</p>

          <div
            class="mt-3 grid gap-2"
            style={`grid-template-columns: ${matrixColumns()};`}
          >
            {#each visibleInputIds as inputId}
              <div class="rounded-xl border border-stone-200 bg-white px-3 py-2.5">
                <div class="flex items-center justify-between gap-2">
                  <span class={`text-xs font-semibold ${inputDisplayMetaById[inputId].accentClass}`}>
                    {inputDisplayMetaById[inputId].shortLabel}
                  </span>
                  <!-- Flowbite 0.47 retains its disabled filter classes unless the toggle remounts. -->
                  {#key isModifierToggleDisabled(modifier, inputId)}
                    <Toggle
                      checked={modifier.activeByInput[inputId] ?? false}
                      disabled={isModifierToggleDisabled(modifier, inputId)}
                      onchange={(event) => setModifierEnabled(
                        modifier,
                        inputId,
                        event.currentTarget.checked,
                      )}
                      aria-label={`${inputDisplayMetaById[inputId].label} ${modifier.label}`}
                      color="teal"
                      size="small"
                    />
                  {/key}
                </div>
                {#if !(modifier.completeByInput[inputId] ?? false)}
                  <p class="mt-1 text-[0.7rem] text-stone-500">Complete all fields to enable.</p>
                {/if}
              </div>
            {/each}
          </div>

          {#if modifier.extraInputs.length > 0}
            <div class="mt-4 grid gap-3">
              {#each modifier.extraInputs as field}
                <div>
                  <Label class="text-xs font-medium text-stone-700">
                    {field.label}{field.displayUnits ? ` (${field.displayUnits})` : ""}
                  </Label>
                  <div
                    class="mt-1 grid gap-2"
                    style={`grid-template-columns: ${matrixColumns()};`}
                  >
                    {#each visibleInputIds as inputId}
                      <Input
                        id={`modifier-${modifier.id}-${field.key}-${inputId}`}
                        type="number"
                        min={field.minValue}
                        max={field.maxValue}
                        step={field.step}
                        size="sm"
                        value={field.displayValuesByInput[inputId] ?? ""}
                        placeholder={inputDisplayMetaById[inputId].shortLabel}
                        aria-label={`${inputDisplayMetaById[inputId].label} ${field.label}`}
                        onchange={(event) => commitModifierInput(
                          modifier,
                          field,
                          inputId,
                          event.currentTarget,
                        )}
                        onkeydown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            event.currentTarget.blur();
                            return;
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            event.currentTarget.value =
                              field.displayValuesByInput[inputId] ?? "";
                            event.currentTarget.blur();
                          }
                        }}
                        class="rounded-lg border-stone-300 bg-white"
                      />
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="mt-4 rounded-xl border border-dashed border-stone-200 bg-white px-3 py-2 text-xs text-stone-500">
              No additional values are required.
            </p>
          {/if}

          {#each modifier.affectedFields as affectedField}
            <div
              class="mt-4 grid gap-2"
              style={`grid-template-columns: ${matrixColumns()};`}
            >
              {#each visibleInputIds as inputId}
                {#if modifier.activeByInput[inputId]}
                  <p class="rounded-xl bg-teal-50 px-3 py-2 text-xs text-teal-900">
                    {affectedField.label}:
                    <strong>
                      {affectedField.displayValuesByInput[inputId]}
                      {affectedField.displayUnits}
                    </strong>
                  </p>
                {:else}
                  <div></div>
                {/if}
              {/each}
            </div>
          {/each}
        </fieldset>
      {/each}
    </div>
  </div>

  <div class="flex shrink-0 justify-end gap-2 border-t border-stone-200 bg-white px-4 py-3 sm:px-5 md:px-6">
    <Button color="light" size="sm" onclick={onCancel}>Cancel</Button>
    <Button
      color="none"
      size="sm"
      class="bg-stone-900 text-white hover:bg-stone-800"
      onclick={onApply}
    >
      Apply changes
    </Button>
  </div>
</div>
