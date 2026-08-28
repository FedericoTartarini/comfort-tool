/**
 * Closed product chart types. Dropdown labels are the type in title case.
 * Figure modules in src/charts/ must not import models or quantities.
 */

export const ChartType = {
  Psychrometric: "psychrometric",
  Dynamic: "dynamic",
  HeatLoss: "heat-loss",
  Set: "set",
  Adaptive: "adaptive",
  Utci: "utci",
  BodyTemperature: "body-temperature",
  WaterLoss: "water-loss",
} as const;

export type ChartType = (typeof ChartType)[keyof typeof ChartType];

export const chartTypeLabel: Record<ChartType, string> = {
  [ChartType.Psychrometric]: "Psychrometric",
  [ChartType.Dynamic]: "Dynamic",
  [ChartType.HeatLoss]: "Heat Loss",
  [ChartType.Set]: "SET",
  [ChartType.Adaptive]: "Adaptive",
  [ChartType.Utci]: "UTCI",
  [ChartType.BodyTemperature]: "Body Temperature",
  [ChartType.WaterLoss]: "Water Loss",
};

export function isChartType(value: string): value is ChartType {
  return (Object.values(ChartType) as readonly string[]).includes(value);
}

export interface ChartInstanceCapabilities {
  readonly allowsAxisSelection: boolean;
  readonly locksYAxis: boolean;
  readonly allowsOutputSelection: boolean;
  readonly allowsBandEditing: boolean;
  readonly allowsBaselineSelection: boolean;
  readonly showsLegend: boolean;
  readonly showsExport: boolean;
}

export const chartTypeCapabilities: Record<ChartType, ChartInstanceCapabilities> = {
  [ChartType.Psychrometric]: {
    allowsAxisSelection: false,
    locksYAxis: false,
    allowsOutputSelection: false,
    allowsBandEditing: false,
    allowsBaselineSelection: true,
    showsLegend: true,
    showsExport: true,
  },
  [ChartType.Dynamic]: {
    allowsAxisSelection: true,
    locksYAxis: false,
    allowsOutputSelection: true,
    allowsBandEditing: true,
    allowsBaselineSelection: true,
    showsLegend: true,
    showsExport: true,
  },
  [ChartType.HeatLoss]: {
    allowsAxisSelection: false,
    locksYAxis: false,
    allowsOutputSelection: false,
    allowsBandEditing: false,
    allowsBaselineSelection: true,
    showsLegend: false,
    showsExport: true,
  },
  [ChartType.Set]: {
    allowsAxisSelection: false,
    locksYAxis: false,
    allowsOutputSelection: false,
    allowsBandEditing: false,
    allowsBaselineSelection: true,
    showsLegend: false,
    showsExport: true,
  },
  [ChartType.Adaptive]: {
    allowsAxisSelection: true,
    locksYAxis: false,
    allowsOutputSelection: false,
    allowsBandEditing: false,
    allowsBaselineSelection: true,
    showsLegend: true,
    showsExport: true,
  },
  [ChartType.Utci]: {
    allowsAxisSelection: false,
    locksYAxis: false,
    allowsOutputSelection: false,
    allowsBandEditing: false,
    allowsBaselineSelection: true,
    showsLegend: true,
    showsExport: true,
  },
  [ChartType.BodyTemperature]: {
    allowsAxisSelection: false,
    locksYAxis: false,
    allowsOutputSelection: true,
    allowsBandEditing: false,
    allowsBaselineSelection: true,
    showsLegend: false,
    showsExport: true,
  },
  [ChartType.WaterLoss]: {
    allowsAxisSelection: false,
    locksYAxis: true,
    allowsOutputSelection: false,
    allowsBandEditing: false,
    allowsBaselineSelection: false,
    showsLegend: true,
    showsExport: true,
  },
};

export function resolveChartCapabilities(
  type: ChartType,
  overrides?: Partial<ChartInstanceCapabilities>,
): ChartInstanceCapabilities {
  return { ...chartTypeCapabilities[type], ...overrides };
}

/** Presentation metadata for one declared chart instance. */
export interface ChartInstanceDeclaration {
  readonly instanceId: string;
  readonly type: ChartType;
  readonly emptyMessage: string;
  readonly note?: string;
  readonly capabilities?: Partial<ChartInstanceCapabilities>;
  readonly supportedExploreOutputs?: readonly string[];
  readonly defaultExploreOutput?: string;
}

export interface ModelChartInstances {
  readonly defaultInstanceId: string;
  readonly entries: readonly ChartInstanceDeclaration[];
}
