import type { ModelOutputKey } from "./modelCapabilities";

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
  PhsExposureHistory: "phsExposureHistory",
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
  /** Limits this chart's Explore output picker to the declared model outputs. */
  readonly supportedExploreOutputs?: readonly ModelOutputKey[];
  /** Output selected when this chart cannot display the model's current Explore output. */
  readonly defaultExploreOutput?: ModelOutputKey;
  /** Whether compare mode should expose the baseline-input picker for this chart. */
  readonly usesBaselineInput?: boolean;
}

export interface ModelCharts {
  readonly defaultId: ChartId;
  readonly entries: readonly ModelChartDefinition[];
}
