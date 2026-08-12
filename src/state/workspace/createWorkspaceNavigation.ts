import type { ComfortModel as ComfortModelType } from "../../models/comfortModels";
import {
  getAllowedModels,
  getAppRouteByPath,
  isCalculationRoute,
  type AppRouteDefinition,
} from "./routeDefinitions";
import { readShareStateFromUrl } from "../comfortTool/shareState";
import type { ComfortToolController } from "../comfortTool/types";

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
  selectModel: (
    definition: AppRouteDefinition,
    modelId: ComfortModelType,
  ) => void;
  confirmPendingTransition: () => void;
  cancelPendingTransition: () => void;
}

function navigationKey(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

export function createWorkspaceNavigation(
  toolState: ComfortToolController,
  port: WorkspaceNavigationPort,
): WorkspaceNavigationCoordinator {
  let pendingTransition: PendingWorkspaceTransition | null = null;
  let lastAppliedShareKey: string | null = null;
  let forceCalculationKey: string | null = null;

  function reconcileCalculationRoute(
    definition: AppRouteDefinition,
    url: URL,
    options?: { validateRanges?: boolean },
  ): boolean {
    if (!isCalculationRoute(definition)) {
      return true;
    }

    const shareSnapshot = readShareStateFromUrl(url);
    const shareKey = url.searchParams.has("state") ? navigationKey(url) : null;
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
    const selectedModel = toolState.state.ui.selectedModel;
    const targetModel = allowedModels.includes(selectedModel)
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
    toolState.actions.setChartMode(definition.requiredMode);
    return true;
  }

  function prepareUrl(url: URL, options?: { validateRanges?: boolean }): boolean {
    if (toolState.selectors.getPendingModelSwitch()) {
      return false;
    }

    const definition = getAppRouteByPath(url.pathname);
    if (!definition) {
      lastAppliedShareKey = null;
      return true;
    }

    return reconcileCalculationRoute(definition, url, options);
  }

  function afterNavigation(url: URL) {
    const definition = getAppRouteByPath(url.pathname);
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

  function selectModel(
    definition: AppRouteDefinition,
    modelId: ComfortModelType,
  ) {
    if (!isCalculationRoute(definition)) {
      return;
    }

    const allowedModels = getAllowedModels(definition);
    if (!allowedModels.includes(modelId)) {
      return;
    }

    toolState.actions.setSelectedModel(modelId, { schedule: false });
    if (toolState.selectors.getPendingModelSwitch()) {
      pendingTransition = {
        definition,
        navigationTarget: null,
      };
      return;
    }

    pendingTransition = null;
    toolState.actions.setChartMode(definition.requiredMode);
    toolState.actions.scheduleCalculation({ immediate: true });
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
      toolState.actions.setChartMode(transition.definition.requiredMode);
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
    selectModel,
    confirmPendingTransition,
    cancelPendingTransition,
  };
}
