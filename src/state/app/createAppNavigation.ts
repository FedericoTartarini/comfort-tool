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
import { readShareStateFromUrl } from "../pointSession/shareState";
import type { PointSession } from "../pointSession/types";
import type { TimeSeriesSession } from "../timeSeries/types";
import type { TimeSeriesModelId } from "../timeSeries/modelConfigs";

export interface AppNavigationTarget {
  readonly url: URL;
  readonly replace?: boolean;
}

export interface AppNavigationPort {
  navigate: (target: AppNavigationTarget) => void;
}

interface PendingAppTransition {
  readonly definition: AppRouteDefinition;
  readonly navigationTarget: AppNavigationTarget | null;
}

export interface AppNavigationCoordinator {
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

export function createAppNavigation(
  pointSession: PointSession,
  port: AppNavigationPort,
  timeSeriesSession?: TimeSeriesSession,
): AppNavigationCoordinator {
  let pendingTransition: PendingAppTransition | null = null;
  let lastAppliedShareKey: string | null = null;
  let forceCalculationKey: string | null = null;

  function applyTimeSeriesRoute(definition: AppRouteDefinition, url: URL): boolean {
    if (!timeSeriesSession || !definition.defaultModelId) {
      return true;
    }

    const allowedModels = getAllowedModels(definition);
    const pathModelId = parseAppLocation(url.pathname)?.modelId;
    const selectedModel = timeSeriesSession.setting.selectedModel;
    const targetModel = pathModelId && allowedModels.includes(pathModelId)
      ? pathModelId
      : allowedModels.includes(selectedModel)
        ? selectedModel
        : definition.defaultModelId;
    timeSeriesSession.actions.selectModel(targetModel as TimeSeriesModelId);
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
      pointSession.actions.applyShareSnapshot(shareSnapshot, { schedule: false });
      lastAppliedShareKey = shareKey;
      forceCalculationKey = shareKey;
    } else if (!shareSnapshot) {
      lastAppliedShareKey = null;
    }

    const allowedModels = getAllowedModels(definition);
    const pathModelId = parseAppLocation(url.pathname)?.modelId;
    const selectedModel = pointSession.setting.selectedModel;
    const targetModel = pathModelId && allowedModels.includes(pathModelId)
      ? pathModelId
      : allowedModels.includes(selectedModel)
        ? selectedModel
        : definition.defaultModelId;

    pointSession.actions.setSelectedModel(targetModel, {
      validateRanges: !shouldApplySnapshot && options?.validateRanges !== false,
      schedule: false,
    });

    if (pointSession.pendingModelSwitch) {
      pendingTransition = {
        definition,
        navigationTarget: { url, replace: false },
      };
      return false;
    }

    pendingTransition = null;
    pointSession.actions.setActiveSurface(definition.surface);
    pointSession.actions.setAllowedModelIds(allowedModels);
    return true;
  }

  function prepareUrl(url: URL, options?: { validateRanges?: boolean }): boolean {
    if (pointSession.pendingModelSwitch) {
      return false;
    }

    const parsed = parseAppLocation(url.pathname);
    if (!parsed) {
      lastAppliedShareKey = null;
      return true;
    }

    if (parsed.definition.surface === SurfaceId.TimeSeries) {
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
    pointSession.actions.scheduleCalculation({ immediate: true, force });
  }

  function getCanonicalPathname(url: URL): string | undefined {
    const parsed = parseAppLocation(url.pathname);
    const selectedModel = parsed?.definition.surface === SurfaceId.TimeSeries
      ? timeSeriesSession?.setting.selectedModel ?? parsed.definition.defaultModelId
      : pointSession.setting.selectedModel;
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
      pointSession.actions.confirmModelSwitch();
      return;
    }

    pendingTransition = null;
    pointSession.actions.confirmModelSwitch({ schedule: false });
    if (isCalculationRoute(transition.definition)) {
      pointSession.actions.setActiveSurface(transition.definition.surface);
      pointSession.actions.setAllowedModelIds(getAllowedModels(transition.definition));
    }

    if (transition.navigationTarget) {
      port.navigate(transition.navigationTarget);
      return;
    }

    pointSession.actions.scheduleCalculation({ immediate: true });
  }

  function cancelPendingTransition() {
    pendingTransition = null;
    pointSession.actions.cancelModelSwitch();
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


