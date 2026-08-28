import {
  ModelId,
  type ModelId as ModelIdType,
} from "../../catalog/modelIds";
import type {
  RuntimeComfortModelDefinition,
  SimulationOutputDeclaration,
} from "./definition";
import { pmvAshraeModelConfig } from "../../declarations/pmv/ashrae";
import { pmvIsoModelConfig } from "../../declarations/pmv/iso";
import { utciModelConfig } from "../../declarations/utci/utci";
import { adaptiveAshraeModelConfig } from "../../declarations/adaptive/ashrae";
import { adaptiveEnModelConfig } from "../../declarations/adaptive/en";
import { heatIndexModelConfig } from "../../declarations/heatIndex";
import { humidexModelConfig } from "../../declarations/humidex";
import { windChillModelConfig } from "../../declarations/windChill";
import { phsModelConfig } from "../../declarations/phs/phs";
import {
  SurfaceId,
  type StandardId as StandardIdType,
  type SurfaceId as SurfaceIdType,
} from "../../catalog/surfaces";
import {
  assembleCatalogs,
  validateModel,
} from "./validateModel";
export { assembleCatalogs, validateModel };
export type { AssembledCatalogs, CatalogModelSlice } from "./validateModel";

export const comfortModelConfigs: Record<
  ModelIdType,
  RuntimeComfortModelDefinition
> = {
  [ModelId.PmvAshrae]: pmvAshraeModelConfig,
  [ModelId.PmvIso]: pmvIsoModelConfig,
  [ModelId.Utci]: utciModelConfig,
  [ModelId.AdaptiveAshrae]: adaptiveAshraeModelConfig,
  [ModelId.AdaptiveEn]: adaptiveEnModelConfig,
  [ModelId.HeatIndex]: heatIndexModelConfig,
  [ModelId.Humidex]: humidexModelConfig,
  [ModelId.WindChill]: windChillModelConfig,
  [ModelId.Phs2023]: phsModelConfig,
} as const;

export function getDeclaredChartInstanceIds(
  modelId: ModelIdType,
): readonly string[] {
  return comfortModelConfigs[modelId].chartInstances.entries.map(
    ({ instanceId }) => instanceId,
  );
}

export const assembledCatalogs = assembleCatalogs(
  Object.values(comfortModelConfigs),
);

export const comfortModelOrder = Object.keys(
  comfortModelConfigs,
) as ModelIdType[];

export const comfortModelMetaById = Object.fromEntries(
  Object.entries(comfortModelConfigs).map(([id, config]) => [
    id,
    { label: config.label, description: config.description },
  ]),
);

export function getComfortModelConfig(
  modelId: ModelIdType,
): RuntimeComfortModelDefinition {
  return comfortModelConfigs[modelId];
}

export function getModelsForStandard(
  standardId: StandardIdType,
): ModelIdType[] {
  return comfortModelOrder.filter((modelId) =>
    comfortModelConfigs[modelId].standardIds.includes(standardId),
  );
}

export function getModelsForSurface(
  surfaceId: SurfaceIdType,
): ModelIdType[] {
  return comfortModelOrder.filter((modelId) => {
    const config = comfortModelConfigs[modelId];
    switch (surfaceId) {
      case SurfaceId.Standard:
        return config.surfaceCapabilities.includes(SurfaceId.Standard);
      case SurfaceId.Explore:
        return config.surfaceCapabilities.includes(SurfaceId.Explore);
      case SurfaceId.TimeSeries:
        return config.tables.timeSeries !== undefined;
      default: {
        const exhaustive: never = surfaceId;
        throw new Error(`Unsupported surface: ${exhaustive}`);
      }
    }
  });
}

export function getModelSimulationOutput(
  modelId: ModelIdType,
): SimulationOutputDeclaration | undefined {
  return comfortModelConfigs[modelId].simulation;
}
