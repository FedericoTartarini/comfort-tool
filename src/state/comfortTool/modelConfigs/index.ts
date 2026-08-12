import { ComfortModel, type ComfortModel as ComfortModelType } from "../../../models/comfortModels";
import type { RuntimeComfortModelDefinition } from "./definition";
import { pmvAshraeModelConfig } from "../../../comfortModels/pmvAshrae";
import { pmvIsoModelConfig } from "../../../comfortModels/pmvIso";
import { utciModelConfig } from "../../../comfortModels/utci";
import { adaptiveAshraeModelConfig } from "../../../comfortModels/adaptiveAshrae";
import { adaptiveEnModelConfig } from "../../../comfortModels/adaptiveEn";
import { heatIndexModelConfig } from "../../../comfortModels/heatIndex";
import { humidexModelConfig } from "../../../comfortModels/humidex";
import { windChillModelConfig } from "../../../comfortModels/windChill";
import { ChartMode } from "../../../models/modelCapabilities";
import type { StandardId as StandardIdType } from "../../../models/workspaces";

export const comfortModelConfigs: Record<ComfortModelType, RuntimeComfortModelDefinition> = {
  [ComfortModel.PmvAshrae]: pmvAshraeModelConfig,
  [ComfortModel.PmvIso]: pmvIsoModelConfig,
  [ComfortModel.Utci]: utciModelConfig,
  [ComfortModel.AdaptiveAshrae]: adaptiveAshraeModelConfig,
  [ComfortModel.AdaptiveEn]: adaptiveEnModelConfig,
  [ComfortModel.HeatIndex]: heatIndexModelConfig,
  [ComfortModel.Humidex]: humidexModelConfig,
  [ComfortModel.WindChill]: windChillModelConfig,
} as const;

export const comfortModelOrder = Object.keys(comfortModelConfigs) as ComfortModelType[];

export const comfortModelMetaById = Object.fromEntries(
  Object.entries(comfortModelConfigs).map(([id, config]) => [
    id,
    { label: config.label, description: config.description }
  ])
);

export function getComfortModelConfig(modelId: ComfortModelType): RuntimeComfortModelDefinition {
  return comfortModelConfigs[modelId];
}

export function getModelsForStandard(standardId: StandardIdType): ComfortModelType[] {
  return comfortModelOrder.filter((modelId) => (
    comfortModelConfigs[modelId].standardIds.includes(standardId)
  ));
}

export function getExploreModels(): ComfortModelType[] {
  return comfortModelOrder.filter((modelId) => (
    comfortModelConfigs[modelId].modes.includes(ChartMode.Explore)
  ));
}
