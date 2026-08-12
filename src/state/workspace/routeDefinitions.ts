import { ComfortModel, type ComfortModel as ComfortModelType } from "../../models/comfortModels";
import { ChartMode, type ChartMode as ChartModeType } from "../../models/modelCapabilities";
import {
  AppRouteId,
  StandardId,
  WorkspaceId,
  type AppRouteId as AppRouteIdType,
  type StandardId as StandardIdType,
  type WorkspaceId as WorkspaceIdType,
} from "../../models/workspaces";
import {
  getExploreModels,
  getModelsForStandard,
} from "../comfortTool/modelConfigs";

export interface AppRouteDefinition {
  readonly id: AppRouteIdType;
  readonly label: string;
  readonly path: string;
  readonly workspace: WorkspaceIdType;
  readonly standardId?: StandardIdType;
  readonly requiredMode?: ChartModeType;
  readonly defaultModelId?: ComfortModelType;
  readonly shareEnabled: boolean;
}

export const appRouteDefinitions = [
  {
    id: AppRouteId.Ashrae55,
    label: "ASHRAE 55",
    path: "/ASHRAE-55/",
    workspace: WorkspaceId.Standard,
    standardId: StandardId.Ashrae55,
    requiredMode: ChartMode.Compliance,
    defaultModelId: ComfortModel.PmvAshrae,
    shareEnabled: true,
  },
  {
    id: AppRouteId.Iso7730,
    label: "ISO 7730",
    path: "/ISO-7730/",
    workspace: WorkspaceId.Standard,
    standardId: StandardId.Iso7730,
    requiredMode: ChartMode.Compliance,
    defaultModelId: ComfortModel.PmvIso,
    shareEnabled: true,
  },
  {
    id: AppRouteId.En16798,
    label: "EN 16798-1",
    path: "/EN-16798-1/",
    workspace: WorkspaceId.Standard,
    standardId: StandardId.En16798,
    requiredMode: ChartMode.Compliance,
    defaultModelId: ComfortModel.AdaptiveEn,
    shareEnabled: true,
  },
  {
    id: AppRouteId.Explore,
    label: "Explore",
    path: "/Explore/",
    workspace: WorkspaceId.Explore,
    requiredMode: ChartMode.Explore,
    defaultModelId: ComfortModel.PmvAshrae,
    shareEnabled: true,
  },
  {
    id: AppRouteId.TimeSeries,
    label: "Time-series",
    path: "/Time-Series/",
    workspace: WorkspaceId.TimeSeries,
    shareEnabled: false,
  },
] as const satisfies readonly AppRouteDefinition[];

export const standardRouteDefinitions = appRouteDefinitions.filter(
  (definition) => definition.workspace === WorkspaceId.Standard,
);

export const defaultAppRoute = appRouteDefinitions[0];

export function getAppRouteByPath(pathname: string): AppRouteDefinition | undefined {
  const normalizedPath = pathname.endsWith("/") ? pathname : `${pathname}/`;
  const normalizedLowerPath = normalizedPath.toLowerCase();
  return appRouteDefinitions.find(
    (definition) => definition.path.toLowerCase() === normalizedLowerPath,
  );
}

export function getAllowedModels(definition: AppRouteDefinition): ComfortModelType[] {
  if (definition.standardId) {
    return getModelsForStandard(definition.standardId);
  }
  if (definition.workspace === WorkspaceId.Explore) {
    return getExploreModels();
  }
  return [];
}

export function isCalculationRoute(
  definition: AppRouteDefinition | undefined,
): definition is AppRouteDefinition & {
  requiredMode: ChartModeType;
  defaultModelId: ComfortModelType;
} {
  return Boolean(definition?.requiredMode && definition.defaultModelId);
}
