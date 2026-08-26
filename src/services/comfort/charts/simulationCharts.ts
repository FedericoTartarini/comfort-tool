import type { PlotlyChartResponseDto } from "../../../models/comfortDtos";
import { ChartEngine } from "../../../models/output/chartKinds";
import type { UnitSystem as UnitSystemType } from "../../../models/units";

export interface SimulationTimeSeriesLineChartSpec {
  readonly build: (
    result: unknown,
    draft: unknown,
    unitSystem: UnitSystemType,
  ) => PlotlyChartResponseDto;
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
