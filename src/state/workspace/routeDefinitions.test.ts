import { describe, expect, it } from "vitest";
import { ComfortModel } from "../../models/comfortModels";
import { WorkspaceId } from "../../models/workspaces";
import {
  WorkspaceCapability,
} from "../../models/output/workspaceCapabilities";
import {
  appRouteDefinitions,
  getAllowedModels,
  getAppRouteByPath,
  isCalculationRoute,
} from "./routeDefinitions";
import { getComfortModelConfig } from "../comfortTool/modelConfigs";

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
        ? WorkspaceCapability.Explore
        : WorkspaceCapability.Standard;
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
      models: [ComfortModel.PmvAshrae, ComfortModel.AdaptiveAshrae],
      workspace: WorkspaceId.Standard,
      defaultModel: ComfortModel.PmvAshrae,
    });
    expect(matrix["/ISO-7730/"]).toEqual({
      models: [ComfortModel.PmvIso],
      workspace: WorkspaceId.Standard,
      defaultModel: ComfortModel.PmvIso,
    });
    expect(matrix["/EN-16798-1/"]).toEqual({
      models: [ComfortModel.AdaptiveEn],
      workspace: WorkspaceId.Standard,
      defaultModel: ComfortModel.AdaptiveEn,
    });
    expect(matrix["/ISO-7933/"]).toEqual({
      models: [ComfortModel.Phs2023],
      workspace: WorkspaceId.Standard,
      defaultModel: ComfortModel.Phs2023,
    });
    expect(matrix["/Explore/"]).toEqual({
      models: [
        ComfortModel.PmvAshrae,
        ComfortModel.PmvIso,
        ComfortModel.Utci,
        ComfortModel.HeatIndex,
        ComfortModel.Humidex,
        ComfortModel.WindChill,
        ComfortModel.Phs2023,
      ],
      workspace: WorkspaceId.Explore,
      defaultModel: ComfortModel.PmvAshrae,
    });
  });
});
