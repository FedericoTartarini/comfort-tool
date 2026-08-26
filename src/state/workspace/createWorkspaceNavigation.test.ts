import { describe, expect, it, vi } from "vitest";
import { ModelId } from "../../models/comfortModels";
import { PhysicalQuantityId } from "../../models/physicalQuantities";
import { InputId } from "../../models/inputSlots";
import { WorkspaceId } from "../../models/workspaces";
import {
  appRouteDefinitions,
  getAppRouteByPath,
  isCalculationRoute,
} from "./routeDefinitions";
import { createComfortToolState } from "../comfortTool/createComfortToolState.svelte";
import { buildShareUrl } from "../comfortTool/shareState";
import { createWorkspaceNavigation } from "./createWorkspaceNavigation";

function routeUrl(path: string): URL {
  return new URL(path, "http://localhost:5174");
}

function requireCalculationRoute(path: string) {
  const definition = getAppRouteByPath(path);
  if (!isCalculationRoute(definition)) {
    throw new Error(`Expected a calculation route for ${path}.`);
  }
  return definition;
}

describe("workspace navigation coordination", () => {
  it("preserves an eligible model while enforcing the route workspace", () => {
    const toolState = createComfortToolState();
    const navigate = vi.fn();
    const coordinator = createWorkspaceNavigation(toolState, { navigate });
    toolState.actions.setActiveWorkspace(WorkspaceId.Explore);

    expect(coordinator.prepareUrl(routeUrl("/ASHRAE-55/"))).toBe(true);
    expect(toolState.state.ui.selectedModel).toBe(ModelId.PmvAshrae);
    expect(toolState.state.ui.activeWorkspace).toBe(WorkspaceId.Standard);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("selects an ineligible route's default model without duplicating route lists", () => {
    const toolState = createComfortToolState();
    const coordinator = createWorkspaceNavigation(toolState, { navigate: vi.fn() });
    toolState.actions.setSelectedModel(ModelId.Utci, {
      validateRanges: false,
      schedule: false,
    });

    expect(coordinator.prepareUrl(routeUrl("/ISO-7730/"))).toBe(true);
    expect(toolState.state.ui.selectedModel).toBe(ModelId.PmvIso);
    expect(toolState.state.ui.activeWorkspace).toBe(WorkspaceId.Standard);
  });

  it("keeps model, workspace, and navigation atomic across warning cancel and confirm", () => {
    const toolState = createComfortToolState();
    const navigate = vi.fn();
    const coordinator = createWorkspaceNavigation(toolState, { navigate });
    const explore = requireCalculationRoute("/Explore/");

    coordinator.prepareUrl(routeUrl(explore.path));
    coordinator.selectModel(explore, ModelId.WindChill);
    expect(toolState.selectors.getPendingModelSwitch()?.targetModel)
      .toBe(ModelId.WindChill);
    expect(coordinator.prepareUrl(routeUrl("/Time-Series/"))).toBe(false);

    coordinator.cancelPendingTransition();
    expect(toolState.state.ui.selectedModel).toBe(ModelId.PmvAshrae);
    expect(toolState.state.ui.activeWorkspace).toBe(WorkspaceId.Explore);
    expect(navigate).not.toHaveBeenCalled();

    coordinator.selectModel(explore, ModelId.WindChill);
    coordinator.confirmPendingTransition();
    expect(toolState.state.ui.selectedModel).toBe(ModelId.WindChill);
    expect(toolState.state.ui.activeWorkspace).toBe(WorkspaceId.Explore);

    const ashraeUrl = routeUrl("/ASHRAE-55/");
    expect(coordinator.prepareUrl(ashraeUrl)).toBe(false);
    expect(toolState.state.ui.selectedModel).toBe(ModelId.WindChill);
    expect(toolState.state.ui.activeWorkspace).toBe(WorkspaceId.Explore);

    coordinator.cancelPendingTransition();
    expect(toolState.state.ui.selectedModel).toBe(ModelId.WindChill);
    expect(navigate).not.toHaveBeenCalled();

    expect(coordinator.prepareUrl(ashraeUrl)).toBe(false);
    coordinator.confirmPendingTransition();
    expect(toolState.state.ui.selectedModel).toBe(ModelId.PmvAshrae);
    expect(toolState.state.ui.activeWorkspace).toBe(WorkspaceId.Standard);
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({
      url: ashraeUrl,
    }));
  });

  it("lets pathname constraints win over a valid v1 share snapshot", () => {
    const source = createComfortToolState();
    source.actions.setSelectedModel(ModelId.Utci, {
      validateRanges: false,
      schedule: false,
    });
    const ashraeSettings = source.state.ui.outputSettingsByModel[ModelId.PmvAshrae];
    ashraeSettings.exploreBands = ashraeSettings.exploreBands?.map((band, index) => (
      index === 0 ? { ...band, max: -3.25 } : { ...band }
    )) ?? null;
    const snapshot = source.actions.exportShareSnapshot();
    const sharedUrl = new URL(buildShareUrl(
      snapshot,
      "http://localhost:5174/ASHRAE-55/",
    ));

    const target = createComfortToolState();
    const coordinator = createWorkspaceNavigation(target, { navigate: vi.fn() });
    expect(coordinator.prepareUrl(sharedUrl, { validateRanges: false })).toBe(true);

    expect(target.state.ui.selectedModel).toBe(ModelId.PmvAshrae);
    expect(target.state.ui.activeWorkspace).toBe(WorkspaceId.Standard);
    expect(target.state.ui.outputSettingsByModel[ModelId.PmvAshrae].exploreBands?.[0].max)
      .toBe(-3.25);
    expect(target.actions.exportShareSnapshot().version).toBe(1);

    target.state.quantitiesByInput[InputId.Input1][PhysicalQuantityId.DryBulbTemperature] = 19;
    coordinator.prepareUrl(routeUrl("/ASHRAE-55/?state=invalid"));
    coordinator.prepareUrl(sharedUrl, { validateRanges: false });
    expect(target.state.quantitiesByInput[InputId.Input1][PhysicalQuantityId.DryBulbTemperature])
      .toBe(snapshot.quantitiesByInput[InputId.Input1][PhysicalQuantityId.DryBulbTemperature]);
  });

  it("keeps SI input and model presentation state across the Time-series placeholder", () => {
    const toolState = createComfortToolState();
    const coordinator = createWorkspaceNavigation(toolState, { navigate: vi.fn() });
    toolState.state.quantitiesByInput[InputId.Input1][PhysicalQuantityId.DryBulbTemperature] = 21.5;
    toolState.state.ui.outputSettingsByModel[ModelId.PmvAshrae].xAxis =
      PhysicalQuantityId.MeanRadiantTemperature;
    const cacheBefore = toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae];

    const timeSeries = appRouteDefinitions.find(
      ({ path }) => path === "/Time-Series/",
    )!;
    expect(coordinator.prepareUrl(routeUrl(timeSeries.path))).toBe(true);
    coordinator.afterNavigation(routeUrl(timeSeries.path));
    expect(coordinator.prepareUrl(routeUrl("/ASHRAE-55/"))).toBe(true);

    expect(toolState.state.quantitiesByInput[InputId.Input1][PhysicalQuantityId.DryBulbTemperature])
      .toBe(21.5);
    expect(toolState.state.ui.outputSettingsByModel[ModelId.PmvAshrae].xAxis)
      .toBe(PhysicalQuantityId.MeanRadiantTemperature);
    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae])
      .toBe(cacheBefore);
  });
});
