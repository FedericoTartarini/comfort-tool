import type { PlotHoverRow, PlotlyChartSpec } from "../../../plotlyTypes";
import type { ChartPlotlyBuild } from "../chartBuildResult";
import type { InputId as InputIdType } from "../../../../catalog/inputSlots";
import type {
  BandInputsSi,
  ChartBuildContext,
  ModelOutput,
} from "../../../../catalog/modelCapabilities";
import {
  ChartType,
  type ChartInstanceCapabilities,
} from "../../../../catalog/chartTypes";
import type { PhysicalQuantityId, QuantityState } from "../../../../catalog/quantities";
import type { GridModelChartSpec } from "../gridModelCharts";
import type { ChartAxisScale, ChartRange } from "../types";
import type { IsolineBandLayout } from "../../../../charts/isolines";
import type { LibraryQuantityMapping } from "../../requestMapping";
import type { FieldChartLayoutSpec } from "../fieldChartEngine";
import type { UnitSystem as UnitSystemType } from "../../../../catalog/units";

export interface DynamicFieldLockedAxes {
  readonly xField: PhysicalQuantityId;
  readonly yField: PhysicalQuantityId;
  readonly xRangeSi: ChartRange;
  readonly yRangeSi: ChartRange;
}

/**
 * Authoring-facing grid spec. Payload parameters use `never` so a model-specific
 * `GridModelChartSpec<TPayload, TResult>` remains assignable (contravariance).
 */
export type DynamicFieldResolvedGridSpec<TResult> = Omit<
  GridModelChartSpec<never, TResult>,
  "instanceId" | "dynamicTitle"
>;

/** Data-only DynamicField spec. Geometry stays in the DynamicField engine. */
export interface DynamicFieldGridSpec<TResult> {
  readonly axes: {
    readonly x: PhysicalQuantityId;
    readonly y: PhysicalQuantityId;
  };
  readonly title?: string;
  readonly axisFields?: readonly PhysicalQuantityId[];
  readonly lockedAxes?: DynamicFieldLockedAxes;
  readonly resolveGridSpec?: (
    context: ChartBuildContext,
  ) => DynamicFieldResolvedGridSpec<TResult>;
  readonly evaluate?: (payload: never) => TResult;
  readonly getOutputValue?: (
    result: TResult,
    outputKey?: ModelOutput["key"],
  ) => number | null | undefined;
  readonly requestAdapter?: Pick<
    LibraryQuantityMapping<never>,
    "getAxisValue" | "setAxisValue"
  >;
  readonly tryEvaluatePayload?: (payload: never) => number | null | undefined;
  readonly chartAxisAdapter?: Pick<
    LibraryQuantityMapping<never>,
    "getAxisValue" | "setAxisValue"
  >;
  readonly applyChartCoordinates?: GridModelChartSpec<
    never,
    TResult
  >["applyChartCoordinates"];
  readonly dynamicHoverExtension?: GridModelChartSpec<
    never,
    TResult
  >["dynamicHoverExtension"];
  readonly gridPoints?: number;
  readonly dynamicViewLayout?: Partial<FieldChartLayoutSpec>;
  readonly isolineLayout?: IsolineBandLayout;
  readonly absFromThreshold?: (threshold: number) => number;
  readonly getIsolineValue?: (result: TResult) => number | null;
  readonly clipAirSpeedWithoutOccupantControl?: boolean | ((payload: never) => boolean);
  readonly axisRanges?: Partial<Record<PhysicalQuantityId, ChartRange>>;
  readonly bandLabel?: string;
}

export function dynamicAxisPool(
  spec: Pick<DynamicFieldGridSpec<unknown>, "axes" | "axisFields">,
): readonly PhysicalQuantityId[] {
  return spec.axisFields ?? [spec.axes.x, spec.axes.y];
}

type FrontendChartBuild<TResult, ChartSourceType> = (
  chartSource: ChartSourceType | null,
  valuesByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
) => PlotlyChartSpec | ChartPlotlyBuild | null;

export type DynamicFieldChartEngineSpec<TResult, ChartSourceType = unknown> =
  DynamicFieldGridSpec<TResult>;

export function isDynamicFieldGridSpec<TResult = never>(
  spec: object,
): spec is DynamicFieldGridSpec<TResult> {
  return "axes" in spec && !specHasPlotlyBuild(spec);
}

export function specHasPlotlyBuild(spec: object): boolean {
  return "build" in spec;
}

/** Data-only BandScalar spec. Geometry stays in the BandScalar engine. */
export interface BandScalarDataSpec<TResult> {
  readonly title?: string;
  readonly getOutputValue: (result: TResult) => number;
  readonly xRangeSi?: ChartRange;
  readonly xPoints?: number;
  readonly yPoints?: number;
  readonly xLabel?: string;
  readonly margin?: { l: number; r: number; t: number; b: number };
  readonly legendTextByLabel?: Readonly<Record<string, string>>;
  readonly hoverCategoryTitle?: string;
}

