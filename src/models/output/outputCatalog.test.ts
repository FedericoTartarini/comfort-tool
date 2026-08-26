import { describe, expect, it } from "vitest";

import {
  ChartEngine,
  chartEngineMetaById,
  isChartEngine,
  isModelChartEngine,
  modelAllowsCustomCharts,
  resolveChartCapabilities,
} from "./chartKinds";
import { ModelId } from "../comfortModels";
import {
  WorkspaceId,
  supportsExploreWorkspace,
  supportsStandardWorkspace,
} from "../workspaces";
import { FieldChartProfileKind } from "./fieldChartProfile";
import { TableType } from "./tableLayouts";

describe("output catalog", () => {
  it("defines six chart engines with defaults", () => {
    expect(Object.keys(chartEngineMetaById)).toHaveLength(6);
    expect(chartEngineMetaById[ChartEngine.DynamicField]).toBeDefined();
    expect(chartEngineMetaById[ChartEngine.ParametricLine]).toBeDefined();
    expect(chartEngineMetaById[ChartEngine.Custom]).toBeDefined();
    expect(isChartEngine(ChartEngine.DynamicField)).toBe(true);
    expect(isChartEngine("invented-engine")).toBe(false);
    expect(isModelChartEngine(ChartEngine.BandScalar)).toBe(true);
    expect(isModelChartEngine(ChartEngine.ParametricLine)).toBe(true);
    expect(isModelChartEngine(ChartEngine.Custom)).toBe(false);
  });

  it("allows Custom by PMV model id rather than instance id", () => {
    expect(modelAllowsCustomCharts(ModelId.PmvAshrae)).toBe(true);
    expect(modelAllowsCustomCharts(ModelId.PmvIso)).toBe(true);
    expect(modelAllowsCustomCharts(ModelId.HeatIndex)).toBe(false);
    expect(modelAllowsCustomCharts(ModelId.Phs2023)).toBe(false);
  });

  it("merges capability overrides", () => {
    const capabilities = resolveChartCapabilities(ChartEngine.DynamicField, {
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

