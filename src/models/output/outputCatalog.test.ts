import { describe, expect, it } from "vitest";

import {
  ChartKind,
  chartKindMetaById,
  isChartKind,
  isModelChartKind,
  modelAllowsCustomCharts,
  resolveChartCapabilities,
} from "./chartKinds";
import { ComfortModel } from "../comfortModels";
import {
  WorkspaceId,
  supportsExploreWorkspace,
  supportsStandardWorkspace,
} from "../workspaces";
import { FieldChartProfileKind } from "./fieldChartProfile";
import { TableType } from "./tableLayouts";

describe("output catalog", () => {
  it("defines six chart kinds with defaults", () => {
    expect(Object.keys(chartKindMetaById)).toHaveLength(6);
    expect(chartKindMetaById[ChartKind.DynamicField]).toBeDefined();
    expect(chartKindMetaById[ChartKind.ParametricLine]).toBeDefined();
    expect(chartKindMetaById[ChartKind.Custom]).toBeDefined();
    expect(isChartKind(ChartKind.DynamicField)).toBe(true);
    expect(isChartKind("invented-engine")).toBe(false);
    expect(isModelChartKind(ChartKind.BandScalar)).toBe(true);
    expect(isModelChartKind(ChartKind.ParametricLine)).toBe(true);
    expect(isModelChartKind(ChartKind.Custom)).toBe(false);
  });

  it("allows Custom by PMV model id rather than instance id", () => {
    expect(modelAllowsCustomCharts(ComfortModel.PmvAshrae)).toBe(true);
    expect(modelAllowsCustomCharts(ComfortModel.PmvIso)).toBe(true);
    expect(modelAllowsCustomCharts(ComfortModel.HeatIndex)).toBe(false);
    expect(modelAllowsCustomCharts(ComfortModel.Phs2023)).toBe(false);
  });

  it("merges capability overrides", () => {
    const capabilities = resolveChartCapabilities(ChartKind.DynamicField, {
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

