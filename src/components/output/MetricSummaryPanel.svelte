<svelte:options runes={true} />

<script lang="ts">
  import { Card } from "flowbite-svelte";

  import type {
    MetricSummaryGroupViewModel,
    MetricSummaryItemViewModel,
  } from "../../models/output/tableLayouts";
  import {
    layoutMetricSummaryGroups,
    layoutMetricSummaryItems,
    type MetricSummaryLayoutViewModel,
  } from "../../services/comfort/output/metricSummaryLayout";

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

  const hasMetrics = $derived(
    layout.overview.length > 0 || layout.groups.some(({ items: groupItems }) => groupItems.length > 0),
  );
</script>

{#snippet metricTile(item: MetricSummaryItemViewModel, compact = false)}
  <Card size="none" class={`border-stone-200 shadow-sm ${compact ? "p-2.5" : "p-3"}`}>
    <p class={`font-medium text-stone-500 ${compact ? "text-[11px] leading-4" : "text-xs"}`}>
      {item.label}
    </p>
    <p class={`mt-1.5 font-semibold text-stone-950 ${compact ? "text-base" : "text-lg"}`}>
      {item.value}
    </p>
    {#if item.subtext}
      <p class={`mt-1 text-stone-500 ${compact ? "text-[11px] leading-4" : "text-xs"}`}>
        {item.subtext}
      </p>
    {/if}
  </Card>
{/snippet}

{#if hasMetrics}
  {#if layout.overview.length > 0}
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {#each layout.overview as item (item.id)}
        {@render metricTile(item, false)}
      {/each}
    </div>
  {/if}

  {#if layout.groups.length > 0}
    <div class={`grid gap-4 ${layout.overview.length > 0 ? "mt-4" : ""}`}>
      {#each layout.groups as group (group.id)}
        <div class="flex flex-col gap-2">
          {#if group.title}
            <h3 class="text-xs font-semibold uppercase tracking-wide text-stone-400">
              {group.title}
            </h3>
          {/if}
          <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {#each group.items as item (item.id)}
              {@render metricTile(item, true)}
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
{:else}
  <p class="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-500">
    {emptyMessage}
  </p>
{/if}
