import { describe, expect, it } from "vitest";

import { comfortModelConfigs, comfortModelOrder } from "../state/comfortTool/modelConfigs";
import { InputId } from "../models/inputSlots";
import { UnitSystem } from "../models/units";
import {
  supportsExploreWorkspace,
  supportsStandardWorkspace,
} from "../models/output/workspaceCapabilities";
import {
  adaptiveBaselineInputOverrides,
  createGoldenCalculationContext,
  phsBaselineInputOverrides,
  phsBaselineModelInputs,
  pmvBaselineInputOverrides,
  utciBaselineInputOverrides,
} from "./goldenFixtures";
import { ComfortModel } from "../models/comfortModels";
import { PhysicalQuantityId } from "../models/physicalQuantities";

function getGoldenInputOverrides(modelId: typeof comfortModelOrder[number]) {
  switch (modelId) {
    case ComfortModel.PmvAshrae:
    case ComfortModel.PmvIso:
      return pmvBaselineInputOverrides;
    case ComfortModel.Utci:
      return utciBaselineInputOverrides;
    case ComfortModel.AdaptiveAshrae:
    case ComfortModel.AdaptiveEn:
      return adaptiveBaselineInputOverrides;
    case ComfortModel.Phs2023:
      return phsBaselineInputOverrides;
    case ComfortModel.HeatIndex:
      return {
        [PhysicalQuantityId.DryBulbTemperature]: 32,
        [PhysicalQuantityId.RelativeHumidity]: 60,
      };
    case ComfortModel.Humidex:
      return {
        [PhysicalQuantityId.DryBulbTemperature]: 30,
        [PhysicalQuantityId.RelativeHumidity]: 70,
      };
    case ComfortModel.WindChill:
      return {
        [PhysicalQuantityId.DryBulbTemperature]: -10,
        [PhysicalQuantityId.WindSpeed]: 5,
      };
    default:
      return {};
  }
}

function getGoldenModelInputOverrides(modelId: typeof comfortModelOrder[number]) {
  return modelId === ComfortModel.Phs2023 ? phsBaselineModelInputs : {};
}

describe("output registry coverage", () => {
  for (const modelId of comfortModelOrder) {
    const config = comfortModelConfigs[modelId];

    it(`${modelId} declares workspace capabilities, charts, and table builder`, () => {
      expect(config.workspaceCapabilities.length).toBeGreaterThan(0);
      expect(config.outputCharts.entries.length).toBeGreaterThan(0);
      expect(config.outputCharts.entries.map(({ instanceId }) => instanceId)).toEqual(
        [...new Set(config.outputCharts.entries.map(({ instanceId }) => instanceId))],
      );
      if (supportsExploreWorkspace(config.workspaceCapabilities)) {
        expect(config.exploreOutputs.length).toBeGreaterThan(0);
      }
    });

    it(`${modelId} produces non-empty result sections from calculation`, () => {
      const context = createGoldenCalculationContext(
        modelId,
        getGoldenInputOverrides(modelId),
        getGoldenModelInputOverrides(modelId),
      );
      const { resultsByInput } = config.calculate(context, [InputId.Input1]);
      const sections = config.buildTable(
        resultsByInput,
        [InputId.Input1],
        UnitSystem.SI,
      );
      expect(sections.length).toBeGreaterThan(0);
      expect(sections[0]?.valuesByInput[InputId.Input1]?.text.length).toBeGreaterThan(0);
    });

    it(`${modelId} compliance models declare standard IDs`, () => {
      if (supportsStandardWorkspace(config.workspaceCapabilities)) {
        expect(config.standardIds.length).toBeGreaterThan(0);
        expect(config.complianceProfile).toBeDefined();
      }
    });

    it(`${modelId} explore models declare explore outputs`, () => {
      if (supportsExploreWorkspace(config.workspaceCapabilities)) {
        expect(config.exploreOutputs.length).toBeGreaterThan(0);
      }
    });
  }
});
