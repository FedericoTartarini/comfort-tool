import { describe, expect, it } from "vitest";
import { ComfortModel } from "../../models/comfortModels";
import { ChartMode } from "../../models/modelCapabilities";
import { WorkspaceId } from "../../models/workspaces";
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
      expect(getComfortModelConfig(definition.defaultModelId).modes)
        .toContain(definition.requiredMode);
      for (const modelId of allowedModels) {
        expect(getComfortModelConfig(modelId).modes)
          .toContain(definition.requiredMode);
      }
    }
  });

  it("matches the approved route behavior matrix", () => {
    const matrix = Object.fromEntries(appRouteDefinitions.map((definition) => [
      definition.path,
      {
        models: getAllowedModels(definition),
        mode: isCalculationRoute(definition) ? definition.requiredMode : undefined,
        defaultModel: isCalculationRoute(definition)
          ? definition.defaultModelId
          : undefined,
      },
    ]));

    expect(matrix["/ASHRAE-55/"]).toEqual({
      models: [ComfortModel.PmvAshrae, ComfortModel.AdaptiveAshrae],
      mode: ChartMode.Compliance,
      defaultModel: ComfortModel.PmvAshrae,
    });
    expect(matrix["/ISO-7730/"]).toEqual({
      models: [ComfortModel.PmvIso],
      mode: ChartMode.Compliance,
      defaultModel: ComfortModel.PmvIso,
    });
    expect(matrix["/EN-16798-1/"]).toEqual({
      models: [ComfortModel.AdaptiveEn],
      mode: ChartMode.Compliance,
      defaultModel: ComfortModel.AdaptiveEn,
    });
    expect(matrix["/Explore/"]).toEqual({
      models: [
        ComfortModel.PmvAshrae,
        ComfortModel.PmvIso,
        ComfortModel.Utci,
        ComfortModel.HeatIndex,
        ComfortModel.Humidex,
        ComfortModel.WindChill,
      ],
      mode: ChartMode.Explore,
      defaultModel: ComfortModel.PmvAshrae,
    });
  });
});
