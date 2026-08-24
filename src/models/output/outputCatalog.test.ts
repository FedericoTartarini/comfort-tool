import { describe, expect, it } from "vitest";

import {
  ChartKind,
  chartKindMetaById,
  resolveChartCapabilities,
} from "./chartKinds";
import {
  supportsExploreWorkspace,
  supportsStandardWorkspace,
  WorkspaceCapability,
} from "./workspaceCapabilities";
import { FieldChartProfileKind } from "./fieldChartProfile";
import { TableLayout } from "./tableLayouts";

describe("output catalog", () => {
  it("defines six chart kinds with defaults", () => {
    expect(Object.keys(chartKindMetaById)).toHaveLength(6);
    expect(chartKindMetaById[ChartKind.ParametricLine]).toBeDefined();
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
      WorkspaceCapability.Standard,
      WorkspaceCapability.Explore,
    ] as const;
    expect(supportsStandardWorkspace(capabilities)).toBe(true);
    expect(supportsExploreWorkspace(capabilities)).toBe(true);
  });

  it("exports table layouts and profile kinds", () => {
    expect(TableLayout.CompareMatrix).toBe("compare-matrix");
    expect(FieldChartProfileKind.Compliance).toBe("compliance");
  });
});

