export const ChartId = {
  Psychrometric: "psychrometric",
  Stress: "stress",
  Adaptive: "adaptive",
  PmvDynamic: "pmvDynamic",
  UtciDynamic: "utciDynamic",
  HeatIndexRanges: "heatIndexRanges",
  HeatIndexDynamic: "heatIndexDynamic",
  Humidex: "humidex",
  HumidexDynamic: "humidexDynamic",
  WindChillDynamic: "windChillDynamic",
  PhsDynamic: "phsDynamic",
} as const;

export type ChartId = (typeof ChartId)[keyof typeof ChartId];

export interface ModelChartDefinition {
  readonly id: ChartId;
  readonly name: string;
  readonly emptyMessage: string;
  readonly allowsAxisSelection: boolean;
  readonly locksYAxis: boolean;
  readonly showsZoneToggle: boolean;
  readonly showsLegend: boolean;
}

export interface ModelCharts {
  readonly defaultId: ChartId;
  readonly entries: readonly ModelChartDefinition[];
}
