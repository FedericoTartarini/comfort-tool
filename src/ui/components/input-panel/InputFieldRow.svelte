<script lang="ts">
  import {
    Button,
    Dropdown,
    DropdownDivider,
    DropdownHeader,
    DropdownItem,
    Input,
    Label,
  } from "flowbite-svelte";
  import { ChevronDownOutline } from "flowbite-svelte-icons";
  import PresetNumericInput from "../PresetNumericInput.svelte";
  import { inputDisplayMetaById } from "../../../catalog/inputSlotPresentation";
  import type { InputId as InputIdType } from "../../../catalog/inputSlots";
  import type { OptionKey as OptionKeyType } from "../../../catalog/inputModes";
  import type { InputFieldRowViewModel } from "../../../state/analysis/types";

  interface Props {
    field: InputFieldRowViewModel;
    onOpenClothingBuilder?: () => void;
  }

  let {
    field,
    onOpenClothingBuilder,
  }: Props = $props();

  let control = $derived(field.control);
  let menu = $derived(control.menu);

  function getAdvancedMenuTriggerId() {
    return `advanced-input-${control.id}`;
  }

  function getMatrixTemplateColumns() {
    return `repeat(${field.visibleInputIds.length}, minmax(0, 1fr))`;
  }

  const dropdownClass = "w-72 overflow-hidden rounded-xl py-1 shadow-lg";
  const dropdownHeaderClass = "border-b border-stone-100 px-4 py-2 text-xs uppercase tracking-[0.16em] text-stone-500";
  const dropdownSectionTitleClass = "px-4 pt-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-400";
  const dropdownItemClass = "flex flex-col items-start gap-0.5 px-4 py-2 text-left";
  const subtleButtonClass = "tool-button-subtle focus:ring-0";

  function commitFieldValue(inputId: InputIdType, inputElement: HTMLInputElement) {
    const nextValue = field.onCommitValue(inputId, inputElement.value);
    inputElement.value = nextValue ?? control.displayValuesByInput[inputId] ?? "";
  }

  let dropdownOpen = $state(false);

  function handleSelectItem(optionKey: OptionKeyType, value: string) {
    field.onSelectOption(optionKey, value);
    dropdownOpen = false;
  }
</script>

<div class="py-0.5">
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
          <ChevronDownOutline class="h-3 w-3" strokeWidth="2" />
        </Button>

        <Dropdown
          bind:open={dropdownOpen}
          triggeredBy={`#${getAdvancedMenuTriggerId()}`}
          class={dropdownClass}
        >
          <DropdownHeader
            divider={false}
            class={dropdownHeaderClass}
          >
            {menu.title}
          </DropdownHeader>
          {#each menu.sections as section}
            {#if section.title}
              <DropdownDivider />
              <DropdownHeader
                divider={false}
                class={dropdownSectionTitleClass}
              >
                {section.title}
              </DropdownHeader>
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
          color="none"
          pill
          class={subtleButtonClass}
          onclick={() => onOpenClothingBuilder?.()}
        >
          Custom clothing
        </Button>
      {/if}
    </div>

    {#if control.rangeText}
      <small class="shrink-0 text-xs text-stone-500">
        {control.rangeText.replace("From ", "").replace(" to ", " ~ ")}
      </small>
    {/if}
  </header>

  <ul
    class="mt-1 grid gap-2"
    style={`grid-template-columns: ${getMatrixTemplateColumns()};`}
  >
    {#each field.visibleInputIds as inputId}
      <li
        class={field.activeInputId === inputId
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
            onActivate={() => field.onActivateInput(inputId)}
            onCommit={(value) => field.onCommitPreset(inputId, value)}
            disabled={control.disabled}
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
            disabled={control.disabled}
            onfocus={() => field.onActivateInput(inputId)}
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
</div>
