import type { ChartPayload } from "../../../charts/types";
import { ChartType } from "../../../catalog/chartTypes";
import type { UnitSystem as UnitSystemType } from "../../../catalog/units";

export interface SimulationTimeSeriesLineChartSpec {
  readonly build: (
    result: unknown,
    draft: unknown,
    unitSystem: UnitSystemType,
  ) => ChartPayload;
}

export interface SimulationChartDeclaration {
  readonly id: string;
  readonly type: typeof ChartType.BodyTemperature | typeof ChartType.WaterLoss;
  readonly title: string;
  readonly description: string;
  readonly emptyMessage: string;
  readonly heightClass: string;
  readonly testId?: string;
  readonly spec: SimulationTimeSeriesLineChartSpec;
}

export interface SimulationOutputDeclaration {
  readonly charts: readonly SimulationChartDeclaration[];
}
