import { describe, expect, it } from "vitest";
import { ModelId } from "../../catalog/modelIds";
import { WorkspaceId } from "../../catalog/workspaces";
import {
  appRouteDefinitions,
  getAllowedModels,
  getAppRouteByPath,
  isCalculationRoute,
} from "./routeDefinitions";
import { getComfortModelConfig } from "../analysis/modelConfigs";

describe("workspace route definitions", () => {
  it("declares stable canonical paths and resolves missing slashes", () => {
    expect(appRouteDefinitions.map(({ path }) => path)).toEqual([
      "/ASHRAE-55/",
      "/ISO-7730/",
      "/EN-16798-1/",
      "/ISO-7933/",
      "/Explore/",
      "/Time-Series/",
    ]);
    expect(getAppRouteByPath("/ASHRAE-55")?.path).toBe("/ASHRAE-55/");
    expect(getAppRouteByPath("/explore/")?.path).toBe("/Explore/");
    expect(getAppRouteByPath("/unknown")).toBeUndefined();
  });

  it("keeps every calculation route default inside its derived model set", () => {
    for (const definition of appRouteDefinitions) {
      if (!isCalculationRoute(definition)) {
        expect(definition.workspace).toBe(WorkspaceId.TimeSeries);
        expect(getAllowedModels(definition)).toEqual([]);
        continue;
      }

      const allowedModels = getAllowedModels(definition);
      expect(allowedModels).toContain(definition.defaultModelId);
      const routeWorkspace = definition.workspace as typeof WorkspaceId.Standard | typeof WorkspaceId.Explore;
      const expectedCapability = routeWorkspace === WorkspaceId.Explore
        ? WorkspaceId.Explore
        : WorkspaceId.Standard;
      expect(getComfortModelConfig(definition.defaultModelId).workspaceCapabilities)
        .toContain(expectedCapability);
      for (const modelId of allowedModels) {
        expect(getComfortModelConfig(modelId).workspaceCapabilities)
          .toContain(expectedCapability);
      }
    }
  });

  it("matches the approved route behavior matrix", () => {
    const matrix = Object.fromEntries(appRouteDefinitions.map((definition) => [
      definition.path,
      {
        models: getAllowedModels(definition),
        workspace: isCalculationRoute(definition) ? definition.workspace : undefined,
        defaultModel: isCalculationRoute(definition)
          ? definition.defaultModelId
          : undefined,
      },
    ]));

    expect(matrix["/ASHRAE-55/"]).toEqual({
      models: [ModelId.PmvAshrae, ModelId.AdaptiveAshrae],
      workspace: WorkspaceId.Standard,
      defaultModel: ModelId.PmvAshrae,
    });
    expect(matrix["/ISO-7730/"]).toEqual({
      models: [ModelId.PmvIso],
      workspace: WorkspaceId.Standard,
      defaultModel: ModelId.PmvIso,
    });
    expect(matrix["/EN-16798-1/"]).toEqual({
      models: [ModelId.AdaptiveEn],
      workspace: WorkspaceId.Standard,
      defaultModel: ModelId.AdaptiveEn,
    });
    expect(matrix["/ISO-7933/"]).toEqual({
      models: [ModelId.Phs2023],
      workspace: WorkspaceId.Standard,
      defaultModel: ModelId.Phs2023,
    });
    expect(matrix["/Explore/"]).toEqual({
      models: [
        ModelId.PmvAshrae,
        ModelId.PmvIso,
        ModelId.Utci,
        ModelId.HeatIndex,
        ModelId.Humidex,
        ModelId.WindChill,
        ModelId.Phs2023,
      ],
      workspace: WorkspaceId.Explore,
      defaultModel: ModelId.PmvAshrae,
    });
  });
});
