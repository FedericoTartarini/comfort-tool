<script lang="ts">
  import ComfortDashboard from "./ComfortDashboard.svelte";
  import NotFoundRoute from "./NotFoundRoute.svelte";
  import { route } from "./router";
  import {
    isCalculationRoute,
    isMalformedAppPath,
    parseAppLocation,
  } from "../../state/app/routeDefinitions";
  import { getAppContext } from "../../state/app/context";

  const { pointSession, navigation } = getAppContext();
  const parsed = $derived(parseAppLocation(route.pathname));
  const definition = $derived(parsed?.definition);
  const showNotFound = $derived(
    isMalformedAppPath(route.pathname) || !parsed || !isCalculationRoute(definition),
  );

  $effect(() => {
    if (!definition || !isCalculationRoute(definition)) {
      return;
    }
    const routeDefinition = definition;
    pointSession.bindSelectModel((modelId) => {
      navigation.selectModel(routeDefinition, modelId);
    });
  });
</script>

{#if showNotFound}
  <NotFoundRoute />
{:else if definition && isCalculationRoute(definition)}
  <ComfortDashboard {pointSession} />
{/if}
