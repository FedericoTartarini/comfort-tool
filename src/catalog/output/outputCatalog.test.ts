import { describe, expect, it } from "vitest";

import {
  ChartType,
  chartTypeCapabilities,
  chartTypeLabel,
  isChartType,
  isModelChartType,
  modelAllowsPsychrometricCharts,
  resolveChartCapabilities,
} from "../chartTypes";
import { ModelId } from "../modelIds";
import {
  WorkspaceId,
  supportsExploreWorkspace,
  supportsStandardWorkspace,
} from "../workspaces";
import { FieldChartProfileKind } from "./fieldChartProfile";
import { TableType } from "../tableTypes";

describe("output catalog", () => {
  it("defines eight chart types with title-case dropdown labels", () => {
    expect(Object.keys(chartTypeCapabilities)).toHaveLength(8);
    expect(chartTypeLabel[ChartType.HeatLoss]).toBe("Heat Loss");
    expect(chartTypeLabel[ChartType.BodyTemperature]).toBe("Body Temperature");
    expect(chartTypeLabel[ChartType.Set]).toBe("SET");
    expect(chartTypeLabel[ChartType.Psychrometric]).toBe("Psychrometric");
    expect(isChartType(ChartType.Dynamic)).toBe(true);
    expect(isChartType("invented-type")).toBe(false);
    expect(isModelChartType(ChartType.Dynamic)).toBe(true);
    expect(isModelChartType(ChartType.Psychrometric)).toBe(false);
    expect(isModelChartType(ChartType.HeatLoss)).toBe(false);
  });

  it("allows Psychrometric by PMV model id rather than instance id", () => {
    expect(modelAllowsPsychrometricCharts(ModelId.PmvAshrae)).toBe(true);
    expect(modelAllowsPsychrometricCharts(ModelId.PmvIso)).toBe(true);
    expect(modelAllowsPsychrometricCharts(ModelId.HeatIndex)).toBe(false);
    expect(modelAllowsPsychrometricCharts(ModelId.Phs2023)).toBe(false);
  });

  it("merges capability overrides", () => {
    const capabilities = resolveChartCapabilities(ChartType.Dynamic, {
      locksYAxis: true,
    });
    expect(capabilities.locksYAxis).toBe(true);
    expect(capabilities.allowsAxisSelection).toBe(true);
  });

  it("workspace capability helpers match workspace ids", () => {
    const capabilities = [
      WorkspaceId.Standard,
      WorkspaceId.Explore,
    ] as const;
    expect(supportsStandardWorkspace(capabilities)).toBe(true);
    expect(supportsExploreWorkspace(capabilities)).toBe(true);
  });

  it("exports table types and profile kinds", () => {
    expect(TableType.Analysis).toBe("analysis");
    expect(TableType.TimeSeries).toBe("time-series");
    expect(FieldChartProfileKind.Compliance).toBe("compliance");
  });
});
