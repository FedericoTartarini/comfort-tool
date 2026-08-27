<svelte:options runes={true} />

<script lang="ts">
  import { Card } from "flowbite-svelte";

  import type {
    MetricSummaryGroupViewModel,
    MetricSummaryItemViewModel,
  } from "../../../catalog/tableTypes";
  import {
    layoutMetricSummaryGroups,
    layoutMetricSummaryItems,
    type MetricSummaryLayoutViewModel,
  } from "../../../engines/comfort/output/metricSummaryLayout";

  interface Props {
    items?: readonly MetricSummaryItemViewModel[];
    groups?: readonly MetricSummaryGroupViewModel[];
    emptyMessage?: string;
  }

  let {
    items = [],
    groups = [],
    emptyMessage = "No summary metrics yet.",
  }: Props = $props();

  const layout = $derived.by<MetricSummaryLayoutViewModel>(() => (
    groups.length > 0
      ? layoutMetricSummaryGroups(groups)
      : layoutMetricSummaryItems(items)
  ));

  const tiles = $derived([
    ...layout.overview,
    ...layout.groups.flatMap(({ items: groupItems }) => groupItems),
  ]);
</script>

{#if tiles.length > 0}
  <div class="grid grid-cols-5 gap-2">
    {#each tiles as item (item.id)}
      <Card size="none" class="min-w-0 w-full border-stone-200 p-2! shadow-sm">
        <p class="text-[11px] font-medium leading-tight text-stone-500">
          {item.label}
        </p>
        <p class="mt-0.5 text-sm font-semibold leading-tight text-stone-950">
          {item.value}
          {#if item.subtext}
            <span class="ml-1 text-[11px] font-medium text-stone-500">{item.subtext}</span>
          {/if}
        </p>
      </Card>
    {/each}
  </div>
{:else}
  <p class="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-500">
    {emptyMessage}
  </p>
{/if}
