<script lang="ts">
  import {
    Button,
    Dropdown,
    DropdownItem,
    Heading,
    Input,
    Label,
  } from "flowbite-svelte";
  import PresetNumericInput from "../PresetNumericInput.svelte";
  import { inputDisplayMetaById } from "../../models/inputSlotPresentation";
  import type { InputId as InputIdType } from "../../models/inputSlots";
  import type { InputControlViewModel } from "../../models/inputControls";
  import type { OptionKey } from "../../models/inputModes";
  import type { ComfortToolController } from "../../state/comfortTool/types";

  let {
    toolState,
    control,
    onOpenClothingBuilder,
    onOpenQuickClothingEstimate,
  }: {
    toolState: ComfortToolController;
    control: InputControlViewModel;
    onOpenClothingBuilder: () => void;
    onOpenQuickClothingEstimate: () => void;
  } = $props();

  let menu = $derived(control.menu);

  function getVisibleInputIds() {
    return toolState.selectors.getVisibleInputIds();
  }

  function getAdvancedMenuTriggerId() {
    return `advanced-input-${control.id}`;
  }

  function getMatrixTemplateColumns() {
    return `repeat(${getVisibleInputIds().length}, minmax(0, 1fr))`;
  }

  const dropdownClass = "w-72 overflow-hidden rounded-xl py-1 shadow-lg";
  const clothingToolsDropdownClass = "w-64 overflow-hidden rounded-xl py-1 shadow-lg";
  const dropdownHeaderClass = "border-b border-stone-100 px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-stone-500";
  const dropdownSectionTitleClass = "px-4 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400";
  const dropdownItemClass = "flex flex-col items-start gap-0.5 px-4 py-2 text-left";
  const subtleButtonClass = "tool-button-subtle focus:ring-0";

  function clampToRange(value: number) {
    if (control.minValue !== undefined && value < control.minValue) {
      return control.minValue;
    }

    if (control.maxValue !== undefined && value > control.maxValue) {
      return control.maxValue;
    }

    return value;
  }

  function commitFieldValue(
    inputId: InputIdType,
    inputElement: HTMLInputElement,
  ) {
    const rawValue = inputElement.value.trim();
    toolState.actions.setActiveInputId(inputId);

    if (!rawValue || !Number.isFinite(Number(rawValue))) {
      inputElement.value = control.displayValuesByInput[inputId] ?? "";
      return;
    }

    const nextValue = clampToRange(Number(rawValue));
    const normalizedValue = String(nextValue);
    inputElement.value = normalizedValue;
    toolState.actions.updateInput(inputId, control.id, normalizedValue);
  }

  function handleApplyPresetValue(inputId: InputIdType, value: number) {
    toolState.actions.setActiveInputId(inputId);
    toolState.actions.updateInput(
      inputId,
      control.id,
      clampToRange(value).toFixed(control.presetDecimals),
    );
  }
  let dropdownOpen = $state(false);
  let clothingToolsDropdownOpen = $state(false);

  // Updates a model option and automatically closes the "More" dropdown selection.
  function handleSelectItem(optionKey: OptionKey, value: string) {
    toolState.actions.setModelOption(optionKey, value);
    dropdownOpen = false;
  }
</script>

