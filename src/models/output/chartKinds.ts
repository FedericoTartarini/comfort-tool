import { ComfortModel, type ComfortModel as ComfortModelType } from "../comfortModels";

/**
 * Closed chart-engine set (Plan ChartEngine). Model declarations cannot add members.
 * ParametricLine is omitted until Phase 1; do not restore an empty stub.
 * Custom is frontend-only for PMV psychrometric non-grid geometry.
 */
export const ChartKind = {
  DynamicField: "dynamic-field",
  BoundaryRegion: "boundary-region",
  BandScalar: "band-scalar",
  TimeSeriesLine: "time-series-line",
  Custom: "custom",
} as const;

export type ChartKind = (typeof ChartKind)[keyof typeof ChartKind];

/** Engines a model declaration (`defineModel`) may name. Custom is frontend-only. */
export const MODEL_CHART_KINDS = [
  ChartKind.DynamicField,
  ChartKind.BoundaryRegion,
  ChartKind.BandScalar,
  ChartKind.TimeSeriesLine,
] as const;

export type ModelChartKind = (typeof MODEL_CHART_KINDS)[number];

export function isChartKind(value: string): value is ChartKind {
  return (Object.values(ChartKind) as readonly string[]).includes(value);
}

export function isModelChartKind(value: string): value is ModelChartKind {
  return (MODEL_CHART_KINDS as readonly string[]).includes(value);
}

export interface ChartInstanceCapabilities {
  readonly allowsAxisSelection: boolean;
  readonly locksYAxis: boolean;
  readonly allowsOutputSelection: boolean;
  readonly allowsBandEditing: boolean;
  readonly allowsBaselineSelection: boolean;
  readonly showsZoneToggle: boolean;
  readonly showsLegend: boolean;
  readonly showsExport: boolean;
}

export const chartKindMetaById: Record<ChartKind, ChartInstanceCapabilities> = {
  [ChartKind.DynamicField]: {
    allowsAxisSelection: true,
    locksYAxis: false,
    allowsOutputSelection: true,
    allowsBandEditing: true,
    allowsBaselineSelection: true,
    showsZoneToggle: false,
    showsLegend: true,
    showsExport: true,
  },
  [ChartKind.BoundaryRegion]: {
    allowsAxisSelection: true,
    locksYAxis: false,
    allowsOutputSelection: false,
    allowsBandEditing: false,
    allowsBaselineSelection: true,
    showsZoneToggle: true,
    showsLegend: true,
    showsExport: true,
  },
  [ChartKind.BandScalar]: {
    allowsAxisSelection: false,
    locksYAxis: true,
    allowsOutputSelection: true,
    allowsBandEditing: true,
    allowsBaselineSelection: false,
    showsZoneToggle: false,
    showsLegend: true,
    showsExport: true,
  },
  [ChartKind.TimeSeriesLine]: {
    allowsAxisSelection: false,
    locksYAxis: true,
    allowsOutputSelection: false,
    allowsBandEditing: false,
    allowsBaselineSelection: false,
    showsZoneToggle: false,
    showsLegend: true,
    showsExport: true,
  },
  [ChartKind.Custom]: {
    allowsAxisSelection: false,
    locksYAxis: false,
    allowsOutputSelection: false,
    allowsBandEditing: false,
    allowsBaselineSelection: true,
    showsZoneToggle: false,
    showsLegend: true,
    showsExport: true,
  },
};

export function resolveChartCapabilities(
  kind: ChartKind,
  overrides?: Partial<ChartInstanceCapabilities>,
): ChartInstanceCapabilities {
  return { ...chartKindMetaById[kind], ...overrides };
}

/**
 * Custom is frontend-only for PMV psychrometric geometry.
 * Instance ids live on the PMV declarations, not in this module.
 */
export function modelAllowsCustomCharts(modelId: ComfortModelType): boolean {
  return modelId === ComfortModel.PmvAshrae || modelId === ComfortModel.PmvIso;
}

/** Presentation metadata for one declared chart instance. Engine spec lives on registrations. */
export interface ChartInstanceDeclaration {
  readonly instanceId: string;
  readonly kind: ChartKind;
  readonly name: string;
  readonly emptyMessage: string;
  readonly note?: string;
  readonly capabilities?: Partial<ChartInstanceCapabilities>;
  /**
   * Named chart type (built-in or model-declaration extension). Must keep this
   * entry's existing engine; extended types cannot escape the model-declaration
   * spec union.
   */
  readonly type?: string;
}

export interface ModelChartInstances {
  readonly defaultInstanceId: string;
  readonly entries: readonly ChartInstanceDeclaration[];
}
