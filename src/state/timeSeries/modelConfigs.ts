import { phsTimeSeriesModelDefinition } from "../../comfortModels/phs/timeSeries";
import { ModelId, type ModelId as ModelIdType } from "../../models/modelIds";
import type { RuntimeTimeSeriesModelDefinition } from "../../models/timeSeries";
import {
  comfortModelConfigs,
  comfortModelOrder,
} from "../analysis/modelConfigs";

const timeSeriesSimulators = {
  [ModelId.Phs2023]: phsTimeSeriesModelDefinition,
} as const;

const declaredTimeSeriesModelIds = comfortModelOrder.filter(
  (modelId) => comfortModelConfigs[modelId].tables.timeSeries !== undefined,
);

for (const modelId of declaredTimeSeriesModelIds) {
  if (!(modelId in timeSeriesSimulators)) {
    throw new Error(
      `Model ${modelId} declares tables.timeSeries but has no Time-series simulator. Declaring the table does not create a simulator.`,
    );
  }
}

for (const modelId of Object.keys(timeSeriesSimulators) as Array<keyof typeof timeSeriesSimulators>) {
  if (comfortModelConfigs[modelId].tables.timeSeries === undefined) {
    throw new Error(
      `Time-series simulator for ${modelId} requires tables.timeSeries on the model declaration.`,
    );
  }
}

export const timeSeriesModelOrder = declaredTimeSeriesModelIds as Array<
  keyof typeof timeSeriesSimulators
>;

export type TimeSeriesModelId = (typeof timeSeriesModelOrder)[number];

export const timeSeriesModelMetaById = Object.fromEntries(
  timeSeriesModelOrder.map((modelId) => {
    const simulator = timeSeriesSimulators[modelId];
    return [modelId, {
      label: simulator.label,
      description: simulator.description,
    }];
  }),
) as Record<TimeSeriesModelId, { label: string; description: string }>;

export function getTimeSeriesModelConfig(
  modelId: TimeSeriesModelId,
): RuntimeTimeSeriesModelDefinition {
  const declaration = comfortModelConfigs[modelId as ModelIdType];
  if (declaration.tables.timeSeries === undefined) {
    throw new Error(`${modelId} is not a Time-series model (missing tables.timeSeries).`);
  }
  const simulator = timeSeriesSimulators[modelId];
  if (!simulator) {
    throw new Error(
      `Declaring tables.timeSeries does not create a simulator for ${modelId}.`,
    );
  }
  return simulator as unknown as RuntimeTimeSeriesModelDefinition;
}
