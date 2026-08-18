import { phsTimeSeriesModelDefinition } from "../../comfortModels/phsTimeSeries";
import { ComfortModel } from "../../models/comfortModels";
import type { RuntimeTimeSeriesModelDefinition } from "../../models/timeSeries";

export const timeSeriesModelConfigs = {
  [ComfortModel.Phs2023]: phsTimeSeriesModelDefinition,
} as const;

export type TimeSeriesModelId = keyof typeof timeSeriesModelConfigs;

export const timeSeriesModelOrder = Object.keys(
  timeSeriesModelConfigs,
) as TimeSeriesModelId[];

export function getTimeSeriesModelConfig(
  modelId: TimeSeriesModelId,
): RuntimeTimeSeriesModelDefinition {
  return timeSeriesModelConfigs[modelId] as RuntimeTimeSeriesModelDefinition;
}
