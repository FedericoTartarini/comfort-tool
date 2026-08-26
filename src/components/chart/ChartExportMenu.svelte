<script lang="ts">
  import { Button, Dropdown, DropdownDivider, DropdownHeader, DropdownItem } from "flowbite-svelte";
  import { ChevronDownOutline } from "flowbite-svelte-icons";
  import type { ChartInstancePanelView } from "../../state/analysis/chartInstancePresentation";
  import {
    publicationExportMenuItems,
    type PublicationExportHandler,
  } from "../../services/plotlyExport";

  interface Props {
    chartInstances: readonly ChartInstancePanelView[];
    currentChart: ChartInstancePanelView;
    selectedChartInstanceId: string;
    onSelectChartInstance: (instanceId: string) => void;
    onExport: PublicationExportHandler;
  }

  let {
    chartInstances,
    currentChart,
    selectedChartInstanceId,
    onSelectChartInstance,
    onExport,
  }: Props = $props();
</script>

<Button
  id={`chart-select-trigger-${currentChart.instanceId}`}
  color="light"
  pill
  size="xs"
  aria-label="Select chart type and export"
  class="flex items-center"
>
  <span class="max-w-[120px] truncate">
    {currentChart.name}
  </span>
  <ChevronDownOutline class="ms-1 h-3 w-3 flex-shrink-0" strokeWidth="2" />
</Button>

<Dropdown triggeredBy={`#chart-select-trigger-${currentChart.instanceId}`} class="w-56 shadow-lg">
  {#each chartInstances as option}
    <DropdownItem
      onclick={() => onSelectChartInstance(option.instanceId)}
      class="text-left"
    >
      <span class={selectedChartInstanceId === option.instanceId ? "font-bold text-teal-700" : "text-stone-700"}>
        {option.name}
      </span>
    </DropdownItem>
  {/each}
  <DropdownDivider />
  <DropdownHeader
    slot="header"
    divider={false}
    class="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-stone-500"
  >
    Export
  </DropdownHeader>
  {#each publicationExportMenuItems as item}
    <DropdownItem
      onclick={() => onExport(item.format, item.column)}
      class="text-left"
    >
      {item.label}
    </DropdownItem>
  {/each}
</Dropdown>
