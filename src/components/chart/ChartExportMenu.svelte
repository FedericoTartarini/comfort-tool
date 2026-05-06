<script lang="ts">
  /**
   * @component
   * UI for selecting the active chart type and triggering image exports (PNG/SVG).
   * Displays the current chart name in a dropdown and provides action buttons for saving the visualization.
   */
  import { Button, Dropdown, DropdownItem } from "flowbite-svelte";
  import { ChevronDownOutline } from "flowbite-svelte-icons";
  import { chartMetaById } from "../../models/chartOptions";
  import type { ChartId } from "../../models/chartOptions";

  let {
    chartOptions,
    selectedChart,
    activeChartId,
    onSelectChart,
    onExport,
  }: {
    chartOptions: Array<{ name: string; value: ChartId }>;
    selectedChart: ChartId;
    activeChartId: ChartId;
    onSelectChart: (chartId: ChartId) => void;
    onExport: (type: "png" | "svg") => void;
  } = $props();

  const currentChartLabel = $derived(chartMetaById[activeChartId].name);
</script>

<Button
  id={`chart-select-trigger-${activeChartId}`}
  color="light"
  pill
  size="xs"
  class="flex items-center"
>
  <span class="max-w-[120px] truncate">
    {currentChartLabel}
  </span>
  <ChevronDownOutline class="ms-1 h-3 w-3 flex-shrink-0" strokeWidth="2" />
</Button>

<Dropdown triggeredBy={`#chart-select-trigger-${activeChartId}`} class="w-48 shadow-lg">
  {#each chartOptions as option}
    <DropdownItem
      onclick={() => onSelectChart(option.value)}
      class="text-left"
    >
      <span class={selectedChart === option.value ? "font-bold text-teal-700" : "text-stone-700"}>
        {option.name}
      </span>
    </DropdownItem>
  {/each}

  <div class="mt-1 border-t border-stone-100 px-4 py-2 text-xs font-semibold text-stone-500 uppercase tracking-wider">
    Export options
  </div>
  <DropdownItem class="text-left text-sm text-stone-700" onclick={() => onExport("png")}>
    Export as image (PNG)
  </DropdownItem>
  <DropdownItem class="text-left text-sm text-stone-700" onclick={() => onExport("svg")}>
    Export as vector (SVG)
  </DropdownItem>
</Dropdown>