export type BandScalarChartEngineSpec<TResult, ChartSourceType = unknown> =
  BandScalarDataSpec<TResult>;

export function isBandScalarDataSpec<TResult>(
  spec: object,
): spec is BandScalarDataSpec<TResult> {
  return (
    "getOutputValue" in spec &&
    !("axes" in spec) &&
    !("resolveGridSpec" in spec) &&
    !("getSeries" in spec) &&
    !("getGeometry" in spec) &&
    !specHasPlotlyBuild(spec)
  );
}

/** Data-only BoundaryRegion spec. Geometry stays in the BoundaryRegion engine. */
export interface BoundaryRegionDataSpec<TResult = unknown, TPayload = unknown> {
  readonly title?: string;
  readonly axisFields: readonly PhysicalQuantityId[];
  readonly outdoorRangeSi: ChartRange;
  readonly outdoorLabel: string;
  readonly operativeRangeSi: ChartRange;
  readonly boundaryPoints?: number;
  readonly evaluate: (payload: TPayload) => TResult;
  readonly requestFromPoint: (
    baseline: TPayload,
    outdoorSi: number,
    operativeSi: number,
  ) => TPayload;
  readonly getBandInputsSi?: (payload: TPayload) => BandInputsSi;
  readonly getHoverMetadata: (
    result: TResult,
    unitSystem: UnitSystemType,
    payload?: TPayload,
  ) => PlotHoverRow;
  readonly buildHoverTemplate: (
    unitSystem: UnitSystemType,
    xAxis: ChartAxisScale,
    yAxis: ChartAxisScale,
    inputLabel?: string | null,
  ) => string;
}

export type BoundaryRegionChartEngineSpec<TResult, ChartSourceType = unknown> =
  BoundaryRegionDataSpec<TResult, never>;

export function isBoundaryRegionDataSpec(
  spec: object,
): spec is BoundaryRegionDataSpec {
  if (
    !("axisFields" in spec) ||
    !("evaluate" in spec) ||
    "resolveGridSpec" in spec ||
    specHasPlotlyBuild(spec)
  ) {
    return false;
  }
  const { axisFields } = spec as BoundaryRegionDataSpec;
  return Array.isArray(axisFields) && axisFields.length >= 2;
}

/** Data-only Psychrometric spec. Geometry stays in src/charts/psychrometric/. */
export interface PsychrometricHoverSample {
  readonly pmv: number;
  readonly ppd: number;
}

export interface PsychrometricDataSpec {
  readonly title?: string;
  readonly evaluate: (
    payload: never,
    tdb: number,
    rh: number,
  ) => number | null;
  readonly evaluateHover?: (
    payload: never,
    tdb: number,
    rh: number,
  ) => PsychrometricHoverSample | null;
  readonly trEqualsTdb: (
    chartSource: unknown,
    context: ChartBuildContext,
  ) => boolean;
  readonly comfortIsolineTargets?: readonly number[];
  readonly ppdThresholdToAbsPmv?: (ppd: number) => number;
}

/** Data-only TimeSeriesLine spec. Geometry stays in the TimeSeriesLine engine. */
export interface TimeSeriesLinePoint {
  readonly x: number;
  readonly y: number;
}

export interface TimeSeriesLineDataSpec<TResult> {
  readonly title: string;
  readonly yLabel: string;
  readonly getSeries: (result: TResult) => readonly TimeSeriesLinePoint[];
}

export interface TimeSeriesLineGeometrySpec<TResult, ChartSourceType> {
  readonly build: FrontendChartBuild<TResult, ChartSourceType>;
}

export type TimeSeriesLineChartEngineSpec<TResult, ChartSourceType = unknown> =
  | TimeSeriesLineDataSpec<TResult>
  | TimeSeriesLineGeometrySpec<TResult, ChartSourceType>;

export function isTimeSeriesLineDataSpec<TResult>(
  spec: object,
): spec is TimeSeriesLineDataSpec<TResult> {
  return (
    "getSeries" in spec &&
    !("getGeometry" in spec) &&
    !specHasPlotlyBuild(spec)
  );
}

export const ParametricYUnit = {
  Temperature: "temperature",
  HeatFlux: "heat-flux",
  Identity: "identity",
} as const;

export type ParametricYUnit =
  (typeof ParametricYUnit)[keyof typeof ParametricYUnit];

export interface ParametricLinePoint {
  readonly x: number;
  readonly y: number;
}

export interface ParametricPolyline {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly points: readonly ParametricLinePoint[];
  readonly yUnit: ParametricYUnit;
  readonly yAxis?: "y" | "y2";
  readonly visible?: boolean;
  readonly dash?: "solid" | "dot" | "dash";
}

