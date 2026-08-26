import { ModelId, type ModelId as ModelIdType } from "../modelIds";

/**
 * Closed chart-engine set (Plan ChartEngine). Model declarations cannot add members.
 * Custom is frontend-only for PMV psychrometric non-grid geometry.
 */
export const ChartEngine = {
  DynamicField: "dynamic-field",
  BoundaryRegion: "boundary-region",
  ParametricLine: "parametric-line",
  BandScalar: "band-scalar",
  TimeSeriesLine: "time-series-line",
  Custom: "custom",
} as const;

export type ChartEngine = (typeof ChartEngine)[keyof typeof ChartEngine];

/** Engines a model declaration (`defineModel`) may name. Custom is frontend-only. */
export const MODEL_CHART_ENGINES = [
  ChartEngine.DynamicField,
  ChartEngine.BoundaryRegion,
  ChartEngine.ParametricLine,
  ChartEngine.BandScalar,
  ChartEngine.TimeSeriesLine,
] as const;

export type ModelChartEngine = (typeof MODEL_CHART_ENGINES)[number];

export function isChartEngine(value: string): value is ChartEngine {
  return (Object.values(ChartEngine) as readonly string[]).includes(value);
}

export function isModelChartEngine(value: string): value is ModelChartEngine {
  return (MODEL_CHART_ENGINES as readonly string[]).includes(value);
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

export const chartEngineMetaById: Record<ChartEngine, ChartInstanceCapabilities> = {
  [ChartEngine.DynamicField]: {
    allowsAxisSelection: true,
    locksYAxis: false,
    allowsOutputSelection: true,
    allowsBandEditing: true,
    allowsBaselineSelection: true,
    showsZoneToggle: false,
    showsLegend: true,
    showsExport: true,
  },
  [ChartEngine.BoundaryRegion]: {
    allowsAxisSelection: true,
    locksYAxis: false,
    allowsOutputSelection: false,
    allowsBandEditing: false,
    allowsBaselineSelection: true,
    showsZoneToggle: true,
    showsLegend: true,
    showsExport: true,
  },
  [ChartEngine.ParametricLine]: {
    allowsAxisSelection: false,
    locksYAxis: false,
    allowsOutputSelection: false,
    allowsBandEditing: false,
    allowsBaselineSelection: true,
    showsZoneToggle: false,
    showsLegend: false,
    showsExport: true,
  },
  [ChartEngine.BandScalar]: {
    allowsAxisSelection: false,
    locksYAxis: true,
    allowsOutputSelection: true,
    allowsBandEditing: true,
    allowsBaselineSelection: false,
    showsZoneToggle: false,
    showsLegend: true,
    showsExport: true,
  },
  [ChartEngine.TimeSeriesLine]: {
    allowsAxisSelection: false,
    locksYAxis: true,
    allowsOutputSelection: false,
    allowsBandEditing: false,
    allowsBaselineSelection: false,
    showsZoneToggle: false,
    showsLegend: true,
    showsExport: true,
  },
  [ChartEngine.Custom]: {
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
  engine: ChartEngine,
  overrides?: Partial<ChartInstanceCapabilities>,
): ChartInstanceCapabilities {
  return { ...chartEngineMetaById[engine], ...overrides };
}

/**
 * Custom is frontend-only for PMV psychrometric geometry.
 * Instance ids live on the PMV declarations, not in this module.
 */
export function modelAllowsCustomCharts(modelId: ModelIdType): boolean {
  return modelId === ModelId.PmvAshrae || modelId === ModelId.PmvIso;
}

/** Presentation metadata for one declared chart instance. Engine spec lives on registrations. */
export interface ChartInstanceDeclaration {
  readonly instanceId: string;
  readonly engine: ChartEngine;
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
