import { describe, expect, it } from "vitest";

import {
  ChartType,
  chartTypeCapabilities,
  chartTypeLabel,
  isChartType,
  resolveChartCapabilities,
} from "./chartTypes";
import { FieldChartProfileKind } from "./fieldChartProfile";

describe("output catalog", () => {
  it("defines eight chart types with title-case dropdown labels", () => {
    expect(Object.keys(chartTypeCapabilities)).toHaveLength(8);
    expect(chartTypeLabel[ChartType.HeatLoss]).toBe("Heat Loss");
    expect(chartTypeLabel[ChartType.BodyTemperature]).toBe("Body Temperature");
    expect(chartTypeLabel[ChartType.Set]).toBe("SET");
    expect(chartTypeLabel[ChartType.Psychrometric]).toBe("Psychrometric");
    expect(isChartType(ChartType.Dynamic)).toBe(true);
    expect(isChartType(ChartType.Psychrometric)).toBe(true);
    expect(isChartType("invented-type")).toBe(false);
  });

  it("merges capability overrides", () => {
    const capabilities = resolveChartCapabilities(ChartType.Dynamic, {
      locksYAxis: true,
    });
    expect(capabilities.locksYAxis).toBe(true);
    expect(capabilities.allowsAxisSelection).toBe(true);
  });

  it("exports field-chart profile kinds", () => {
    expect(FieldChartProfileKind.Compliance).toBe("compliance");
  });
});
