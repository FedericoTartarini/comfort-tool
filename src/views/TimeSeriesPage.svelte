<svelte:options runes={true} />

<script lang="ts">
  import { onMount } from "svelte";

  import TimeSeriesInputPanel from "../components/time-series/TimeSeriesInputPanel.svelte";
  import TimeSeriesResults from "../components/time-series/TimeSeriesResults.svelte";
  import { getWorkspaceContext } from "../state/workspace/context";

  const { timeSeriesState } = getWorkspaceContext();

  onMount(timeSeriesState.actions.start);
</script>

<main class="bg-stone-50 px-4 py-4 sm:px-6 lg:px-8">
  <div class="mx-auto grid w-full max-w-screen-2xl items-start gap-4 xl:grid-cols-[32rem_minmax(0,1fr)]">
    <aside class="min-w-0">
      <TimeSeriesInputPanel controller={timeSeriesState} />
    </aside>
    <section class="min-w-0">
      <TimeSeriesResults controller={timeSeriesState} />
    </section>
  </div>
</main>
