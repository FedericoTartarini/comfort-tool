<svelte:options runes={true} />

<script lang="ts">
  import { Accordion, AccordionItem, Input, Label, Toggle } from "flowbite-svelte";

  import { inputDisplayMetaById } from "../../models/inputSlotPresentation";
  import type { InputId as InputIdType } from "../../models/inputSlots";
  import type {
    ComfortToolController,
    InputModifierControlViewModel,
    ModifierFieldControlViewModel,
  } from "../../state/comfortTool/types";

  interface Props {
    toolState: ComfortToolController;
  }

  let { toolState }: Props = $props();

  const modifierControls = $derived(toolState.selectors.getInputModifierControls());
  const visibleInputIds = $derived(toolState.selectors.getVisibleInputIds());

  function matrixColumns() {
    return `repeat(${visibleInputIds.length}, minmax(0, 1fr))`;
  }

  function commitModifierInput(
    modifier: InputModifierControlViewModel,
    field: ModifierFieldControlViewModel,
    inputId: InputIdType,
    input: HTMLInputElement,
  ) {
    toolState.actions.setActiveInputId(inputId);
    const committed = toolState.actions.updateModifierInput(
      inputId,
      modifier.id,
      field.key,
      input.value,
    );
    if (!committed) input.value = field.displayValuesByInput[inputId] ?? "";
  }
</script>

{#if modifierControls.length > 0}
  <section class="mt-4 border-t border-stone-200 pt-3" aria-label="Optional input modifiers">
    <Accordion
      flush
      activeClass="text-stone-900"
      inactiveClass="text-stone-700 hover:text-stone-900"
    >
      <AccordionItem
        open={false}
        paddingFlush="py-2"
        borderSharedClass="border-stone-200"
      >
        <span slot="header" class="text-sm font-semibold">Optional input modifiers</span>

        <div class="grid gap-3 pb-1 pt-2">
          {#each modifierControls as modifier}
            <div class="rounded-xl border border-stone-200 bg-stone-50 p-3">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h3 class="text-sm font-semibold text-stone-900">{modifier.label}</h3>
                  <p class="mt-0.5 text-xs text-stone-500">{modifier.description}</p>
                </div>
              </div>

              <div
                class="mt-3 grid gap-2"
                style={`grid-template-columns: ${matrixColumns()};`}
              >
                {#each visibleInputIds as inputId}
                  <div class="rounded-lg border border-stone-200 bg-white px-2.5 py-2">
                    <div class="flex items-center justify-between gap-2">
                      <span class={`text-xs font-semibold ${inputDisplayMetaById[inputId].accentClass}`}>
                        {inputDisplayMetaById[inputId].shortLabel}
                      </span>
                      <Toggle
                        checked={modifier.activeByInput[inputId] ?? false}
                        disabled={
                          !(modifier.completeByInput[inputId] ?? false)
                          && !(modifier.activeByInput[inputId] ?? false)
                        }
                        onchange={(event) => toolState.actions.setModifierEnabled(
                          inputId,
                          modifier.id,
                          event.currentTarget.checked,
                        )}
                        aria-label={`${inputDisplayMetaById[inputId].label} ${modifier.label}`}
                        color="teal"
                        size="small"
                      />
                    </div>
                    {#if !(modifier.completeByInput[inputId] ?? false)}
                      <p class="mt-1 text-[0.7rem] text-stone-500">Complete all fields to enable.</p>
                    {/if}
                  </div>
                {/each}
              </div>

              <div class="mt-3 grid gap-2">
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
                          onfocus={() => toolState.actions.setActiveInputId(inputId)}
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
                            }
                          }}
                          class="rounded-lg border-stone-300 bg-white"
                        />
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>

              {#each modifier.affectedFields as affectedField}
                <div
                  class="mt-3 grid gap-2"
                  style={`grid-template-columns: ${matrixColumns()};`}
                >
                  {#each visibleInputIds as inputId}
                    {#if modifier.activeByInput[inputId]}
                      <p class="rounded-lg bg-teal-50 px-2.5 py-2 text-xs text-teal-900">
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
            </div>
          {/each}
        </div>
      </AccordionItem>
    </Accordion>
  </section>
{/if}
