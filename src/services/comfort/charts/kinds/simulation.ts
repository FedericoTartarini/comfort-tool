import type { PlotlyChartResponseDto } from "../../../../models/comfortDtos";
import { ChartKind } from "../../../../models/output/chartKinds";
import type { UnitSystem as UnitSystemType } from "../../../../models/units";
import type { SimulationChartDeclaration } from "../../../../models/output/simulationCharts";

export function resolveSimulationChartBuild(
  chart: SimulationChartDeclaration,
  result: unknown,
  draft: unknown,
  unitSystem: UnitSystemType,
): PlotlyChartResponseDto {
  switch (chart.kind) {
    case ChartKind.TimeSeriesLine:
      return chart.spec.build(result, draft, unitSystem);
    default: {
      const exhaustive: never = chart.kind;
      throw new Error(`Unsupported simulation chart kind: ${exhaustive}`);
    }
  }
}
