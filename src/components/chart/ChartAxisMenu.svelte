<script lang="ts">
  /**
   * @component
   * Renders the axis selection interface for dynamic charts, including
   * button triggers and dropdown menus for both dimensions.
   */
  import { Button, Dropdown, DropdownItem } from "flowbite-svelte";
  import { ChevronDownOutline } from "flowbite-svelte-icons";
  import { FieldKey } from "../../models/fieldKeys";
  import { fieldMetaByKey } from "../../models/inputFieldsMeta";
  import { inputOrder, type InputId } from "../../models/inputSlots";
  import { inputDisplayMetaById } from "../../models/inputSlotPresentation";

  let {
    dynamicXAxis,
    dynamicYAxis,
    axisOptions = [],
    baselineInputId,
    onSelectBaselineInput,
    visibleInputIds = [],
    compareEnabled = false,
    onSelectXAxis,
    onSelectYAxis,
    lockYAxis = false,
  }: {
    dynamicXAxis?: string;
    dynamicYAxis?: string;
    axisOptions?: string[];
    baselineInputId?: string;
    onSelectBaselineInput?: (inputId: string) => void;
    visibleInputIds?: string[];
    compareEnabled?: boolean;
    onSelectXAxis?: (fieldKey: string) => void;
    onSelectYAxis?: (fieldKey: string) => void;
    lockYAxis?: boolean;
  } = $props();

  const currentXLabel = $derived(
    fieldMetaByKey[dynamicXAxis as FieldKey]?.label ?? "X-Axis",
  );
  const currentYLabel = $derived(
    fieldMetaByKey[dynamicYAxis as FieldKey]?.label ?? "Y-Axis",
  );
</script>

<div class="flex items-center gap-2">
  {#if compareEnabled && baselineInputId && onSelectBaselineInput}
    <span class="text-xs font-medium text-stone-500">Baseline:</span>
    <Button
      id="chart-baseline-trigger"
      color="light"
      pill
      size="xs"
      class="text-stone-700 flex items-center"
    >
      <span class="max-w-[100px] truncate">
        {inputDisplayMetaById[baselineInputId as InputId]?.label ?? "Input 1"}
      </span>
      <ChevronDownOutline class="ms-1 h-3 w-3 flex-shrink-0" strokeWidth="2" />
    </Button>
    <Dropdown triggeredBy="#chart-baseline-trigger" class="w-48 shadow-lg">
      <div
        slot="header"
        class="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-stone-500"
      >
        Select Baseline Input
      </div>
      {#each inputOrder as inputId}
        <DropdownItem
          onclick={() => onSelectBaselineInput(inputId)}
          disabled={!visibleInputIds.includes(inputId)}
          class="text-left {!visibleInputIds.includes(inputId)
            ? 'cursor-not-allowed opacity-40 bg-stone-50'
            : ''}"
        >
          <div class="flex items-center justify-between gap-4 w-full">
            <span
              class={baselineInputId === inputId
                ? "font-bold text-teal-700"
                : "text-stone-700"}
            >
              {inputDisplayMetaById[inputId].label}
            </span>
            {#if !visibleInputIds.includes(inputId)}
              <span class="text-[10px] uppercase text-stone-400 font-medium"
                >Inactive</span
              >
            {/if}
          </div>
        </DropdownItem>
      {/each}
    </Dropdown>
    {#if dynamicXAxis && dynamicYAxis && onSelectXAxis && onSelectYAxis}
      <div class="h-4 w-px bg-stone-300 mx-1"></div>
    {/if}
  {/if}

  {#if dynamicXAxis && dynamicYAxis && onSelectXAxis && onSelectYAxis}
    <span class="text-xs font-medium text-stone-500">X:</span>
    <Button
      id="chart-x-axis-trigger"
      color="light"
      pill
      size="xs"
      class="text-stone-700 flex items-center"
    >
      <span class="max-w-[100px] truncate">
        {currentXLabel}
      </span>
      <ChevronDownOutline class="ms-1 h-3 w-3 flex-shrink-0" strokeWidth="2" />
    </Button>
    <Dropdown triggeredBy="#chart-x-axis-trigger" class="w-48 shadow-lg">
      <div
        slot="header"
        class="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-stone-500"
      >
        Select X Axis
      </div>
      {#each axisOptions as option}
        <DropdownItem onclick={() => onSelectXAxis(option)} class="text-left">
          <span
            class={dynamicXAxis === option
              ? "font-bold text-teal-700"
              : "text-stone-700"}
          >
            {fieldMetaByKey[option].label}
          </span>
        </DropdownItem>
      {/each}
    </Dropdown>

    <span class="ml-2 text-xs font-medium text-stone-500">Y:</span>
    <Button
      id="chart-y-axis-trigger"
      color="light"
      pill
      size="xs"
      class="text-stone-700 flex items-center {lockYAxis
        ? 'cursor-default pointer-events-none'
        : ''}"
      disabled={lockYAxis}
    >
      <span class="max-w-[100px] truncate">
        {currentYLabel}
      </span>
      {#if !lockYAxis}
        <ChevronDownOutline
          class="ms-1 h-3 w-3 flex-shrink-0"
          strokeWidth="2"
        />
      {/if}
    </Button>
    {#if !lockYAxis}
      <Dropdown triggeredBy="#chart-y-axis-trigger" class="w-48 shadow-lg">
        <div
          slot="header"
          class="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-stone-500"
        >
          Select Y Axis
        </div>
        {#each axisOptions as option}
          <DropdownItem onclick={() => onSelectYAxis(option)} class="text-left">
            <span
              class={dynamicYAxis === option
                ? "font-bold text-teal-700"
                : "text-stone-700"}
            >
              {fieldMetaByKey[option].label}
            </span>
          </DropdownItem>
        {/each}
      </Dropdown>
    {/if}
  {/if}
</div>
