<svelte:options runes={true} />

<script lang="ts">
  import { Badge, Card } from "flowbite-svelte";

  import type { TimeSeriesController } from "../../state/timeSeries/types";
  import PlotlyCanvas from "../chart/PlotlyCanvas.svelte";

  interface Props {
    controller: TimeSeriesController;
  }

  let { controller }: Props = $props();

  const model = $derived(controller.selectors.getCurrentModel());
  const summary = $derived(controller.selectors.getSummary());
  const charts = $derived(controller.selectors.getCharts());
  const status = $derived(controller.selectors.getStatus());
  const errors = $derived(controller.selectors.getErrors());
  const hasStaleResult = $derived(controller.selectors.hasStaleResult());
</script>

<div class="grid gap-4">
  {#if hasStaleResult}
    <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
      {status === "updating"
        ? "Updating the scenario. The charts below show the last successful calculation."
        : errors.length > 0
          ? "The draft is waiting for valid inputs. The charts below show the last successful calculation."
          : "Waiting to update the scenario. The charts below show the last successful calculation."}
    </div>
  {/if}

  <section aria-labelledby="time-series-summary-heading">
    <header class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p class="text-eyebrow">Simulation results</p>
        <h2 id="time-series-summary-heading" class="mt-1 text-xl font-semibold text-stone-950">
          Exposure summary
        </h2>
      </div>
      <Badge color="blue">{model.standardLabel}</Badge>
    </header>

    {#if summary.length > 0}
      <div class="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {#each summary as item (item.id)}
          <Card size="none" class="border-stone-200 p-3 shadow-sm">
            <p class="text-xs font-medium text-stone-500">{item.label}</p>
            <p class="mt-2 text-lg font-semibold text-stone-950">{item.value}</p>
            {#if item.subtext}
              <p class="mt-1 text-xs text-stone-500">{item.subtext}</p>
            {/if}
          </Card>
        {/each}
      </div>
    {:else}
      <p class="mt-3 rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-500">
        {status === "error"
          ? "The calculation could not complete. Check the scenario feedback."
          : errors.length > 0
            ? "Correct the scenario inputs to calculate results."
            : "Calculating the default scenario automatically…"}
      </p>
    {/if}
  </section>

  {#each charts as chartDefinition (chartDefinition.id)}
    <Card size="none" class="border-stone-300 p-3 shadow-sm">
      <header class="px-1 pt-1">
        <h2 class="text-base font-semibold text-stone-900">{chartDefinition.title}</h2>
        <p class="mt-1 text-xs text-stone-500">{chartDefinition.description}</p>
      </header>
      <div
        class="mt-2 min-h-[360px] overflow-hidden rounded-lg bg-white"
        data-testid={chartDefinition.testId}
      >
        <PlotlyCanvas
          chartResult={chartDefinition.chart}
          isLoading={status === "updating"}
          emptyMessage={chartDefinition.emptyMessage}
          heightClass={chartDefinition.heightClass}
        />
      </div>
    </Card>
  {/each}

  {#if model.reference}
    <p class="text-xs leading-5 text-stone-500">
      Visual reference:
      <a
        class="font-medium text-sky-700 underline underline-offset-2"
        href={model.reference.href}
        target="_blank"
        rel="noreferrer"
      >{model.reference.label}</a>.
      {#if model.reference.note}{model.reference.note}{/if}
    </p>
  {/if}
</div>
