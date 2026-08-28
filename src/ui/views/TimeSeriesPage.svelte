<svelte:options runes={true} />

<script lang="ts">
  import TimeSeriesInputPanel from "../components/time-series/TimeSeriesInputPanel.svelte";
  import TimeSeriesResults from "../components/time-series/TimeSeriesResults.svelte";
  import WorkspaceTwoColumnLayout from "../components/layout/WorkspaceTwoColumnLayout.svelte";
  import NotFoundRoute from "../routes/NotFoundRoute.svelte";
  import { route } from "../routes/router";
  import { getWorkspaceContext } from "../../state/workspace/context";
  import {
    isMalformedAppPath,
    isTimeSeriesRoute,
    parseAppLocation,
  } from "../../state/workspace/routeDefinitions";
  import type { TimeSeriesModelId } from "../../state/timeSeries/modelConfigs";

  const { timeSeriesState, navigation } = getWorkspaceContext();
  const parsed = $derived(parseAppLocation(route.pathname));
  const definition = $derived(parsed?.definition);
  const showNotFound = $derived(
    isMalformedAppPath(route.pathname) || !isTimeSeriesRoute(definition),
  );

  $effect(() => {
    if (!showNotFound) {
      timeSeriesState.actions.start();
    }
  });
</script>

{#if showNotFound}
  <NotFoundRoute />
{:else if definition}
  <WorkspaceTwoColumnLayout
    gridColsClass="xl:grid-cols-[26rem_minmax(0,1fr)]"
  >
    {#snippet aside()}
      <TimeSeriesInputPanel
        controller={timeSeriesState}
        onSelectModel={(modelId: TimeSeriesModelId) => {
          navigation.selectModel(definition, modelId);
        }}
      />
    {/snippet}
    {#snippet main()}
      <TimeSeriesResults controller={timeSeriesState} />
    {/snippet}
  </WorkspaceTwoColumnLayout>
{/if}
