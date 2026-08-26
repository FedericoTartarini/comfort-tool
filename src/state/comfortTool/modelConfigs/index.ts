import {
  ModelId,
  type ModelId as ModelIdType,
} from "../../../models/comfortModels";
import type {
  RuntimeComfortModelDefinition,
  SimulationOutputDeclaration,
} from "./definition";
import { pmvAshraeModelConfig } from "../../../comfortModels/pmv/pmvAshrae";
import { pmvIsoModelConfig } from "../../../comfortModels/pmv/pmvIso";
import { utciModelConfig } from "../../../comfortModels/utci/utci";
import { adaptiveAshraeModelConfig } from "../../../comfortModels/adaptive/adaptiveAshrae";
import { adaptiveEnModelConfig } from "../../../comfortModels/adaptive/adaptiveEn";
import { heatIndexModelConfig } from "../../../comfortModels/heatIndex";
import { humidexModelConfig } from "../../../comfortModels/humidex";
import { windChillModelConfig } from "../../../comfortModels/windChill";
import { phsModelConfig } from "../../../comfortModels/phs/phs";
import {
  WorkspaceId,
  type StandardId as StandardIdType,
  type WorkspaceId as WorkspaceIdType,
} from "../../../models/workspaces";
import { assembleQuantityCatalog } from "../../../models/physicalQuantities";
import {
  assembleCatalogs,
  collectRegisteredQuantityExtensions,
  validateModel,
} from "./validateModel";
export { assembleCatalogs, collectRegisteredQuantityExtensions, validateModel };
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
  return comfortModelConfigs[modelId].outputCharts.entries.map(
    ({ instanceId }) => instanceId,
  );
}

assembleQuantityCatalog(
  collectRegisteredQuantityExtensions(Object.values(comfortModelConfigs)),
);

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

export function getModelsForWorkspace(
  workspaceId: WorkspaceIdType,
): ModelIdType[] {
  return comfortModelOrder.filter((modelId) => {
    const capabilities = comfortModelConfigs[modelId].workspaceCapabilities;
    switch (workspaceId) {
      case WorkspaceId.Standard:
        return capabilities.includes(WorkspaceId.Standard);
      case WorkspaceId.Explore:
        return capabilities.includes(WorkspaceId.Explore);
      case WorkspaceId.TimeSeries:
        return false;
      default: {
        const exhaustive: never = workspaceId;
        throw new Error(`Unsupported workspace: ${exhaustive}`);
      }
    }
  });
}

export function getModelSimulationOutput(
  modelId: ModelIdType,
): SimulationOutputDeclaration | undefined {
  return comfortModelConfigs[modelId].simulation;
}
