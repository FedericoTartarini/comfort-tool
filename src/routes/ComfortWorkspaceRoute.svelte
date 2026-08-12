<script lang="ts">
  import ComfortDashboard from "../views/ComfortDashboard.svelte";
  import { route } from "./router";
  import {
    getAllowedModels,
    getAppRouteByPath,
    isCalculationRoute,
  } from "../state/workspace/routeDefinitions";
  import { getWorkspaceContext } from "../state/workspace/context";

  const { toolState, navigation } = getWorkspaceContext();
  const definition = $derived(getAppRouteByPath(route.pathname));
  const allowedModelIds = $derived(
    definition ? getAllowedModels(definition) : [],
  );
</script>

{#if definition && isCalculationRoute(definition)}
  <ComfortDashboard
    {toolState}
    {allowedModelIds}
    onSelectModel={(modelId) => navigation.selectModel(definition, modelId)}
  />
{/if}
