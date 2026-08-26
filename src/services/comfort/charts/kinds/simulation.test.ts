import { describe, expect, it } from "vitest";

import { ChartEngine } from "../../../../models/output/chartKinds";
import { CalculationSource } from "../../../../models/calculationMetadata";
import { UnitSystem } from "../../../../models/units";
import type { SimulationChartDeclaration } from "../simulationCharts";
import type { PlotlyChartResponseDto } from "../../../../models/comfortDtos";
import { resolveSimulationChartBuild } from "./simulation";

describe("simulation chart resolver", () => {
  it("routes time-series-line simulation charts through their spec builder", () => {
    const chart: SimulationChartDeclaration = {
      id: "test-chart",
      engine: ChartEngine.TimeSeriesLine,
      title: "Test chart",
      description: "Test description",
      emptyMessage: "Empty",
      heightClass: "h-[200px]",
      spec: {
        build: () => ({
          traces: [],
          layout: {
            title: "",
            paper_bgcolor: "#ffffff",
            plot_bgcolor: "#ffffff",
            showlegend: false,
            xaxis: { title: "", range: [0, 1] },
            yaxis: { title: "", range: [0, 1] },
            margin: { l: 0, r: 0, t: 0, b: 0 },
          },
          annotations: [],
          source: CalculationSource.JsThermalComfort,
        } satisfies PlotlyChartResponseDto),
      },
    };

    const result = resolveSimulationChartBuild(chart, {}, {}, UnitSystem.SI);

    expect(result).toEqual({
      traces: [],
      layout: {
        title: "",
        paper_bgcolor: "#ffffff",
        plot_bgcolor: "#ffffff",
        showlegend: false,
        xaxis: { title: "", range: [0, 1] },
        yaxis: { title: "", range: [0, 1] },
        margin: { l: 0, r: 0, t: 0, b: 0 },
      },
      annotations: [],
      source: CalculationSource.JsThermalComfort,
    });
  });
});
