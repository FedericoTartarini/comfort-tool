import { phsTimeSeriesModelDefinition } from "../../comfortModels/phs/phsTimeSeries";
import { ComfortModel } from "../../models/comfortModels";
import type { RuntimeTimeSeriesModelDefinition } from "../../models/timeSeries";

export const timeSeriesModelConfigs = {
  [ComfortModel.Phs2023]: phsTimeSeriesModelDefinition,
} as const;

export type TimeSeriesModelId = keyof typeof timeSeriesModelConfigs;

export const timeSeriesModelOrder = Object.keys(timeSeriesModelConfigs) as TimeSeriesModelId[];

export const timeSeriesModelMetaById = Object.fromEntries(
  timeSeriesModelOrder.map((modelId) => [modelId, {
    label: timeSeriesModelConfigs[modelId].label,
    description: timeSeriesModelConfigs[modelId].description,
  }]),
) as Record<TimeSeriesModelId, { label: string; description: string }>;

export function getTimeSeriesModelConfig(
  modelId: TimeSeriesModelId,
): RuntimeTimeSeriesModelDefinition {
  return timeSeriesModelConfigs[modelId] as unknown as RuntimeTimeSeriesModelDefinition;
}
