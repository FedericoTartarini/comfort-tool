<script lang="ts">
  import { Button, Dropdown, DropdownDivider, DropdownHeader, DropdownItem } from "flowbite-svelte";
  import { ChevronDownOutline } from "flowbite-svelte-icons";
  import type {
    ChartId,
    ModelChartDefinition,
  } from "../../models/chartOptions";

  interface Props {
    chartOptions: readonly ModelChartDefinition[];
    currentChart: ModelChartDefinition;
    selectedChart: ChartId;
    onSelectChart: (chartId: ChartId) => void;
    onExport: (type: "png" | "svg") => void;
  }

  let {
    chartOptions,
    currentChart,
    selectedChart,
    onSelectChart,
    onExport,
  }: Props = $props();
</script>

<Button
  id={`chart-select-trigger-${currentChart.id}`}
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

<Dropdown triggeredBy={`#chart-select-trigger-${currentChart.id}`} class="w-48 shadow-lg">
  {#each chartOptions as option}
    <DropdownItem
      onclick={() => onSelectChart(option.id)}
      class="text-left"
    >
      <span class={selectedChart === option.id ? "font-bold text-teal-700" : "text-stone-700"}>
        {option.name}
      </span>
    </DropdownItem>
  {/each}

  <DropdownDivider />
  <DropdownHeader divider={false} class="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
    Export options
  </DropdownHeader>
  <DropdownItem class="text-left text-sm text-stone-700" onclick={() => onExport("png")}>
    Export as image (PNG)
  </DropdownItem>
  <DropdownItem class="text-left text-sm text-stone-700" onclick={() => onExport("svg")}>
    Export as vector (SVG)
  </DropdownItem>
</Dropdown>
