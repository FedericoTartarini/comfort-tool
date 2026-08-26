import { describe, expect, it } from "vitest";

import { comfortModelConfigs, comfortModelOrder } from "../state/analysis/modelConfigs";
import { InputId } from "../catalog/inputSlots";
import { UnitSystem } from "../catalog/units";
import {
  supportsExploreWorkspace,
  supportsStandardWorkspace,
} from "../catalog/workspaces";
import {
  createGoldenCalculationContext,
  getGoldenInputOverrides,
  getGoldenModelInputOverrides,
} from "./goldenFixtures";

describe("output registry coverage", () => {
  for (const modelId of comfortModelOrder) {
    const config = comfortModelConfigs[modelId];

    it(`${modelId} declares workspace capabilities, charts, and table builder`, () => {
      expect(config.workspaceCapabilities.length).toBeGreaterThan(0);
      expect(config.chartInstances.entries.length).toBeGreaterThan(0);
      expect(config.chartInstances.entries.map(({ instanceId }) => instanceId)).toEqual(
        [...new Set(config.chartInstances.entries.map(({ instanceId }) => instanceId))],
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
