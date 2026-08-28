<svelte:options runes={true} />

<script lang="ts">
  import { Badge } from "flowbite-svelte";

  import MetricSummaryPanel from "../output/MetricSummaryPanel.svelte";
  import type { TimeSeriesResultsViewModel } from "../../../state/timeSeries/types";
  import TimeSeriesChartCard from "./TimeSeriesChartCard.svelte";

  interface Props {
    panel: TimeSeriesResultsViewModel;
  }

  let { panel }: Props = $props();
</script>

<div class="grid gap-4">
  {#if panel.hasStaleResult}
    <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
      {panel.status === "updating"
        ? "Updating the scenario. The charts below show the last successful calculation."
        : panel.errors.length > 0
          ? "The draft is waiting for valid inputs. The charts below show the last successful calculation."
          : "Waiting to update the scenario. The charts below show the last successful calculation."}
    </div>
  {/if}

  <section aria-labelledby="time-series-summary-heading">
    <header class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p class="text-eyebrow">Simulation results</p>
        <h2 id="time-series-summary-heading" class="mt-1 text-lg font-semibold text-stone-950">
          Exposure summary
        </h2>
      </div>
      <Badge color="blue">{panel.model.standardLabel}</Badge>
    </header>

    <div class="mt-3">
      <MetricSummaryPanel
        items={panel.summary}
        emptyMessage={panel.status === "error"
          ? "The calculation could not complete. Check the scenario feedback."
          : panel.errors.length > 0
            ? "Correct the scenario inputs to calculate results."
            : "Calculating the default scenario automatically…"}
      />
    </div>
  </section>

  {#each panel.charts as chartDefinition (chartDefinition.id)}
    <TimeSeriesChartCard
      chartDefinition={chartDefinition}
      isLoading={panel.status === "updating"}
    />
  {/each}

  {#if panel.model.reference}
    <p class="text-xs leading-5 text-stone-500">
      Visual reference:
      <a
        class="font-medium text-sky-700 underline underline-offset-2"
        href={panel.model.reference.href}
        target="_blank"
        rel="noreferrer"
      >{panel.model.reference.label}</a>.
      {#if panel.model.reference.note}{panel.model.reference.note}{/if}
    </p>
  {/if}
</div>
