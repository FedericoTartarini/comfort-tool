import { describe, expect, it, vi } from "vitest";
import { ModelId } from "../../catalog/modelIds";
import { PhysicalQuantityId } from "../../catalog/quantities";
import { InputId } from "../../catalog/inputSlots";
import { WorkspaceId } from "../../catalog/workspaces";
import {
  appRouteDefinitions,
  getAppRouteByPath,
  isCalculationRoute,
} from "./routeDefinitions";
import { createAnalysisState } from "../analysis/createAnalysisState.svelte";
import { buildShareUrl } from "../analysis/shareState";
import { createWorkspaceNavigation } from "./createWorkspaceNavigation";
import { createTimeSeriesState } from "../timeSeries/createTimeSeriesState.svelte";

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
    const toolState = createAnalysisState();
    const navigate = vi.fn();
    const coordinator = createWorkspaceNavigation(toolState, { navigate });
    toolState.actions.setActiveWorkspace(WorkspaceId.Explore);

    expect(coordinator.prepareUrl(routeUrl("/STANDARD/ASHRAE-55/"))).toBe(true);
    expect(toolState.state.ui.selectedModel).toBe(ModelId.PmvAshrae);
    expect(toolState.state.ui.activeWorkspace).toBe(WorkspaceId.Standard);
    expect(coordinator.getCanonicalPathname(routeUrl("/STANDARD/ASHRAE-55/")))
      .toBe("/standard/ashrae-55/pmv-ashrae/");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("selects an ineligible route's default model without duplicating route lists", () => {
    const toolState = createAnalysisState();
    const coordinator = createWorkspaceNavigation(toolState, { navigate: vi.fn() });
    toolState.actions.setSelectedModel(ModelId.Utci, {
      validateRanges: false,
      schedule: false,
    });

    expect(coordinator.prepareUrl(routeUrl("/standard/iso-7730/"))).toBe(true);
    expect(toolState.state.ui.selectedModel).toBe(ModelId.PmvIso);
    expect(toolState.state.ui.activeWorkspace).toBe(WorkspaceId.Standard);
    expect(coordinator.getCanonicalPathname(routeUrl("/standard/iso-7730/")))
      .toBe("/standard/iso-7730/pmv-iso/");
  });

  it("lets a path model slug win over the current selected model", () => {
    const toolState = createAnalysisState();
    const coordinator = createWorkspaceNavigation(toolState, { navigate: vi.fn() });
    coordinator.prepareUrl(routeUrl("/standard/ashrae-55/"));

    expect(coordinator.prepareUrl(routeUrl("/standard/ashrae-55/adaptive-ashrae/"))).toBe(true);
    expect(toolState.state.ui.selectedModel).toBe(ModelId.AdaptiveAshrae);
    expect(coordinator.getCanonicalPathname(routeUrl("/Standard/ASHRAE-55/Adaptive-Ashrae/")))
      .toBe("/standard/ashrae-55/adaptive-ashrae/");
  });

  it("navigates to the canonical model path when selecting a model", () => {
    const toolState = createAnalysisState();
    const navigate = vi.fn();
    const coordinator = createWorkspaceNavigation(toolState, { navigate });
    const explore = requireCalculationRoute("/explore/");
    coordinator.prepareUrl(routeUrl(explore.path));
    navigate.mockClear();

    coordinator.selectModel(explore, ModelId.Utci);
    expect(toolState.state.ui.selectedModel).toBe(ModelId.Utci);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0][0].url.pathname).toBe("/explore/utci/");
    expect(navigate.mock.calls[0][0].url.searchParams.has("state")).toBe(false);
  });

  it("navigates to the canonical time-series model path", () => {
    const toolState = createAnalysisState();
    const timeSeries = createTimeSeriesState();
    const navigate = vi.fn();
    const coordinator = createWorkspaceNavigation(toolState, { navigate }, timeSeries);
    const definition = getAppRouteByPath("/time-series/")!;
    coordinator.prepareUrl(routeUrl(definition.path));
    navigate.mockClear();

    coordinator.selectModel(definition, ModelId.Phs2023);
    expect(timeSeries.state.selectedModel).toBe(ModelId.Phs2023);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0][0].url.pathname).toBe("/time-series/phs-2023/");
    timeSeries.actions.dispose();
  });

  it("keeps model, workspace, and navigation atomic across warning cancel and confirm", () => {
    const toolState = createAnalysisState();
    const navigate = vi.fn();
    const coordinator = createWorkspaceNavigation(toolState, { navigate });
    const explore = requireCalculationRoute("/explore/");

    coordinator.prepareUrl(routeUrl(explore.path));
    coordinator.selectModel(explore, ModelId.WindChill);
    expect(toolState.selectors.getPendingModelSwitch()?.targetModel)
      .toBe(ModelId.WindChill);
    expect(coordinator.prepareUrl(routeUrl("/time-series/"))).toBe(false);

    coordinator.cancelPendingTransition();
    expect(toolState.state.ui.selectedModel).toBe(ModelId.PmvAshrae);
    expect(toolState.state.ui.activeWorkspace).toBe(WorkspaceId.Explore);
    expect(navigate).not.toHaveBeenCalled();

    coordinator.selectModel(explore, ModelId.WindChill);
    coordinator.confirmPendingTransition();
    expect(toolState.state.ui.selectedModel).toBe(ModelId.WindChill);
    expect(toolState.state.ui.activeWorkspace).toBe(WorkspaceId.Explore);
    expect(navigate.mock.calls[0][0].url.pathname).toBe("/explore/wind-chill/");
    navigate.mockClear();

    const ashraeUrl = routeUrl("/standard/ashrae-55/");
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
    const source = createAnalysisState();
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
      "http://localhost:5174/standard/ashrae-55/",
    ));

    const target = createAnalysisState();
    const coordinator = createWorkspaceNavigation(target, { navigate: vi.fn() });
    expect(coordinator.prepareUrl(sharedUrl, { validateRanges: false })).toBe(true);

    expect(target.state.ui.selectedModel).toBe(ModelId.PmvAshrae);
    expect(target.state.ui.activeWorkspace).toBe(WorkspaceId.Standard);
    expect(target.state.ui.outputSettingsByModel[ModelId.PmvAshrae].exploreBands?.[0].max)
      .toBe(-3.25);
    expect(target.actions.exportShareSnapshot().version).toBe(1);

    target.state.quantitiesByInput[InputId.Input1][PhysicalQuantityId.DryBulbTemperature] = 19;
    coordinator.prepareUrl(routeUrl("/standard/ashrae-55/?state=invalid"));
    coordinator.prepareUrl(sharedUrl, { validateRanges: false });
    expect(target.state.quantitiesByInput[InputId.Input1][PhysicalQuantityId.DryBulbTemperature])
      .toBe(snapshot.quantitiesByInput[InputId.Input1][PhysicalQuantityId.DryBulbTemperature]);
  });

  it("lets a path model slug win over a share snapshot selectedModel", () => {
    const source = createAnalysisState();
    source.actions.setSelectedModel(ModelId.Utci, {
      validateRanges: false,
      schedule: false,
    });
    const snapshot = source.actions.exportShareSnapshot();
    const sharedUrl = new URL(buildShareUrl(
      snapshot,
      "http://localhost:5174/explore/heat-index/",
    ));

    const target = createAnalysisState();
    const coordinator = createWorkspaceNavigation(target, { navigate: vi.fn() });
    expect(coordinator.prepareUrl(sharedUrl, { validateRanges: false })).toBe(true);
    expect(target.state.ui.selectedModel).toBe(ModelId.HeatIndex);
    expect(target.state.ui.activeWorkspace).toBe(WorkspaceId.Explore);
  });

  it("keeps SI input and model presentation state across the Time-series placeholder", () => {
    const toolState = createAnalysisState();
    const coordinator = createWorkspaceNavigation(toolState, { navigate: vi.fn() });
    toolState.state.quantitiesByInput[InputId.Input1][PhysicalQuantityId.DryBulbTemperature] = 21.5;
    toolState.state.ui.outputSettingsByModel[ModelId.PmvAshrae].xAxis =
      PhysicalQuantityId.MeanRadiantTemperature;
    const cacheBefore = toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae];

    const timeSeries = appRouteDefinitions.find(
      ({ path }) => path === "/time-series/",
    )!;
    expect(coordinator.prepareUrl(routeUrl(timeSeries.path))).toBe(true);
    coordinator.afterNavigation(routeUrl(timeSeries.path));
    expect(coordinator.prepareUrl(routeUrl("/standard/ashrae-55/"))).toBe(true);

    expect(toolState.state.quantitiesByInput[InputId.Input1][PhysicalQuantityId.DryBulbTemperature])
      .toBe(21.5);
    expect(toolState.state.ui.outputSettingsByModel[ModelId.PmvAshrae].xAxis)
      .toBe(PhysicalQuantityId.MeanRadiantTemperature);
    expect(toolState.state.ui.calculationCacheByModel[ModelId.PmvAshrae])
      .toBe(cacheBefore);
  });
});
