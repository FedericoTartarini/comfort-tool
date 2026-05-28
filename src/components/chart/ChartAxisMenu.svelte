<script lang="ts">
  /**
   * @component
   * Renders the axis selection interface for dynamic charts, including
   * button triggers and dropdown menus for both dimensions.
   */
  import { Button, Dropdown, DropdownHeader, DropdownItem } from "flowbite-svelte";
  import { ChevronDownOutline } from "flowbite-svelte-icons";
  import type { FieldKey as FieldKeyType } from "../../models/fieldKeys";
  import { fieldMetaByKey } from "../../models/inputFieldsMeta";
  import { inputOrder, type InputId as InputIdType } from "../../models/inputSlots";
  import { inputDisplayMetaById } from "../../models/inputSlotPresentation";

  interface Props {
    idPrefix: string;
    dynamicXAxis?: FieldKeyType;
    dynamicYAxis?: FieldKeyType;
    axisOptions?: FieldKeyType[];
    baselineInputId?: InputIdType;
    onSelectBaselineInput?: (inputId: InputIdType) => void;
    visibleInputIds?: InputIdType[];
    compareEnabled?: boolean;
    onSelectXAxis?: (fieldKey: FieldKeyType) => void;
    onSelectYAxis?: (fieldKey: FieldKeyType) => void;
    lockYAxis?: boolean;
  }

  let {
    idPrefix,
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
  }: Props = $props();

  const baselineTriggerId = $derived(`${idPrefix}-baseline-trigger`);
  const xAxisTriggerId = $derived(`${idPrefix}-x-axis-trigger`);
  const yAxisTriggerId = $derived(`${idPrefix}-y-axis-trigger`);

  const currentXLabel = $derived(
    dynamicXAxis ? fieldMetaByKey[dynamicXAxis].label : "X-Axis",
  );
  const currentYLabel = $derived(
    dynamicYAxis ? fieldMetaByKey[dynamicYAxis].label : "Y-Axis",
  );
  const currentBaselineLabel = $derived(
    baselineInputId ? inputDisplayMetaById[baselineInputId].label : "Input 1",
  );
</script>

<div class="flex items-center gap-2">
  {#if compareEnabled && baselineInputId && onSelectBaselineInput}
    <span class="text-xs font-medium text-stone-500">Baseline:</span>
    <Button
      id={baselineTriggerId}
      color="light"
      pill
      size="xs"
      class="text-stone-700 flex items-center"
    >
      <span class="max-w-[100px] truncate">
        {currentBaselineLabel}
      </span>
      <ChevronDownOutline class="ms-1 h-3 w-3 flex-shrink-0" strokeWidth="2" />
    </Button>
    <Dropdown triggeredBy={`#${baselineTriggerId}`} class="w-48 shadow-lg">
      <DropdownHeader
        slot="header"
        divider={false}
        class="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-stone-500"
      >
        Select Baseline Input
      </DropdownHeader>
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
              <span class="text-xs uppercase text-stone-400 font-medium"
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
      id={xAxisTriggerId}
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
    <Dropdown triggeredBy={`#${xAxisTriggerId}`} class="w-48 shadow-lg">
      <DropdownHeader
        slot="header"
        divider={false}
        class="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-stone-500"
      >
        Select X Axis
      </DropdownHeader>
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
      id={yAxisTriggerId}
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
      <Dropdown triggeredBy={`#${yAxisTriggerId}`} class="w-48 shadow-lg">
        <DropdownHeader
          slot="header"
          divider={false}
          class="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-stone-500"
        >
          Select Y Axis
        </DropdownHeader>
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
