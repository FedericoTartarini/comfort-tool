import { ChartKind } from "./chartKinds";
import type { PlotlyChartResponseDto } from "../comfortDtos";
import type { UnitSystem as UnitSystemType } from "../units";
import type { TableDeclaration } from "./tableLayouts";

export interface SimulationTimeSeriesLineChartSpec {
  readonly build: (
    result: unknown,
    draft: unknown,
    unitSystem: UnitSystemType,
  ) => PlotlyChartResponseDto;
}

export interface SimulationChartDeclaration {
  readonly id: string;
  readonly kind: typeof ChartKind.TimeSeriesLine;
  readonly title: string;
  readonly description: string;
  readonly emptyMessage: string;
  readonly heightClass: string;
  readonly testId?: string;
  readonly spec: SimulationTimeSeriesLineChartSpec;
}

export interface SimulationOutputDeclaration<TResult = unknown> {
  readonly table: TableDeclaration<TResult>;
  readonly charts: readonly SimulationChartDeclaration[];
}
