import type { ModelId as ModelIdType } from "../../catalog/modelIds";
import { SurfaceId } from "../../catalog/surfaces";
import {
  buildCalculationPath,
  buildCanonicalPathname,
  getAllowedModels,
  isCalculationRoute,
  parseAppLocation,
  type AppRouteDefinition,
} from "./routeDefinitions";
import { readShareStateFromUrl } from "../analysis/shareState";
import type { AnalysisController } from "../analysis/types";
import type { TimeSeriesController } from "../timeSeries/types";
import type { TimeSeriesModelId } from "../timeSeries/modelConfigs";

export interface WorkspaceNavigationTarget {
  readonly url: URL;
  readonly replace?: boolean;
}

export interface WorkspaceNavigationPort {
  navigate: (target: WorkspaceNavigationTarget) => void;
}

interface PendingWorkspaceTransition {
  readonly definition: AppRouteDefinition;
  readonly navigationTarget: WorkspaceNavigationTarget | null;
}

export interface WorkspaceNavigationCoordinator {
  prepareUrl: (url: URL, options?: { validateRanges?: boolean }) => boolean;
  afterNavigation: (url: URL) => void;
  getCanonicalPathname: (url: URL) => string | undefined;
  selectModel: (
    definition: AppRouteDefinition,
    modelId: ModelIdType,
  ) => void;
  confirmPendingTransition: () => void;
  cancelPendingTransition: () => void;
}

const SHARE_STATE_QUERY_PARAM = "state";

function navigationKey(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

function urlForModelPath(pathname: string): URL {
  const href = typeof window !== "undefined" ? window.location.href : "http://localhost/";
  const url = new URL(href);
  url.pathname = pathname;
  url.searchParams.delete(SHARE_STATE_QUERY_PARAM);
  return url;
}

export function createWorkspaceNavigation(
  toolState: AnalysisController,
  port: WorkspaceNavigationPort,
  timeSeries?: TimeSeriesController,
): WorkspaceNavigationCoordinator {
  let pendingTransition: PendingWorkspaceTransition | null = null;
  let lastAppliedShareKey: string | null = null;
  let forceCalculationKey: string | null = null;

  function applyTimeSeriesRoute(definition: AppRouteDefinition, url: URL): boolean {
    if (!timeSeries || !definition.defaultModelId) {
      return true;
    }

    const allowedModels = getAllowedModels(definition);
    const pathModelId = parseAppLocation(url.pathname)?.modelId;
    const selectedModel = timeSeries.state.setting.selectedModel;
    const targetModel = pathModelId && allowedModels.includes(pathModelId)
      ? pathModelId
      : allowedModels.includes(selectedModel)
        ? selectedModel
        : definition.defaultModelId;
    timeSeries.actions.selectModel(targetModel as TimeSeriesModelId);
    return true;
  }

  function reconcileCalculationRoute(
    definition: AppRouteDefinition,
    url: URL,
    options?: { validateRanges?: boolean },
  ): boolean {
    if (!isCalculationRoute(definition)) {
      return true;
    }

    const shareSnapshot = readShareStateFromUrl(url);
    const shareKey = url.searchParams.has(SHARE_STATE_QUERY_PARAM)
      ? navigationKey(url)
      : null;
    const shouldApplySnapshot = Boolean(
      shareSnapshot && shareKey && shareKey !== lastAppliedShareKey,
    );

    if (shouldApplySnapshot && shareKey && shareSnapshot) {
      toolState.actions.applyShareSnapshot(shareSnapshot, { schedule: false });
      lastAppliedShareKey = shareKey;
      forceCalculationKey = shareKey;
    } else if (!shareSnapshot) {
      lastAppliedShareKey = null;
    }

    const allowedModels = getAllowedModels(definition);
    const pathModelId = parseAppLocation(url.pathname)?.modelId;
    const selectedModel = toolState.state.setting.selectedModel;
    const targetModel = pathModelId && allowedModels.includes(pathModelId)
      ? pathModelId
      : allowedModels.includes(selectedModel)
        ? selectedModel
        : definition.defaultModelId;

    toolState.actions.setSelectedModel(targetModel, {
      validateRanges: !shouldApplySnapshot && options?.validateRanges !== false,
      schedule: false,
    });

    if (toolState.selectors.getPendingModelSwitch()) {
      pendingTransition = {
        definition,
        navigationTarget: { url, replace: false },
      };
      return false;
    }

    pendingTransition = null;
    toolState.actions.setActiveSurface(definition.workspace);
    return true;
  }

  function prepareUrl(url: URL, options?: { validateRanges?: boolean }): boolean {
    if (toolState.selectors.getPendingModelSwitch()) {
      return false;
    }

    const parsed = parseAppLocation(url.pathname);
    if (!parsed) {
      lastAppliedShareKey = null;
      return true;
    }

    if (parsed.definition.workspace === SurfaceId.TimeSeries) {
      return applyTimeSeriesRoute(parsed.definition, url);
    }

    return reconcileCalculationRoute(parsed.definition, url, options);
  }

  function afterNavigation(url: URL) {
    const definition = parseAppLocation(url.pathname)?.definition;
    if (!isCalculationRoute(definition)) {
      return;
    }

    const key = navigationKey(url);
    const force = forceCalculationKey === key;
    if (force) {
      forceCalculationKey = null;
    }
    toolState.actions.scheduleCalculation({ immediate: true, force });
  }

  function getCanonicalPathname(url: URL): string | undefined {
    const parsed = parseAppLocation(url.pathname);
    const selectedModel = parsed?.definition.workspace === SurfaceId.TimeSeries
      ? timeSeries?.state.setting.selectedModel ?? parsed.definition.defaultModelId
      : toolState.state.setting.selectedModel;
    if (!selectedModel) {
      return undefined;
    }
    return buildCanonicalPathname(url.pathname, selectedModel);
  }

  function selectModel(
    definition: AppRouteDefinition,
    modelId: ModelIdType,
  ) {
    if (!definition.defaultModelId) {
      return;
    }

    const allowedModels = getAllowedModels(definition);
    if (!allowedModels.includes(modelId)) {
      return;
    }

    const url = urlForModelPath(buildCalculationPath(definition, modelId));
    if (!prepareUrl(url)) {
      return;
    }

    port.navigate({ url, replace: false });
  }

  function confirmPendingTransition() {
    const transition = pendingTransition;
    if (!transition) {
      toolState.actions.confirmModelSwitch();
      return;
    }

    pendingTransition = null;
    toolState.actions.confirmModelSwitch({ schedule: false });
    if (isCalculationRoute(transition.definition)) {
      toolState.actions.setActiveSurface(transition.definition.workspace);
    }

    if (transition.navigationTarget) {
      port.navigate(transition.navigationTarget);
      return;
    }

    toolState.actions.scheduleCalculation({ immediate: true });
  }

  function cancelPendingTransition() {
    pendingTransition = null;
    toolState.actions.cancelModelSwitch();
  }

  return {
    prepareUrl,
    afterNavigation,
    getCanonicalPathname,
    selectModel,
    confirmPendingTransition,
    cancelPendingTransition,
  };
}
