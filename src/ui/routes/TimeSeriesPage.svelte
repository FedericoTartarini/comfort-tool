<svelte:options runes={true} />

<script lang="ts">
  import TimeSeriesInputPanel from "../components/time-series/TimeSeriesInputPanel.svelte";
  import TimeSeriesResults from "../components/time-series/TimeSeriesResults.svelte";
  import TwoColumnLayout from "../components/layout/TwoColumnLayout.svelte";
  import NotFoundRoute from "../routes/NotFoundRoute.svelte";
  import { route } from "../routes/router";
  import { getAppContext } from "../../state/app/context";
  import {
    isMalformedAppPath,
    isTimeSeriesRoute,
    parseAppLocation,
  } from "../../state/app/routeDefinitions";
  import type { TimeSeriesModelId } from "../../state/timeSeries/modelConfigs";

  const { timeSeriesSession, navigation } = getAppContext();
  const parsed = $derived(parseAppLocation(route.pathname));
  const definition = $derived(parsed?.definition);
  const showNotFound = $derived(
    isMalformedAppPath(route.pathname) || !isTimeSeriesRoute(definition),
  );

  $effect(() => {
    if (!showNotFound) {
      timeSeriesSession.actions.start();
    }
  });
</script>

{#if showNotFound}
  <NotFoundRoute />
{:else if definition}
  <TwoColumnLayout
    gridColsClass="xl:grid-cols-[26rem_minmax(0,1fr)]"
  >
    {#snippet aside()}
      <TimeSeriesInputPanel
        panel={timeSeriesSession.inputPanel}
        actions={timeSeriesSession.actions}
        onSelectModel={(modelId: TimeSeriesModelId) => {
          navigation.selectModel(definition, modelId);
        }}
      />
    {/snippet}
    {#snippet main()}
      <TimeSeriesResults panel={timeSeriesSession.results} />
    {/snippet}
  </TwoColumnLayout>
{/if}
