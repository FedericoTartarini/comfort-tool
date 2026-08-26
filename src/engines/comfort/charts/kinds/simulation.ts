import type { PlotlyChartSpec } from "../../../plotlyTypes";
import { ChartEngine } from "../../../../catalog/chartEngines";
import type { UnitSystem as UnitSystemType } from "../../../../catalog/units";
import type { SimulationChartDeclaration } from "../simulationCharts";

export function resolveSimulationChartBuild(
  chart: SimulationChartDeclaration,
  result: unknown,
  draft: unknown,
  unitSystem: UnitSystemType,
): PlotlyChartSpec {
  switch (chart.engine) {
    case ChartEngine.TimeSeriesLine:
      return chart.spec.build(result, draft, unitSystem);
    default: {
      const exhaustive: never = chart.engine;
      throw new Error(`Unsupported simulation chart engine: ${exhaustive}`);
    }
  }
}
