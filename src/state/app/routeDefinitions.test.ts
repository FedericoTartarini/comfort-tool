import { describe, expect, it } from "vitest";
import { ModelId } from "../../catalog/modelIds";
import { StandardId, SurfaceId } from "../../catalog/surfaces";
import {
  appRouteDefinitions,
  buildCalculationPath,
  buildCanonicalPathname,
  getAllowedModels,
  getAppRouteByPath,
  isMalformedAppPath,
  parseAppLocation,
  type AppRouteDefinition,
} from "./routeDefinitions";
import { getComfortModelConfig, modelSupportsExplore, modelSupportsStandard } from "../modelRegistry";

describe("workspace route definitions", () => {
  it("declares /standard/{standard}/ roots from StandardId and resolves mixed-case aliases", () => {
    expect(appRouteDefinitions.filter((definition: AppRouteDefinition) => (
      definition.standardId
    )).map((definition: AppRouteDefinition) => [
      definition.standardId,
      definition.path,
    ])).toEqual([
      [StandardId.Ashrae55, "/standard/ashrae-55/"],
      [StandardId.Iso7730, "/standard/iso-7730/"],
      [StandardId.En16798, "/standard/en-16798-1/"],
      [StandardId.Iso7933, "/standard/iso-7933/"],
    ]);
    expect(getAppRouteByPath("/STANDARD/ASHRAE-55")?.standardId).toBe(StandardId.Ashrae55);
    expect(getAppRouteByPath("/explore/")?.path).toBe("/explore/");
    expect(getAppRouteByPath("/standard/ashrae-55/pmv-ashrae/")?.standardId)
      .toBe(StandardId.Ashrae55);
    expect(getAppRouteByPath("/ashrae-55/pmv-ashrae/")).toBeUndefined();
    expect(getAppRouteByPath("/unknown")).toBeUndefined();
  });

  it("parses allowed model slugs and rejects invalid remainder", () => {
    expect(parseAppLocation("/Standard/ASHRAE-55/Adaptive-Ashrae")?.modelId)
      .toBe(ModelId.AdaptiveAshrae);
    expect(parseAppLocation("/explore/utci/")?.modelId).toBe(ModelId.Utci);
    expect(parseAppLocation("/time-series/phs-2023/")?.modelId).toBe(ModelId.Phs2023);
    expect(parseAppLocation("/standard/ashrae-55/utci/")).toBeUndefined();
    expect(isMalformedAppPath("/standard/ashrae-55/utci/")).toBe(true);
    expect(parseAppLocation("/standard/ashrae-55/pmv-ashrae/extra/")).toBeUndefined();
    expect(isMalformedAppPath("/standard/ashrae-55/pmv-ashrae/extra/")).toBe(true);
    expect(parseAppLocation("/time-series/pmv-ashrae/")).toBeUndefined();
    expect(isMalformedAppPath("/time-series/pmv-ashrae/")).toBe(true);
    expect(isMalformedAppPath("/unknown")).toBe(false);
  });

  it("builds /standard/{standard}/{model}/, /explore/{model}/, and /time-series/{model}/", () => {
    const ashrae = getAppRouteByPath("/standard/ashrae-55/")!;
    expect(buildCalculationPath(ashrae, ModelId.PmvAshrae))
      .toBe(`/standard/${StandardId.Ashrae55}/${ModelId.PmvAshrae}/`);
    expect(buildCanonicalPathname("/STANDARD/ASHRAE-55/", ModelId.AdaptiveAshrae))
      .toBe(`/standard/${StandardId.Ashrae55}/${ModelId.AdaptiveAshrae}/`);
    expect(buildCanonicalPathname("/standard/ashrae-55/pmv-ashrae/", ModelId.AdaptiveAshrae))
      .toBe(`/standard/${StandardId.Ashrae55}/${ModelId.PmvAshrae}/`);
    expect(buildCanonicalPathname("/explore/", ModelId.Utci))
      .toBe("/explore/utci/");
    expect(buildCanonicalPathname("/time-series/", ModelId.Phs2023))
      .toBe("/time-series/phs-2023/");
    expect(buildCanonicalPathname("/time-series/", ModelId.PmvAshrae))
      .toBe("/time-series/phs-2023/");
    expect(buildCanonicalPathname("/unknown", ModelId.PmvAshrae)).toBeUndefined();
  });

  it("keeps every calculation route default inside its derived model set", () => {
    for (const definition of appRouteDefinitions) {
      if (definition.surface === SurfaceId.TimeSeries) {
        expect(getAllowedModels(definition)).toEqual([ModelId.Phs2023]);
        expect(definition.defaultModelId).toBe(ModelId.Phs2023);
        continue;
      }

      const allowedModels = getAllowedModels(definition);
      expect(definition.defaultModelId).toBeDefined();
      expect(allowedModels).toContain(definition.defaultModelId);
      if (definition.surface === SurfaceId.Explore) {
        expect(modelSupportsExplore(getComfortModelConfig(definition.defaultModelId))).toBe(true);
        for (const modelId of allowedModels) {
          expect(modelSupportsExplore(getComfortModelConfig(modelId))).toBe(true);
        }
        continue;
      }
      expect(modelSupportsStandard(getComfortModelConfig(definition.defaultModelId))).toBe(true);
      for (const modelId of allowedModels) {
        expect(modelSupportsStandard(getComfortModelConfig(modelId))).toBe(true);
      }
    }
  });

  it("matches the approved route behavior matrix", () => {
    const matrix = Object.fromEntries(appRouteDefinitions.map((definition) => [
      definition.path,
      {
        models: getAllowedModels(definition),
        surface: definition.surface,
        defaultModel: definition.defaultModelId,
      },
    ]));

    expect(matrix["/standard/ashrae-55/"]).toEqual({
      models: [ModelId.PmvAshrae, ModelId.AdaptiveAshrae],
      surface: SurfaceId.Standard,
      defaultModel: ModelId.PmvAshrae,
    });
    expect(matrix["/standard/iso-7730/"]).toEqual({
      models: [ModelId.PmvIso],
      surface: SurfaceId.Standard,
      defaultModel: ModelId.PmvIso,
    });
    expect(matrix["/standard/en-16798-1/"]).toEqual({
      models: [ModelId.AdaptiveEn],
      surface: SurfaceId.Standard,
      defaultModel: ModelId.AdaptiveEn,
    });
    expect(matrix["/standard/iso-7933/"]).toEqual({
      models: [ModelId.Phs2023],
      surface: SurfaceId.Standard,
      defaultModel: ModelId.Phs2023,
    });
    expect(matrix["/explore/"]).toEqual({
      models: [
        ModelId.PmvAshrae,
        ModelId.PmvIso,
        ModelId.Utci,
        ModelId.HeatIndex,
        ModelId.Humidex,
        ModelId.WindChill,
        ModelId.Phs2023,
      ],
      surface: SurfaceId.Explore,
      defaultModel: ModelId.PmvAshrae,
    });
    expect(matrix["/time-series/"]).toEqual({
      models: [ModelId.Phs2023],
      surface: SurfaceId.TimeSeries,
      defaultModel: ModelId.Phs2023,
    });
  });
});
