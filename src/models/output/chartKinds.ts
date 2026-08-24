export const ChartKind = {
  DynamicField: "dynamic-field",
  BoundaryRegion: "boundary-region",
  BandScalar: "band-scalar",
  TimeSeriesLine: "time-series-line",
  ParametricLine: "parametric-line",
  Custom: "custom",
} as const;

export type ChartKind = (typeof ChartKind)[keyof typeof ChartKind];

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
  [ChartKind.ParametricLine]: {
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
