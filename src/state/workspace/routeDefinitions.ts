import { ModelId, type ModelId as ModelIdType } from "../../catalog/modelIds";
import {
  AppRouteId,
  StandardId,
  WorkspaceId,
  type AppRouteId as AppRouteIdType,
  type StandardId as StandardIdType,
  type WorkspaceId as WorkspaceIdType,
} from "../../catalog/workspaces";
import {
  getModelsForWorkspace,
  getModelsForStandard,
} from "../analysis/modelConfigs";

export interface AppRouteDefinition {
  readonly id: AppRouteIdType;
  readonly label: string;
  readonly path: string;
  readonly workspace: WorkspaceIdType;
  readonly standardId?: StandardIdType;
  readonly defaultModelId?: ModelIdType;
  readonly shareEnabled: boolean;
}

export const appRouteDefinitions = [
  {
    id: AppRouteId.Ashrae55,
    label: "ASHRAE 55",
    path: "/ASHRAE-55/",
    workspace: WorkspaceId.Standard,
    standardId: StandardId.Ashrae55,
    defaultModelId: ModelId.PmvAshrae,
    shareEnabled: true,
  },
  {
    id: AppRouteId.Iso7730,
    label: "ISO 7730",
    path: "/ISO-7730/",
    workspace: WorkspaceId.Standard,
    standardId: StandardId.Iso7730,
    defaultModelId: ModelId.PmvIso,
    shareEnabled: true,
  },
  {
    id: AppRouteId.En16798,
    label: "EN 16798-1",
    path: "/EN-16798-1/",
    workspace: WorkspaceId.Standard,
    standardId: StandardId.En16798,
    defaultModelId: ModelId.AdaptiveEn,
    shareEnabled: true,
  },
  {
    id: AppRouteId.Iso7933,
    label: "ISO 7933:2023",
    path: "/ISO-7933/",
    workspace: WorkspaceId.Standard,
    standardId: StandardId.Iso7933,
    defaultModelId: ModelId.Phs2023,
    shareEnabled: true,
  },
  {
    id: AppRouteId.Explore,
    label: "Explore",
    path: "/Explore/",
    workspace: WorkspaceId.Explore,
    defaultModelId: ModelId.PmvAshrae,
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

export function getAllowedModels(definition: AppRouteDefinition): ModelIdType[] {
  if (definition.standardId) {
    return getModelsForStandard(definition.standardId);
  }
  if (definition.workspace === WorkspaceId.Explore) {
    return getModelsForWorkspace(WorkspaceId.Explore);
  }
  return [];
}

export function isCalculationRoute(
  definition: AppRouteDefinition | undefined,
): definition is AppRouteDefinition & {
  workspace: typeof WorkspaceId.Standard | typeof WorkspaceId.Explore;
  defaultModelId: ModelIdType;
} {
  return Boolean(
    definition
    && definition.defaultModelId
    && (definition.workspace === WorkspaceId.Standard || definition.workspace === WorkspaceId.Explore),
  );
}
