import { describe, expect, it, vi } from "vitest";
import { PhysicalQuantityId } from "../../catalog/quantities";
import { ModelId } from "../../catalog/modelIds";
import { InputId } from "../../catalog/inputSlots";
import { SurfaceId } from "../../catalog/surfaces";
import {
  appRouteDefinitions,
  getAppRouteByPath,
  isCalculationRoute,
} from "./routeDefinitions";
import { createPointSession } from "../pointSession/createPointSession.svelte";
import { buildShareUrl } from "../pointSession/shareState";
import { createAppNavigation } from "./createAppNavigation";
import { createTimeSeriesSession } from "../timeSeries/createTimeSeriesSession.svelte";
import { seedPrimaryQuantity } from "../../testSupport/seedPointSession";

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
    const session = createPointSession();
    const navigate = vi.fn();
    const coordinator = createAppNavigation(session, { navigate });
    session.actions.setActiveSurface(SurfaceId.Explore);

    expect(coordinator.prepareUrl(routeUrl("/STANDARD/ASHRAE-55/"))).toBe(true);
    expect(session.setting.selectedModel).toBe(ModelId.PmvAshrae);
    expect(session.setting.activeSurface).toBe(SurfaceId.Standard);
    expect(session.setting.allowedModelIds).toContain(ModelId.PmvAshrae);
    expect(session.setting.allowedModelIds).not.toContain(ModelId.PmvIso);
    expect(coordinator.getCanonicalPathname(routeUrl("/STANDARD/ASHRAE-55/")))
      .toBe("/standard/ashrae-55/pmv-ashrae/");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("selects an ineligible route's default model without duplicating route lists", () => {
    const session = createPointSession();
    const coordinator = createAppNavigation(session, { navigate: vi.fn() });
    session.actions.setSelectedModel(ModelId.Utci, {
      validateRanges: false,
      schedule: false,
    });

    expect(coordinator.prepareUrl(routeUrl("/standard/iso-7730/"))).toBe(true);
    expect(session.setting.selectedModel).toBe(ModelId.PmvIso);
    expect(session.setting.activeSurface).toBe(SurfaceId.Standard);
    expect(coordinator.getCanonicalPathname(routeUrl("/standard/iso-7730/")))
      .toBe("/standard/iso-7730/pmv-iso/");
  });

  it("lets a path model slug win over the current selected model", () => {
    const session = createPointSession();
    const coordinator = createAppNavigation(session, { navigate: vi.fn() });
    coordinator.prepareUrl(routeUrl("/standard/ashrae-55/"));

    expect(coordinator.prepareUrl(routeUrl("/standard/ashrae-55/adaptive-ashrae/"))).toBe(true);
    expect(session.setting.selectedModel).toBe(ModelId.AdaptiveAshrae);
    expect(coordinator.getCanonicalPathname(routeUrl("/Standard/ASHRAE-55/Adaptive-Ashrae/")))
      .toBe("/standard/ashrae-55/adaptive-ashrae/");
  });

  it("navigates to the canonical model path when selecting a model", () => {
    const session = createPointSession();
    const navigate = vi.fn();
    const coordinator = createAppNavigation(session, { navigate });
    const explore = requireCalculationRoute("/explore/");
    coordinator.prepareUrl(routeUrl(explore.path));
    navigate.mockClear();

    coordinator.selectModel(explore, ModelId.Utci);
    expect(session.setting.selectedModel).toBe(ModelId.Utci);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0][0].url.pathname).toBe("/explore/utci/");
    expect(navigate.mock.calls[0][0].url.searchParams.has("state")).toBe(false);
  });

  it("navigates to the canonical time-series model path", () => {
    const session = createPointSession();
    const timeSeries = createTimeSeriesSession();
    const navigate = vi.fn();
    const coordinator = createAppNavigation(session, { navigate }, timeSeries);
    const definition = getAppRouteByPath("/time-series/")!;
    coordinator.prepareUrl(routeUrl(definition.path));
    navigate.mockClear();

    coordinator.selectModel(definition, ModelId.Phs2023);
    expect(timeSeries.setting.selectedModel).toBe(ModelId.Phs2023);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0][0].url.pathname).toBe("/time-series/phs-2023/");
    timeSeries.actions.dispose();
  });

  it("keeps model, workspace, and navigation atomic across warning cancel and confirm", () => {
    const session = createPointSession();
    const navigate = vi.fn();
    const coordinator = createAppNavigation(session, { navigate });
    const explore = requireCalculationRoute("/explore/");

    coordinator.prepareUrl(routeUrl(explore.path));
    coordinator.selectModel(explore, ModelId.WindChill);
    expect(session.pendingModelSwitch?.targetModel)
      .toBe(ModelId.WindChill);
    expect(coordinator.prepareUrl(routeUrl("/time-series/"))).toBe(false);

    coordinator.cancelPendingTransition();
    expect(session.setting.selectedModel).toBe(ModelId.PmvAshrae);
    expect(session.setting.activeSurface).toBe(SurfaceId.Explore);
    expect(navigate).not.toHaveBeenCalled();

    coordinator.selectModel(explore, ModelId.WindChill);
    coordinator.confirmPendingTransition();
    expect(session.setting.selectedModel).toBe(ModelId.WindChill);
    expect(session.setting.activeSurface).toBe(SurfaceId.Explore);
    expect(navigate.mock.calls[0][0].url.pathname).toBe("/explore/wind-chill/");
    navigate.mockClear();

    const ashraeUrl = routeUrl("/standard/ashrae-55/");
    expect(coordinator.prepareUrl(ashraeUrl)).toBe(false);
    expect(session.setting.selectedModel).toBe(ModelId.WindChill);
    expect(session.setting.activeSurface).toBe(SurfaceId.Explore);

    coordinator.cancelPendingTransition();
    expect(session.setting.selectedModel).toBe(ModelId.WindChill);
    expect(navigate).not.toHaveBeenCalled();

    expect(coordinator.prepareUrl(ashraeUrl)).toBe(false);
    coordinator.confirmPendingTransition();
    expect(session.setting.selectedModel).toBe(ModelId.PmvAshrae);
    expect(session.setting.activeSurface).toBe(SurfaceId.Standard);
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({
      url: ashraeUrl,
    }));
  });

  it("lets pathname constraints win over a valid v1 share snapshot", () => {
    const source = createPointSession();
    source.actions.setSelectedModel(ModelId.Utci, {
      validateRanges: false,
      schedule: false,
    });
    const ashraeSettings = source.setting.outputSettingsByModel[ModelId.PmvAshrae];
    ashraeSettings.exploreBands = ashraeSettings.exploreBands?.map((band, index) => (
      index === 0 ? { ...band, max: -3.25 } : { ...band }
    )) ?? null;
    const snapshot = source.actions.exportShareSnapshot();
    const sharedUrl = new URL(buildShareUrl(
      snapshot,
      "http://localhost:5174/standard/ashrae-55/",
    ));

    const target = createPointSession();
    const coordinator = createAppNavigation(target, { navigate: vi.fn() });
    expect(coordinator.prepareUrl(sharedUrl, { validateRanges: false })).toBe(true);

    expect(target.setting.selectedModel).toBe(ModelId.PmvAshrae);
    expect(target.setting.activeSurface).toBe(SurfaceId.Standard);
    expect(target.setting.outputSettingsByModel[ModelId.PmvAshrae].exploreBands?.[0].max)
      .toBe(-3.25);
    expect(target.actions.exportShareSnapshot().version).toBe(1);

    seedPrimaryQuantity(
      target,
      InputId.Input1,
      PhysicalQuantityId.DryBulbTemperature,
      19,
    );
    coordinator.prepareUrl(routeUrl("/standard/ashrae-55/?state=invalid"));
    coordinator.prepareUrl(sharedUrl, { validateRanges: false });
    expect(target.input.quantitiesByInput[InputId.Input1][PhysicalQuantityId.DryBulbTemperature])
      .toBe(snapshot.quantitiesByInput[InputId.Input1][PhysicalQuantityId.DryBulbTemperature]);
  });

  it("lets a path model slug win over a share snapshot selectedModel", () => {
    const source = createPointSession();
    source.actions.setSelectedModel(ModelId.Utci, {
      validateRanges: false,
      schedule: false,
    });
    const snapshot = source.actions.exportShareSnapshot();
    const sharedUrl = new URL(buildShareUrl(
      snapshot,
      "http://localhost:5174/explore/heat-index/",
    ));

    const target = createPointSession();
    const coordinator = createAppNavigation(target, { navigate: vi.fn() });
    expect(coordinator.prepareUrl(sharedUrl, { validateRanges: false })).toBe(true);
    expect(target.setting.selectedModel).toBe(ModelId.HeatIndex);
    expect(target.setting.activeSurface).toBe(SurfaceId.Explore);
  });

  it("keeps SI input and model presentation state across the Time-series placeholder", () => {
    const session = createPointSession();
    const coordinator = createAppNavigation(session, { navigate: vi.fn() });
    seedPrimaryQuantity(
      session,
      InputId.Input1,
      PhysicalQuantityId.DryBulbTemperature,
      21.5,
    );
    session.actions.setDynamicXAxis(PhysicalQuantityId.MeanRadiantTemperature);
    const cacheBefore = session.calculationCacheByModel[ModelId.PmvAshrae];

    const timeSeries = appRouteDefinitions.find(
      ({ path }) => path === "/time-series/",
    )!;
    expect(coordinator.prepareUrl(routeUrl(timeSeries.path))).toBe(true);
    coordinator.afterNavigation(routeUrl(timeSeries.path));
    expect(coordinator.prepareUrl(routeUrl("/standard/ashrae-55/"))).toBe(true);

    expect(session.input.quantitiesByInput[InputId.Input1][PhysicalQuantityId.DryBulbTemperature])
      .toBe(21.5);
    expect(session.setting.outputSettingsByModel[ModelId.PmvAshrae].xAxis)
      .toBe(PhysicalQuantityId.MeanRadiantTemperature);
    expect(session.calculationCacheByModel[ModelId.PmvAshrae])
      .toBe(cacheBefore);
  });

  it("restores SI input from exportShareUrl through prepareUrl and strips state on model change", () => {
    const source = createPointSession();
    seedPrimaryQuantity(
      source,
      InputId.Input1,
      PhysicalQuantityId.DryBulbTemperature,
      19,
    );
    const shareUrl = source.actions.exportShareUrl(
      "http://localhost:5174/explore/heat-index/",
    );
    const shared = new URL(shareUrl);
    expect(shared.pathname).toBe("/explore/heat-index/");
    expect(shared.searchParams.has("state")).toBe(true);

    const target = createPointSession();
    const navigate = vi.fn();
    const coordinator = createAppNavigation(target, { navigate });
    expect(coordinator.prepareUrl(shared, { validateRanges: false })).toBe(true);
    expect(
      target.input.quantitiesByInput[InputId.Input1][PhysicalQuantityId.DryBulbTemperature],
    ).toBe(19);
    expect(target.setting.selectedModel).toBe(ModelId.HeatIndex);
    expect(shared.searchParams.has("state")).toBe(true);

    const explore = requireCalculationRoute("/explore/");
    coordinator.selectModel(explore, ModelId.Utci);
    expect(target.setting.selectedModel).toBe(ModelId.Utci);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0][0].url.searchParams.has("state")).toBe(false);
  });
});
