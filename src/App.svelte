<script lang="ts">
  import { onDestroy } from "svelte";

  import SiteShell from "./components/SiteShell.svelte";
  import { createComfortToolState } from "./state/comfortTool/createComfortToolState.svelte";
  import ModelSwitchWarningModal from "./components/modals/ModelSwitchWarningModal.svelte";
  import {
    Router,
    navigateToUrl,
    registerWorkspaceNavigation,
    route,
  } from "./routes/router";
  import { createWorkspaceNavigation } from "./state/workspace/createWorkspaceNavigation";
  import { provideWorkspaceContext } from "./state/workspace/context";
  import {
    appRouteDefinitions,
    defaultAppRoute,
    getAppRouteByPath,
    standardRouteDefinitions,
  } from "./state/workspace/routeDefinitions";
  import { WorkspaceId } from "./models/workspaces";

  const toolState = createComfortToolState();
  const navigation = createWorkspaceNavigation(toolState, {
    navigate: navigateToUrl,
  });
  provideWorkspaceContext({ toolState, navigation });

  if (typeof window !== "undefined") {
    navigation.prepareUrl(new URL(window.location.href), { validateRanges: false });
  }

  const unregisterNavigation = registerWorkspaceNavigation(navigation);
  onDestroy(unregisterNavigation);

  const exploreRoute = appRouteDefinitions.find(
    (definition) => definition.workspace === WorkspaceId.Explore,
  )!;
  const timeSeriesRoute = appRouteDefinitions.find(
    (definition) => definition.workspace === WorkspaceId.TimeSeries,
  )!;
  const currentRouteDefinition = $derived(getAppRouteByPath(route.pathname));
  const activePath = $derived(currentRouteDefinition?.path ?? "");
  const showExportLink = $derived(currentRouteDefinition?.shareEnabled ?? false);
</script>

<SiteShell
  {toolState}
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
  {toolState}
  onConfirm={navigation.confirmPendingTransition}
  onCancel={navigation.cancelPendingTransition}
/>
