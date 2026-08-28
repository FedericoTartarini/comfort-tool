<script lang="ts">
  import type { ChartPayload } from "../../../charts/types";
  import type { PublicationExportHandler } from "../../../charts/plotlyExport";
  import PlotlyCanvas from "./PlotlyCanvas.svelte";

  interface Props {
    title?: string;
    description?: string;
    chartResult: ChartPayload | null;
    isLoading: boolean;
    emptyMessage?: string;
    heightClass?: string;
    testId?: string;
    onRegisterExport?: (handler: PublicationExportHandler | undefined) => void;
  }

  let {
    title,
    description,
    chartResult,
    isLoading,
    emptyMessage = "No chart yet.",
    heightClass = "h-[480px] xl:h-[480px]",
    testId,
    onRegisterExport,
  }: Props = $props();
</script>

<div class="min-w-0" data-testid={testId}>
  {#if title || description}
    <header class="px-1 pt-1">
      {#if title}
        <h2 class="text-base font-semibold text-stone-900">{title}</h2>
      {/if}
      {#if description}
        <p class="mt-1 text-xs text-stone-500">{description}</p>
      {/if}
    </header>
  {/if}

  <div
    class={`${title || description ? "mt-2" : ""} min-h-[360px] overflow-hidden rounded-lg bg-white`}
  >
    <div class={`${heightClass} relative overflow-hidden rounded-lg bg-stone-50/50`}>
      <PlotlyCanvas
        {chartResult}
        {isLoading}
        emptyMessage={emptyMessage}
        {heightClass}
        onRegisterExport={onRegisterExport}
      />
    </div>
  </div>
</div>
