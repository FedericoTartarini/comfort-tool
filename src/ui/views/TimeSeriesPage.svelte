<svelte:options runes={true} />

<script lang="ts">
  import { onMount } from "svelte";

  import TimeSeriesInputPanel from "../components/time-series/TimeSeriesInputPanel.svelte";
  import TimeSeriesResults from "../components/time-series/TimeSeriesResults.svelte";
  import WorkspaceTwoColumnLayout from "../components/layout/WorkspaceTwoColumnLayout.svelte";
  import { getWorkspaceContext } from "../../state/workspace/context";

  const { timeSeriesState } = getWorkspaceContext();

  onMount(timeSeriesState.actions.start);
</script>

<WorkspaceTwoColumnLayout
  gridColsClass="xl:grid-cols-[26rem_minmax(0,1fr)]"
>
  {#snippet aside()}
    <TimeSeriesInputPanel controller={timeSeriesState} />
  {/snippet}
  {#snippet main()}
    <TimeSeriesResults controller={timeSeriesState} />
  {/snippet}
</WorkspaceTwoColumnLayout>
