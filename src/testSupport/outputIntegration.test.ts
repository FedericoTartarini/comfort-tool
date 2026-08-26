import { describe, expect, it, vi, beforeEach } from "vitest";

import { ModelId } from "../catalog/modelIds";
import { InputId } from "../catalog/inputSlots";
import { ModelOutputKey, type NumericBand } from "../catalog/modelCapabilities";
import { FieldChartProfileKind } from "../catalog/output/fieldChartProfile";
import {
  WorkspaceId,
  supportsExploreWorkspace,
  supportsStandardWorkspace,
} from "../catalog/workspaces";
import { UnitSystem } from "../catalog/units";
import {
  buildFieldChartProfile,
  seedModelOutputSettings,
} from "../state/analysis/fieldChartState";
import {
  comfortModelConfigs,
  comfortModelOrder,
  getComfortModelConfig,
} from "../state/analysis/modelConfigs";
import {
  buildAllModelOutputGoldenSnapshots,
  buildModelOutputGoldenSnapshot,
} from "./outputGoldenFixtures";
import {
  createGoldenCalculationContext,
  getGoldenInputOverrides,
} from "./goldenFixtures";
import { clearChartMemo } from "../services/comfort/charts/kinds/memo";
import { resolveChartInstanceCapabilities } from "../state/analysis/chartInstancePresentation";

describe("output integration", () => {
  beforeEach(() => {
    clearChartMemo();
  });

  const snapshots = buildAllModelOutputGoldenSnapshots();

  it("builds output snapshots for every registered model", () => {
    expect(snapshots).toHaveLength(comfortModelOrder.length);
    expect(snapshots.map(({ modelId }) => modelId)).toEqual(comfortModelOrder);
  });

  for (const modelId of comfortModelOrder) {
    it(`${modelId} builds non-empty tables and charts for supported workspaces`, () => {
      const snapshot = buildModelOutputGoldenSnapshot(modelId);
      expect(snapshot.table.sections.length).toBeGreaterThan(0);
      expect(snapshot.charts.length).toBeGreaterThan(0);
      for (const chart of snapshot.charts) {
        expect(chart.traceCount).toBeGreaterThan(0);
        expect(chart.layoutTitle.length).toBeGreaterThan(0);
      }
    });
  }

  it("builds Standard and Explore charts from the unified registry", () => {
    for (const modelId of comfortModelOrder) {
      const config = getComfortModelConfig(modelId);
      const context = createGoldenCalculationContext(modelId, {}, {});
      const { resultsByInput, chartSource } = config.calculate(context, [InputId.Input1]);
      const settings = seedModelOutputSettings(config);

      if (supportsStandardWorkspace(config.workspaceCapabilities)) {
        const chartInstance = config.chartInstances.entries.find(
          ({ instanceId }) => instanceId === config.chartInstances.defaultInstanceId,
        )!;
        const profile = buildFieldChartProfile(config, settings, WorkspaceId.Standard);
        const buildResult = config.buildChart(
          config.chartInstances.defaultInstanceId,
          chartSource,
          resultsByInput,
          profile,
          {
            unitSystem: UnitSystem.SI,
            baselineInputId: InputId.Input1,
            chartSourceVersion: 1,
            modelInputs: context.modelInputs,
          },
        );
        expect(buildResult.readiness).toBe("ready");
        expect(buildResult.plotly).not.toBeNull();
        if (resolveChartInstanceCapabilities(chartInstance).showsLegend) {
          expect((buildResult.legend?.title?.length ?? 0)).toBeGreaterThan(0);
        } else {
          expect(buildResult.legend).toBeNull();
        }
        expect(profile.kind).toBe(FieldChartProfileKind.Compliance);
      }

      if (supportsExploreWorkspace(config.workspaceCapabilities)) {
        const chartInstance = config.chartInstances.entries.find(
          ({ instanceId }) => instanceId === config.chartInstances.defaultInstanceId,
        )!;
        const profile = buildFieldChartProfile(config, settings, WorkspaceId.Explore);
        const buildResult = config.buildChart(
          config.chartInstances.defaultInstanceId,
          chartSource,
          resultsByInput,
          profile,
          {
            unitSystem: UnitSystem.SI,
            baselineInputId: InputId.Input1,
            chartSourceVersion: 1,
            modelInputs: context.modelInputs,
          },
        );
        expect(buildResult.readiness).toBe("ready");
        if (resolveChartInstanceCapabilities(chartInstance).showsLegend) {
          expect(buildResult.legend?.items.length).toBeGreaterThan(0);
        } else {
          expect(buildResult.legend).toBeNull();
        }
        expect(profile.kind).toBe(FieldChartProfileKind.Explore);
      }
    }
  });

  it("rebuilds Explore charts after band edits without recalculating", () => {
    const config = comfortModelConfigs[ModelId.PmvAshrae];
    const calculateSpy = vi.spyOn(config, "calculate");
    const context = createGoldenCalculationContext(
      ModelId.PmvAshrae,
      getGoldenInputOverrides(ModelId.PmvAshrae),
      {},
    );
    const { resultsByInput, chartSource } = config.calculate(context, [InputId.Input1]);
    expect(calculateSpy).toHaveBeenCalledTimes(1);

    const settings = seedModelOutputSettings(config);
    const baseProfile = buildFieldChartProfile(config, settings, WorkspaceId.Explore);
    const first = config.buildChart(
      config.chartInstances.defaultInstanceId,
      chartSource,
      resultsByInput,
      baseProfile,
      {
        unitSystem: UnitSystem.SI,
        baselineInputId: InputId.Input1,
        chartSourceVersion: 1,
        modelInputs: context.modelInputs,
      },
    );

    const editedBands = baseProfile.bands.map((band, index) => (
      index === 0 ? { ...band, label: "Edited cold stress" } : band
    ));
    const editedProfile = {
      ...baseProfile,
      bands: editedBands as readonly NumericBand[],
      zOutput: ModelOutputKey.Pmv,
    };
    const second = config.buildChart(
      config.chartInstances.defaultInstanceId,
      chartSource,
      resultsByInput,
      editedProfile,
      {
        unitSystem: UnitSystem.SI,
        baselineInputId: InputId.Input1,
        chartSourceVersion: 1,
        modelInputs: context.modelInputs,
      },
    );

    expect(calculateSpy).toHaveBeenCalledTimes(1);
    expect(first.readiness).toBe("ready");
    expect(second.readiness).toBe("ready");
    expect(second.legend?.items.some(({ label }) => label === "Edited cold stress")).toBe(true);
    calculateSpy.mockRestore();
  });
});
