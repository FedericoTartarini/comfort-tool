import { describe, expect, it, vi } from "vitest";
import { ComfortModel } from "../../models/comfortModels";
import { FieldKey } from "../../models/fieldKeys";
import { InputId } from "../../models/inputSlots";
import { ChartMode } from "../../models/modelCapabilities";
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
  it("preserves an eligible model while enforcing the route mode", () => {
    const toolState = createComfortToolState();
    const navigate = vi.fn();
    const coordinator = createWorkspaceNavigation(toolState, { navigate });
    toolState.actions.setChartMode(ChartMode.Explore);

    expect(coordinator.prepareUrl(routeUrl("/ASHRAE-55/"))).toBe(true);
    expect(toolState.state.ui.selectedModel).toBe(ComfortModel.PmvAshrae);
    expect(toolState.state.ui.chartSettingsByModel[ComfortModel.PmvAshrae].mode)
      .toBe(ChartMode.Compliance);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("selects an ineligible route's default model without duplicating route lists", () => {
    const toolState = createComfortToolState();
    const coordinator = createWorkspaceNavigation(toolState, { navigate: vi.fn() });
    toolState.actions.setSelectedModel(ComfortModel.Utci, {
      validateRanges: false,
      schedule: false,
    });

    expect(coordinator.prepareUrl(routeUrl("/ISO-7730/"))).toBe(true);
    expect(toolState.state.ui.selectedModel).toBe(ComfortModel.PmvIso);
    expect(toolState.state.ui.chartSettingsByModel[ComfortModel.PmvIso].mode)
      .toBe(ChartMode.Compliance);
  });

  it("keeps model, mode, and navigation atomic across warning cancel and confirm", () => {
    const toolState = createComfortToolState();
    const navigate = vi.fn();
    const coordinator = createWorkspaceNavigation(toolState, { navigate });
    const explore = requireCalculationRoute("/Explore/");

    coordinator.prepareUrl(routeUrl(explore.path));
    coordinator.selectModel(explore, ComfortModel.WindChill);
    expect(toolState.selectors.getPendingModelSwitch()?.targetModel)
      .toBe(ComfortModel.WindChill);
    expect(coordinator.prepareUrl(routeUrl("/Time-Series/"))).toBe(false);

    coordinator.cancelPendingTransition();
    expect(toolState.state.ui.selectedModel).toBe(ComfortModel.PmvAshrae);
    expect(toolState.state.ui.chartSettingsByModel[ComfortModel.PmvAshrae].mode)
      .toBe(ChartMode.Explore);
    expect(navigate).not.toHaveBeenCalled();

    coordinator.selectModel(explore, ComfortModel.WindChill);
    coordinator.confirmPendingTransition();
    expect(toolState.state.ui.selectedModel).toBe(ComfortModel.WindChill);
    expect(toolState.state.ui.chartSettingsByModel[ComfortModel.WindChill].mode)
      .toBe(ChartMode.Explore);

    const ashraeUrl = routeUrl("/ASHRAE-55/");
    expect(coordinator.prepareUrl(ashraeUrl)).toBe(false);
    expect(toolState.state.ui.selectedModel).toBe(ComfortModel.WindChill);
    expect(toolState.state.ui.chartSettingsByModel[ComfortModel.WindChill].mode)
      .toBe(ChartMode.Explore);

    coordinator.cancelPendingTransition();
    expect(toolState.state.ui.selectedModel).toBe(ComfortModel.WindChill);
    expect(navigate).not.toHaveBeenCalled();

    expect(coordinator.prepareUrl(ashraeUrl)).toBe(false);
    coordinator.confirmPendingTransition();
    expect(toolState.state.ui.selectedModel).toBe(ComfortModel.PmvAshrae);
    expect(toolState.state.ui.chartSettingsByModel[ComfortModel.PmvAshrae].mode)
      .toBe(ChartMode.Compliance);
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({
      url: ashraeUrl,
    }));
  });

  it("lets pathname constraints win over a valid v1 share snapshot", () => {
    const source = createComfortToolState();
    source.actions.setSelectedModel(ComfortModel.Utci, {
      validateRanges: false,
      schedule: false,
    });
    const ashraeSettings = source.state.ui.chartSettingsByModel[ComfortModel.PmvAshrae];
    ashraeSettings.explore = {
      ...ashraeSettings.explore!,
      bands: ashraeSettings.explore!.bands.map((band, index) => (
        index === 0 ? { ...band, max: -3.25 } : { ...band }
      )),
    };
    const snapshot = source.actions.exportShareSnapshot();
    const sharedUrl = new URL(buildShareUrl(
      snapshot,
      "http://localhost:5174/ASHRAE-55/",
    ));

    const target = createComfortToolState();
    const coordinator = createWorkspaceNavigation(target, { navigate: vi.fn() });
    expect(coordinator.prepareUrl(sharedUrl, { validateRanges: false })).toBe(true);

    expect(target.state.ui.selectedModel).toBe(ComfortModel.PmvAshrae);
    expect(target.state.ui.chartSettingsByModel[ComfortModel.PmvAshrae].mode)
      .toBe(ChartMode.Compliance);
    expect(target.state.ui.chartSettingsByModel[ComfortModel.PmvAshrae].explore!.bands[0].max)
      .toBe(-3.25);
    expect(target.actions.exportShareSnapshot().version).toBe(1);

    target.state.inputsByInput[InputId.Input1][FieldKey.DryBulbTemperature] = 19;
    coordinator.prepareUrl(routeUrl("/ASHRAE-55/?state=invalid"));
    coordinator.prepareUrl(sharedUrl, { validateRanges: false });
    expect(target.state.inputsByInput[InputId.Input1][FieldKey.DryBulbTemperature])
      .toBe(snapshot.inputsByInput[InputId.Input1][FieldKey.DryBulbTemperature]);
  });

  it("keeps SI input and model presentation state across the Time-series placeholder", () => {
    const toolState = createComfortToolState();
    const coordinator = createWorkspaceNavigation(toolState, { navigate: vi.fn() });
    toolState.state.inputsByInput[InputId.Input1][FieldKey.DryBulbTemperature] = 21.5;
    toolState.state.ui.chartSettingsByModel[ComfortModel.PmvAshrae].xAxis =
      FieldKey.MeanRadiantTemperature;
    const cacheBefore = toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae];

    const timeSeries = appRouteDefinitions.find(
      ({ path }) => path === "/Time-Series/",
    )!;
    expect(coordinator.prepareUrl(routeUrl(timeSeries.path))).toBe(true);
    coordinator.afterNavigation(routeUrl(timeSeries.path));
    expect(coordinator.prepareUrl(routeUrl("/ASHRAE-55/"))).toBe(true);

    expect(toolState.state.inputsByInput[InputId.Input1][FieldKey.DryBulbTemperature])
      .toBe(21.5);
    expect(toolState.state.ui.chartSettingsByModel[ComfortModel.PmvAshrae].xAxis)
      .toBe(FieldKey.MeanRadiantTemperature);
    expect(toolState.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae])
      .toBe(cacheBefore);
  });
});
