<script lang="ts">
  import ComfortDashboard from "../views/ComfortDashboard.svelte";
  import NotFoundRoute from "./NotFoundRoute.svelte";
  import { route } from "./router";
  import {
    getAllowedModels,
    isCalculationRoute,
    isMalformedAppPath,
    parseAppLocation,
  } from "../../state/workspace/routeDefinitions";
  import { getWorkspaceContext } from "../../state/workspace/context";

  const { toolState, navigation } = getWorkspaceContext();
  const parsed = $derived(parseAppLocation(route.pathname));
  const definition = $derived(parsed?.definition);
  const allowedModelIds = $derived(
    definition ? getAllowedModels(definition) : [],
  );
  const showNotFound = $derived(
    isMalformedAppPath(route.pathname) || !parsed || !isCalculationRoute(definition),
  );
</script>

{#if showNotFound}
  <NotFoundRoute />
{:else if definition && isCalculationRoute(definition)}
  <ComfortDashboard
    {toolState}
    {allowedModelIds}
    onSelectModel={(modelId) => navigation.selectModel(definition, modelId)}
  />
{/if}
