import { describe, expect, it } from "vitest";

import { ChartType } from "../../../../catalog/chartTypes";
import { UnitSystem } from "../../../../catalog/units";
import type { ChartPayload } from "../../../../charts/types";
import type { SimulationChartDeclaration } from "../simulationCharts";
import { resolveSimulationChartBuild } from "./simulation";

describe("simulation chart resolver", () => {
  it("routes body-temperature simulation charts through their spec builder", () => {
    const payload: ChartPayload = {
      type: ChartType.BodyTemperature,
      input: {
        xAxis: { title: "", range: [0, 1] },
        yAxis: { title: "", range: [0, 1] },
        series: [],
      },
    };
    const chart: SimulationChartDeclaration = {
      id: "test-chart",
      type: ChartType.BodyTemperature,
      title: "Test chart",
      description: "Test description",
      emptyMessage: "Empty",
      heightClass: "h-[200px]",
      spec: {
        build: () => payload,
      },
    };

    const result = resolveSimulationChartBuild(chart, {}, {}, UnitSystem.SI);

    expect(result).toEqual(payload);
  });
});
