import type { ChartPayload } from "../../../../charts/types";
import { ChartType } from "../../../../catalog/chartTypes";
import type { UnitSystem as UnitSystemType } from "../../../../catalog/units";
import type { SimulationChartDeclaration } from "../simulationCharts";

export function resolveSimulationChartBuild(
  chart: SimulationChartDeclaration,
  result: unknown,
  draft: unknown,
  unitSystem: UnitSystemType,
): ChartPayload {
  switch (chart.type) {
    case ChartType.BodyTemperature:
    case ChartType.WaterLoss:
      return chart.spec.build(result, draft, unitSystem);
    default: {
      const exhaustive: never = chart.type;
      throw new Error(`Unsupported simulation chart type: ${exhaustive}`);
    }
  }
}
