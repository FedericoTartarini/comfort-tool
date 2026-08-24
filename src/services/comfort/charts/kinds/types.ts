import type { ModelChartSourceDto } from "../../../../models/comfortDtos";
import type { InputId as InputIdType } from "../../../../models/inputSlots";
import type { ChartBuildContext, ModelOutput } from "../../../../models/modelCapabilities";
import type { ChartAxisQuantityId } from "../../../../models/physicalQuantities";
import type { GridModelChartSpec } from "../gridModelCharts";
import type { ChartRange } from "../types";

export interface DynamicFieldChartKindSpec<TPayload extends object, TResult> {
  readonly title: string;
  readonly axisFields: readonly ChartAxisQuantityId[];
  readonly resolveGridSpec: (
    context: ChartBuildContext,
  ) => Omit<GridModelChartSpec<TPayload, TResult>, "instanceId" | "dynamicTitle">;
}

export interface CustomChartKindSpec<TResult, ChartSourceType> {
  readonly build: (
    chartSource: ChartSourceType | null,
    resultsByInput: Record<InputIdType, TResult | null>,
    context: ChartBuildContext,
  ) => import("../../../../models/comfortDtos").PlotlyChartResponseDto | null;
}

export interface BandScalarChartKindSpec<TResult, TPayload extends object> {
  readonly build: (
    chartSource: ModelChartSourceDto<TPayload> | null,
    resultsByInput: Record<InputIdType, TResult | null>,
    context: ChartBuildContext,
  ) => import("../../../../models/comfortDtos").PlotlyChartResponseDto | null;
}

export interface BoundaryRegionChartKindSpec<TResult, ChartSourceType> {
  readonly build: (
    chartSource: ChartSourceType | null,
    resultsByInput: Record<InputIdType, TResult | null>,
    context: ChartBuildContext,
  ) => import("../../../../models/comfortDtos").PlotlyChartResponseDto | null;
}

export interface TimeSeriesLineChartKindSpec<TResult, ChartSourceType> {
  readonly build: (
    chartSource: ChartSourceType | null,
    resultsByInput: Record<InputIdType, TResult | null>,
    context: ChartBuildContext,
  ) => import("../../../../models/comfortDtos").PlotlyChartResponseDto | null;
}

export interface ParametricLineChartKindSpec {
  readonly xField: ChartAxisQuantityId;
  readonly series: readonly { id: string; label: string; color: string }[];
  readonly xRangeSi?: ChartRange;
}

export type RegisteredChartKindSpec<TResult, ChartSourceType, TPayload extends object> =
  | { kind: "dynamic-field"; spec: DynamicFieldChartKindSpec<TPayload, TResult> }
  | { kind: "boundary-region"; spec: BoundaryRegionChartKindSpec<TResult, ChartSourceType> }
  | { kind: "band-scalar"; spec: BandScalarChartKindSpec<TResult, TPayload> }
  | { kind: "time-series-line"; spec: TimeSeriesLineChartKindSpec<TResult, ChartSourceType> }
  | { kind: "parametric-line"; spec: ParametricLineChartKindSpec }
  | { kind: "custom"; spec: CustomChartKindSpec<TResult, ChartSourceType> };

export interface ChartKindRegistration<
  TResult,
  ChartSourceType,
  TPayload extends object = object,
> {
  readonly instanceId: string;
  readonly name: string;
  readonly emptyMessage: string;
  readonly note?: string;
  readonly supportedExploreOutputs?: readonly ModelOutput["key"][];
  readonly defaultExploreOutput?: ModelOutput["key"];
  readonly registration: RegisteredChartKindSpec<TResult, ChartSourceType, TPayload>;
}
