import type { PlotlyChartSpec } from "../../plotlyTypes";
import { ChartEngine } from "../../../catalog/chartEngines";
import type { UnitSystem as UnitSystemType } from "../../../catalog/units";

export interface SimulationTimeSeriesLineChartSpec {
  readonly build: (
    result: unknown,
    draft: unknown,
    unitSystem: UnitSystemType,
  ) => PlotlyChartSpec;
}

export interface SimulationChartDeclaration {
  readonly id: string;
  readonly engine: typeof ChartEngine.TimeSeriesLine;
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