<section class="py-0.5">
  <header class="flex items-start justify-between gap-3">
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <Label class="text-sm font-medium text-sky-700">
        {control.label} ({control.displayUnits})
      </Label>

      {#if menu}
        <Button
          id={getAdvancedMenuTriggerId()}
          color="none"
          pill
          class={subtleButtonClass}
        >
          More
          <span class="text-[10px]">▼</span>
        </Button>

        <Dropdown
          bind:open={dropdownOpen}
          triggeredBy={`#${getAdvancedMenuTriggerId()}`}
          class={dropdownClass}
        >
          <Heading
            slot="header"
            tag="h6"
            class={dropdownHeaderClass}
          >
            {menu.title}
          </Heading>
          {#each menu.sections as section}
            {#if section.title}
              <Heading
                tag="h6"
                class={dropdownSectionTitleClass}
              >
                {section.title}
              </Heading>
            {/if}

            {#each section.items as item}
              <DropdownItem
                class={dropdownItemClass}
                onclick={() => handleSelectItem(item.optionKey, item.value)}
              >
                <span class={item.active ? "font-semibold text-stone-900" : ""}>
                  {item.label}
                </span>
                <span class="text-xs text-stone-500">{item.description}</span>
              </DropdownItem>
            {/each}
          {/each}
        </Dropdown>
      {/if}

      {#if control.showClothingBuilder}
        <Button
          id={`clothing-builder-trigger-${control.id}`}
          color="none"
          pill
          class={subtleButtonClass}
        >
          Clothing tools
          <span class="text-[10px]">▼</span>
        </Button>

        <Dropdown
          bind:open={clothingToolsDropdownOpen}
          triggeredBy={`#clothing-builder-trigger-${control.id}`}
          class={clothingToolsDropdownClass}
        >
          <DropdownItem
            class={dropdownItemClass}
            onclick={() => {
              clothingToolsDropdownOpen = false;
              onOpenClothingBuilder();
            }}
          >
            <span class="font-semibold text-stone-900">Custom clothing</span>
            <span class="text-xs text-stone-500">Build a clothing total by body region.</span>
          </DropdownItem>
          <DropdownItem
            class={dropdownItemClass}
            onclick={() => {
              clothingToolsDropdownOpen = false;
              onOpenQuickClothingEstimate();
            }}
          >
            <span class="font-semibold text-stone-900">Quick estimate</span>
            <span class="text-xs text-stone-500">Estimate clo from morning outdoor temperature.</span>
          </DropdownItem>
        </Dropdown>
      {/if}
    </div>

    {#if control.rangeText}
      <small class="shrink-0 text-[11px] text-stone-500">
        {control.rangeText.replace("From ", "").replace(" to ", " ~ ")}
      </small>
    {/if}
  </header>

  <ul
    class="mt-1 grid gap-2"
    style={`grid-template-columns: ${getMatrixTemplateColumns()};`}
  >
    {#each getVisibleInputIds() as inputId}
      <li
        class={toolState.state.ui.activeInputId === inputId
          ? "rounded-lg bg-sky-50/50 py-1"
          : "py-1"}
      >
        {#if control.editorKind === "preset"}
          <PresetNumericInput
            items={control.presetOptions}
            value={control.numericValuesByInput[inputId] ?? 0}
            decimals={control.presetDecimals}
            valueSuffix={control.displayUnits}
            placeholder={`Enter ${control.displayUnits} or search preset`}
            searchPlaceholder={`Search ${control.label.toLowerCase()} presets`}
            ariaLabel={`${inputDisplayMetaById[inputId].label} ${control.label}`}
            onActivate={() => toolState.actions.setActiveInputId(inputId)}
            onCommit={(value) => handleApplyPresetValue(inputId, value)}
          />
        {:else}
          <Input
            id={`${inputId}-${control.id}`}
            type="number"
            min={control.minValue}
            max={control.maxValue}
            step={control.step}
            size="sm"
            value={control.displayValuesByInput[inputId] ?? ""}
            aria-label={`${inputDisplayMetaById[inputId].label} ${control.label}`}
            onfocus={() => toolState.actions.setActiveInputId(inputId)}
            onchange={(event) => commitFieldValue(inputId, event.currentTarget)}
            onblur={(event) => {
              if (!event.currentTarget.value.trim()) {
                event.currentTarget.value =
                  control.displayValuesByInput[inputId] ?? "";
              }
            }}
            onkeydown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
                return;
              }

              if (event.key === "Escape") {
                event.preventDefault();
                event.currentTarget.value =
                  control.displayValuesByInput[inputId] ?? "";
                event.currentTarget.blur();
              }
            }}
            class="w-full rounded-lg border-stone-300 bg-white"
          />
        {/if}
      </li>
    {/each}
  </ul>
</section>
