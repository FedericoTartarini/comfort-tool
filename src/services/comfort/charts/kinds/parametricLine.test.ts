import { describe, expect, it } from "vitest";

import { PhysicalQuantityId } from "../../../../models/physicalQuantities";
import { buildParametricLineChart } from "./builders";

describe("parametric-line chart kind", () => {
  it("returns an empty build result until a model registers the kind", () => {
    const result = buildParametricLineChart({
      instanceId: "parametric-placeholder",
      name: "Parametric",
      emptyMessage: "Not available.",
      registration: {
        kind: "parametric-line",
        spec: {
          xField: PhysicalQuantityId.DryBulbTemperature,
          series: [{ id: "series-1", label: "Series", color: "#000000" }],
        },
      },
    });
    expect(result.readiness).toBe("empty");
    expect(result.plotly).toBeNull();
    expect(result.emptyMessage).toContain("not implemented");
  });
});
