<script lang="ts">
  import { Button, Dropdown, DropdownHeader, DropdownItem } from "flowbite-svelte";
  import { ChevronDownOutline } from "flowbite-svelte-icons";
  import { getPhysicalQuantityMeta } from "../../models/quantities";
  import { inputOrder } from "../../models/inputSlots";
  import { inputDisplayMetaById } from "../../models/inputSlotPresentation";
  import type {
    AxisControl,
    ChartControlsViewModel,
  } from "../../state/analysis/types";
  import ChartBandEditor from "./ChartBandEditor.svelte";
  import ChartDisplayMenu from "./ChartDisplayMenu.svelte";

  interface Props {
    idPrefix: string;
    controls: ChartControlsViewModel;
  }

  let { idPrefix, controls }: Props = $props();

  const baselineTriggerId = $derived(`${idPrefix}-baseline-trigger`);
  const xAxisTriggerId = $derived(`${idPrefix}-x-axis-trigger`);
  const yAxisTriggerId = $derived(`${idPrefix}-y-axis-trigger`);
  const currentBaselineLabel = $derived(
    controls.baseline
      ? inputDisplayMetaById[controls.baseline.selectedInputId].label
      : "Input 1",
  );
  const hasLeadingControls = $derived(
    controls.baseline !== null || controls.axes !== null,
  );
  const showOutputControl = $derived(
    (controls.explore?.outputs.length ?? 0) > 1,
  );
</script>

{#snippet axisPicker(label: "X" | "Y", control: AxisControl, triggerId: string)}
  <span class:ml-2={label === "Y"} class="text-xs font-medium text-stone-500">
    {label}:
  </span>
  <Button
    id={triggerId}
    color="light"
    pill
    size="xs"
    aria-label={`Select chart ${label} axis`}
    class="flex items-center text-stone-700 {control.locked
      ? 'pointer-events-none cursor-default'
      : ''}"
    disabled={control.locked}
  >
    <span class="max-w-[100px] truncate">
      {getPhysicalQuantityMeta(control.selectedField).label}
    </span>
    {#if !control.locked}
      <ChevronDownOutline class="ms-1 h-3 w-3 flex-shrink-0" strokeWidth="2" />
    {/if}
  </Button>
  {#if !control.locked}
    <Dropdown triggeredBy={`#${triggerId}`} class="w-48 shadow-lg">
      <DropdownHeader
        slot="header"
        divider={false}
        class="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-stone-500"
      >
        Select {label} Axis
      </DropdownHeader>
      {#each control.options as option}
        <DropdownItem onclick={() => control.onSelect(option)} class="text-left">
          <span
            class={control.selectedField === option
              ? "font-bold text-teal-700"
              : "text-stone-700"}
          >
            {getPhysicalQuantityMeta(option).label}
          </span>
        </DropdownItem>
      {/each}
    </Dropdown>
  {/if}
{/snippet}

<div class="flex flex-wrap items-center gap-2">
  {#if controls.baseline}
    {@const baseline = controls.baseline}
    <span class="text-xs font-medium text-stone-500">Baseline:</span>
    <Button
      id={baselineTriggerId}
      color="light"
      pill
      size="xs"
      aria-label="Select chart baseline input"
      class="flex items-center text-stone-700"
    >
      <span class="max-w-[100px] truncate">{currentBaselineLabel}</span>
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
          onclick={() => baseline.onSelect(inputId)}
          disabled={!baseline.visibleInputIds.includes(inputId)}
          class="text-left {!baseline.visibleInputIds.includes(inputId)
            ? 'cursor-not-allowed bg-stone-50 opacity-40'
            : ''}"
        >
          <div class="flex w-full items-center justify-between gap-4">
            <span
              class={baseline.selectedInputId === inputId
                ? "font-bold text-teal-700"
                : "text-stone-700"}
            >
              {inputDisplayMetaById[inputId].label}
            </span>
            {#if !baseline.visibleInputIds.includes(inputId)}
              <span class="text-xs font-medium uppercase text-stone-400">Inactive</span>
            {/if}
          </div>
        </DropdownItem>
      {/each}
    </Dropdown>
    {#if controls.axes}
      <div class="mx-1 h-4 w-px bg-stone-300"></div>
    {/if}
  {/if}

  {#if controls.axes}
    {@render axisPicker("X", controls.axes.x, xAxisTriggerId)}
    {@render axisPicker("Y", controls.axes.y, yAxisTriggerId)}
  {/if}

  {#if controls.explore}
    {#if hasLeadingControls}
      <div class="mx-1 h-4 w-px bg-stone-300"></div>
    {/if}
    {#if showOutputControl}
      <ChartDisplayMenu
        {idPrefix}
        outputs={controls.explore.outputs}
        selectedOutput={controls.explore.profile.zOutput}
        onSelect={controls.explore.onSelectOutput}
      />
    {/if}
    <ChartBandEditor
      {idPrefix}
      outputKey={controls.explore.profile.zOutput}
      bands={controls.explore.profile.bands as readonly import("../../models/modelCapabilities").NumericBand[]}
      defaultBands={controls.explore.defaultBands}
      unitSystem={controls.explore.unitSystem}
      onApply={controls.explore.onApplyBands}
    />
  {/if}
</div>
