import type { PlotlyChartResponseDto } from "../../../../models/comfortDtos";
import { ChartEngine } from "../../../../models/output/chartKinds";
import type { UnitSystem as UnitSystemType } from "../../../../models/units";
import type { SimulationChartDeclaration } from "../simulationCharts";

export function resolveSimulationChartBuild(
  chart: SimulationChartDeclaration,
  result: unknown,
  draft: unknown,
  unitSystem: UnitSystemType,
): PlotlyChartResponseDto {
  switch (chart.engine) {
    case ChartEngine.TimeSeriesLine:
      return chart.spec.build(result, draft, unitSystem);
    default: {
      const exhaustive: never = chart.engine;
      throw new Error(`Unsupported simulation chart engine: ${exhaustive}`);
    }
  }
}
