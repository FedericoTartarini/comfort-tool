import { describe, expect, it } from "vitest";

import { comfortModelConfigs, comfortModelOrder } from "../state/modelRegistry";
import { modelSupportsExplore, modelSupportsStandard } from "../state/modelRegistry/definition";
import { InputId } from "../catalog/inputSlots";
import { extrasByInputFromChartSource } from "../catalog/chartSource";
import { UnitSystem } from "../catalog/units";
import {
  createGoldenCalculationContext,
  getGoldenInputOverrides,
  getGoldenModelInputOverrides,
} from "./goldenFixtures";

describe("output registry coverage", () => {
  for (const modelId of comfortModelOrder) {
    const config = comfortModelConfigs[modelId];

    it(`${modelId} declares workspace membership, charts, and table builder`, () => {
      expect(modelSupportsStandard(config) || modelSupportsExplore(config) || config.timeSeries).toBeTruthy();
      expect(config.chartInstances.entries.length).toBeGreaterThan(0);
      expect(config.chartInstances.entries.map(({ instanceId }) => instanceId)).toEqual(
        [...new Set(config.chartInstances.entries.map(({ instanceId }) => instanceId))],
      );
      if (modelSupportsExplore(config)) {
        expect(config.exploreOutputs.length).toBeGreaterThan(0);
      }
    });

    it(`${modelId} produces non-empty result sections from calculation`, () => {
      const context = createGoldenCalculationContext(
        modelId,
        getGoldenInputOverrides(modelId),
        getGoldenModelInputOverrides(modelId),
      );
      const { valuesByInput, chartSource } = config.calculate(context, [InputId.Input1]);
      const sections = config.buildTable(
        valuesByInput,
        [InputId.Input1],
        UnitSystem.SI,
        { extrasByInput: extrasByInputFromChartSource(chartSource) },
      );
      expect(sections.length).toBeGreaterThan(0);
      expect(sections[0]?.valuesByInput[InputId.Input1]?.text.length).toBeGreaterThan(0);
    });

    it(`${modelId} compliance models declare standard IDs`, () => {
      if (modelSupportsStandard(config)) {
        expect(config.standardIds.length).toBeGreaterThan(0);
        expect(config.complianceProfile).toBeDefined();
      }
    });

    it(`${modelId} explore models declare explore outputs`, () => {
      if (modelSupportsExplore(config)) {
        expect(config.exploreOutputs.length).toBeGreaterThan(0);
      }
    });
  }
});