export interface ParametricLimitBand {
  readonly label: string;
  readonly color: string;
  readonly min: number;
  readonly max: number;
  readonly yUnit: ParametricYUnit;
  readonly yAxis?: "y" | "y2";
}

export interface ParametricLineGeometry {
  readonly polylines: readonly ParametricPolyline[];
  readonly limitBands?: readonly ParametricLimitBand[];
  readonly comparePoints?: Partial<
    Record<InputIdType, { x: number; y: number }>
  >;
}

/** Data-only ParametricLine spec. Geometry stays in the ParametricLine engine. */
export interface ParametricLineDataSpec<TResult> {
  readonly title?: string;
  readonly xField: PhysicalQuantityId;
  readonly yLabel: string;
  readonly y2Label?: string;
  readonly getGeometry: (
    chartSource: unknown,
    valuesByInput: Record<InputIdType, TResult | null>,
    context: ChartBuildContext,
  ) => ParametricLineGeometry | null;
}

export function isParametricLineDataSpec<TResult>(
  spec: object,
): spec is ParametricLineDataSpec<TResult> {
  return "getGeometry" in spec && !specHasPlotlyBuild(spec);
}

export function isPsychrometricDataSpec(
  spec: object,
): spec is PsychrometricDataSpec {
  return (
    "evaluate" in spec &&
    "trEqualsTdb" in spec &&
    !specHasPlotlyBuild(spec)
  );
}

/**
 * Closed ChartType spec union for frontend registrations.
 */
export type RegisteredChartBindSpec<TResult, ChartSourceType> =
  | {
      type: typeof ChartType.Dynamic;
      spec: DynamicFieldChartEngineSpec<TResult, ChartSourceType>;
    }
  | {
      type: typeof ChartType.Adaptive;
      spec: BoundaryRegionChartEngineSpec<TResult, ChartSourceType>;
    }
  | {
      type: typeof ChartType.HeatLoss;
      spec: ParametricLineDataSpec<TResult>;
    }
  | {
      type: typeof ChartType.Set;
      spec: ParametricLineDataSpec<TResult>;
    }
  | {
      type: typeof ChartType.Utci;
      spec: BandScalarChartEngineSpec<TResult, ChartSourceType>;
    }
  | {
      type: typeof ChartType.BodyTemperature;
      spec: TimeSeriesLineChartEngineSpec<TResult, ChartSourceType>;
    }
  | {
      type: typeof ChartType.WaterLoss;
      spec: TimeSeriesLineChartEngineSpec<TResult, ChartSourceType>;
    }
  | {
      type: typeof ChartType.Psychrometric;
      spec: PsychrometricDataSpec;
    };

interface ChartCommonFields {
  readonly emptyMessage?: string;
  readonly titlePrefix?: string | null;
  readonly note?: string;
  readonly capabilities?: Partial<ChartInstanceCapabilities>;
  readonly supportedExploreOutputs?: readonly ModelOutput["key"][];
  readonly defaultExploreOutput?: ModelOutput["key"];
}

/** Family / defineModel chart entry. Result scalars are QuantityState. */
export type FrontendChartDeclaration<
  ChartSourceType = unknown,
> = ChartCommonFields & RegisteredChartBindSpec<QuantityState, ChartSourceType>;

export interface ChartEngineRegistration<TResult, ChartSourceType> {
  readonly instanceId: string;
  readonly type: ChartType;
  readonly emptyMessage: string;
  readonly note?: string;
  readonly supportedExploreOutputs?: readonly ModelOutput["key"][];
  readonly defaultExploreOutput?: ModelOutput["key"];
  readonly registration: RegisteredChartBindSpec<TResult, ChartSourceType>;
}

export type RegisteredChartEngineSpec<TResult, ChartSourceType> =
  RegisteredChartBindSpec<TResult, ChartSourceType>;

export function modelChartSpecMatchesType(chart: {
  readonly type: ChartType;
  readonly spec: object;
}): boolean {
  switch (chart.type) {
    case ChartType.Dynamic:
      return isDynamicFieldGridSpec(chart.spec);
    case ChartType.Utci:
      return isBandScalarDataSpec(chart.spec);
    case ChartType.Adaptive:
      return isBoundaryRegionDataSpec(chart.spec);
    case ChartType.HeatLoss:
    case ChartType.Set:
      return isParametricLineDataSpec(chart.spec);
    case ChartType.BodyTemperature:
    case ChartType.WaterLoss:
      return isTimeSeriesLineDataSpec(chart.spec) || specHasPlotlyBuild(chart.spec);
    case ChartType.Psychrometric:
      return isPsychrometricDataSpec(chart.spec);
  }
}
