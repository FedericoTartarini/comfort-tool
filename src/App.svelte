<script lang="ts">
  import { onDestroy } from "svelte";

  import SiteShell from "./ui/components/SiteShell.svelte";
  import { createPointSession } from "./state/pointSession/createPointSession.svelte";
  import ModelSwitchWarningModal from "./ui/components/modals/ModelSwitchWarningModal.svelte";
  import {
    Router,
    navigateToUrl,
    registerAppNavigation,
    route,
  } from "./ui/routes/router";
  import { createAppNavigation } from "./state/app/createAppNavigation";
  import { provideAppContext } from "./state/app/context";
  import {
    appRouteDefinitions,
    defaultAppRoute,
    getAppRouteByPath,
    standardRouteDefinitions,
  } from "./state/app/routeDefinitions";
  import { SurfaceId } from "./catalog/surfaces";
  import { createTimeSeriesSession } from "./state/timeSeries/createTimeSeriesSession.svelte";

  const pointSession = createPointSession();
  const timeSeriesSession = createTimeSeriesSession();
  const navigation = createAppNavigation(pointSession, {
    navigate: navigateToUrl,
  }, timeSeriesSession);
  provideAppContext({ pointSession, navigation, timeSeriesSession });

  if (typeof window !== "undefined") {
    navigation.prepareUrl(new URL(window.location.href), { validateRanges: false });
  }

  const unregisterNavigation = registerAppNavigation(navigation);
  onDestroy(unregisterNavigation);
  onDestroy(timeSeriesSession.actions.dispose);

  const exploreRoute = appRouteDefinitions.find(
    (definition) => definition.surface === SurfaceId.Explore,
  )!;
  const timeSeriesRoute = appRouteDefinitions.find(
    (definition) => definition.surface === SurfaceId.TimeSeries,
  )!;
  const currentRouteDefinition = $derived(getAppRouteByPath(route.pathname));
  const activePath = $derived(currentRouteDefinition?.path ?? "");
  const showExportLink = $derived(currentRouteDefinition?.shareEnabled ?? false);
</script>

<SiteShell
  {pointSession}
  {activePath}
  {showExportLink}
  homePath={defaultAppRoute.path}
  standardItems={standardRouteDefinitions}
  exploreItem={exploreRoute}
  timeSeriesItem={timeSeriesRoute}
>
  <Router />
</SiteShell>

<ModelSwitchWarningModal
  {pointSession}
  onConfirm={navigation.confirmPendingTransition}
  onCancel={navigation.cancelPendingTransition}
/>
