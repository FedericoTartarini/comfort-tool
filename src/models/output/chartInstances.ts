import type { ComfortModel as ComfortModelType } from "../comfortModels";
import { ComfortModel } from "../comfortModels";
import type { ChartKind } from "./chartKinds";
import type { ChartInstanceCapabilities } from "./chartKinds";

export const ChartInstanceId = {
  PmvAshrae: {
    Psychrometric: "pmv-ashrae-psychrometric",
    DynamicField: "pmv-ashrae-dynamic-field",
  },
  PmvIso: {
    Psychrometric: "pmv-iso-psychrometric",
    DynamicField: "pmv-iso-dynamic-field",
  },
  Utci: {
    StressBand: "utci-stress-band",
    DynamicField: "utci-dynamic-field",
  },
  AdaptiveAshrae: {
    Boundary: "adaptive-ashrae-boundary",
  },
  AdaptiveEn: {
    Boundary: "adaptive-en-boundary",
  },
  HeatIndex: {
    Ranges: "heat-index-ranges",
    DynamicField: "heat-index-dynamic-field",
  },
  Humidex: {
    Ranges: "humidex-ranges",
    DynamicField: "humidex-dynamic-field",
  },
  WindChill: {
    DynamicField: "wind-chill-dynamic-field",
  },
  Phs2023: {
    ExposureHistory: "phs-exposure-history",
    DynamicField: "phs-dynamic-field",
  },
} as const;

export type ChartInstanceIdValue =
  | (typeof ChartInstanceId.PmvAshrae)[keyof typeof ChartInstanceId.PmvAshrae]
  | (typeof ChartInstanceId.PmvIso)[keyof typeof ChartInstanceId.PmvIso]
  | (typeof ChartInstanceId.Utci)[keyof typeof ChartInstanceId.Utci]
  | (typeof ChartInstanceId.AdaptiveAshrae)[keyof typeof ChartInstanceId.AdaptiveAshrae]
  | (typeof ChartInstanceId.AdaptiveEn)[keyof typeof ChartInstanceId.AdaptiveEn]
  | (typeof ChartInstanceId.HeatIndex)[keyof typeof ChartInstanceId.HeatIndex]
  | (typeof ChartInstanceId.Humidex)[keyof typeof ChartInstanceId.Humidex]
  | (typeof ChartInstanceId.WindChill)[keyof typeof ChartInstanceId.WindChill]
  | (typeof ChartInstanceId.Phs2023)[keyof typeof ChartInstanceId.Phs2023];

const chartInstanceIdsByModel: Record<ComfortModelType, readonly string[]> = {
  [ComfortModel.PmvAshrae]: Object.values(ChartInstanceId.PmvAshrae),
  [ComfortModel.PmvIso]: Object.values(ChartInstanceId.PmvIso),
  [ComfortModel.Utci]: Object.values(ChartInstanceId.Utci),
  [ComfortModel.AdaptiveAshrae]: Object.values(ChartInstanceId.AdaptiveAshrae),
  [ComfortModel.AdaptiveEn]: Object.values(ChartInstanceId.AdaptiveEn),
  [ComfortModel.HeatIndex]: Object.values(ChartInstanceId.HeatIndex),
  [ComfortModel.Humidex]: Object.values(ChartInstanceId.Humidex),
  [ComfortModel.WindChill]: Object.values(ChartInstanceId.WindChill),
  [ComfortModel.Phs2023]: Object.values(ChartInstanceId.Phs2023),
};

export function getRegisteredChartInstanceIds(
  modelId: ComfortModelType,
): readonly string[] {
  return chartInstanceIdsByModel[modelId];
}

export function isRegisteredChartInstanceId(
  modelId: ComfortModelType,
  instanceId: string,
): boolean {
  return chartInstanceIdsByModel[modelId].includes(instanceId);
}

export interface ChartInstanceDeclaration {
  readonly instanceId: string;
  readonly kind: ChartKind;
  readonly name: string;
  readonly emptyMessage: string;
  readonly note?: string;
  readonly capabilities?: Partial<ChartInstanceCapabilities>;
  readonly spec: unknown;
}

export interface ModelChartInstances {
  readonly defaultInstanceId: string;
  readonly entries: readonly ChartInstanceDeclaration[];
}
