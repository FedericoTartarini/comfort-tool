import { ModelId, type ModelId as ModelIdType } from "../../catalog/modelIds";
import {
  StandardId,
  SurfaceId,
  type AppRouteId as AppRouteIdType,
  type StandardId as StandardIdType,
  type SurfaceId as SurfaceIdType,
} from "../../catalog/surfaces";
import {
  getModelsForSurface,
  getModelsForStandard,
} from "../analysis/modelConfigs";

export interface AppRouteDefinition {
  readonly id: AppRouteIdType;
  readonly label: string;
  readonly path: string;
  readonly workspace: SurfaceIdType;
  readonly standardId?: StandardIdType;
  readonly defaultModelId?: ModelIdType;
  readonly shareEnabled: boolean;
}

export interface ParsedAppLocation {
  readonly definition: AppRouteDefinition;
  readonly modelId?: ModelIdType;
}

function standardRootPath<T extends StandardIdType>(
  standardId: T,
): `/standard/${T}/` {
  return `/standard/${standardId}/`;
}

export const appRouteDefinitions = [
  {
    id: StandardId.Ashrae55,
    label: "ASHRAE 55",
    path: standardRootPath(StandardId.Ashrae55),
    workspace: SurfaceId.Standard,
    standardId: StandardId.Ashrae55,
    defaultModelId: ModelId.PmvAshrae,
    shareEnabled: true,
  },
  {
    id: StandardId.Iso7730,
    label: "ISO 7730",
    path: standardRootPath(StandardId.Iso7730),
    workspace: SurfaceId.Standard,
    standardId: StandardId.Iso7730,
    defaultModelId: ModelId.PmvIso,
    shareEnabled: true,
  },
  {
    id: StandardId.En16798,
    label: "EN 16798-1",
    path: standardRootPath(StandardId.En16798),
    workspace: SurfaceId.Standard,
    standardId: StandardId.En16798,
    defaultModelId: ModelId.AdaptiveEn,
    shareEnabled: true,
  },
  {
    id: StandardId.Iso7933,
    label: "ISO 7933:2023",
    path: standardRootPath(StandardId.Iso7933),
    workspace: SurfaceId.Standard,
    standardId: StandardId.Iso7933,
    defaultModelId: ModelId.Phs2023,
    shareEnabled: true,
  },
  {
    id: SurfaceId.Explore,
    label: "Explore",
    path: "/explore/",
    workspace: SurfaceId.Explore,
    defaultModelId: ModelId.PmvAshrae,
    shareEnabled: true,
  },
  {
    id: SurfaceId.TimeSeries,
    label: "Time-series",
    path: "/time-series/",
    workspace: SurfaceId.TimeSeries,
    defaultModelId: ModelId.Phs2023,
    shareEnabled: false,
  },
] as const satisfies readonly AppRouteDefinition[];

export const standardRouteDefinitions = appRouteDefinitions.filter(
  (definition) => definition.workspace === SurfaceId.Standard,
);

export const defaultAppRoute = appRouteDefinitions[0];

const modelIdValues = new Set<string>(Object.values(ModelId));
const standardIdValues = new Set<string>(Object.values(StandardId));
const surfaceIdValues = new Set<string>(Object.values(SurfaceId));

function pathSegments(pathname: string): string[] {
  return pathname.split("/").filter((segment) => segment.length > 0);
}

function asSurfaceId(segment: string): SurfaceIdType | undefined {
  const lower = segment.toLowerCase();
  return surfaceIdValues.has(lower) ? lower as SurfaceIdType : undefined;
}

function asStandardId(segment: string): StandardIdType | undefined {
  const lower = segment.toLowerCase();
  return standardIdValues.has(lower) ? lower as StandardIdType : undefined;
}

function getDefinitionByStandardId(
  standardId: StandardIdType,
): AppRouteDefinition | undefined {
  return appRouteDefinitions.find(
    (definition: AppRouteDefinition) => definition.standardId === standardId,
  );
}

function getDefinitionByWorkspace(
  workspace: SurfaceIdType,
): AppRouteDefinition | undefined {
  return appRouteDefinitions.find(
    (definition: AppRouteDefinition) =>
      definition.workspace === workspace && !definition.standardId,
  );
}

function asAllowedModelId(
  definition: AppRouteDefinition,
  slug: string,
): ModelIdType | undefined {
  const lower = slug.toLowerCase();
  if (!modelIdValues.has(lower)) {
    return undefined;
  }
  const modelId = lower as ModelIdType;
  return getAllowedModels(definition).includes(modelId) ? modelId : undefined;
}

function parseStandardLocation(
  segments: string[],
): ParsedAppLocation | undefined {
  if (segments.length === 1) {
    return { definition: defaultAppRoute };
  }

  const standardId = asStandardId(segments[1]);
  if (!standardId) {
    return undefined;
  }
  const definition = getDefinitionByStandardId(standardId);
  if (!definition) {
    return undefined;
  }
  if (segments.length === 2) {
    return { definition };
  }
  if (segments.length !== 3) {
    return undefined;
  }
  const modelId = asAllowedModelId(definition, segments[2]);
  if (!modelId) {
    return undefined;
  }
  return { definition, modelId };
}

function parseWorkspaceModelLocation(
  definition: AppRouteDefinition,
  segments: string[],
): ParsedAppLocation | undefined {
  if (segments.length === 1) {
    return { definition };
  }
  if (segments.length !== 2) {
    return undefined;
  }
  const modelId = asAllowedModelId(definition, segments[1]);
  if (!modelId) {
    return undefined;
  }
  return { definition, modelId };
}

export function parseAppLocation(pathname: string): ParsedAppLocation | undefined {
  const segments = pathSegments(pathname);
  if (segments.length === 0) {
    return undefined;
  }

  const workspace = asSurfaceId(segments[0]);
  if (!workspace) {
    return undefined;
  }

  if (workspace === SurfaceId.Standard) {
    return parseStandardLocation(segments);
  }

  const definition = getDefinitionByWorkspace(workspace);
  if (!definition) {
    return undefined;
  }
  return parseWorkspaceModelLocation(definition, segments);
}

export function isMalformedAppPath(pathname: string): boolean {
  const segments = pathSegments(pathname);
  if (segments.length === 0) {
    return false;
  }
  return Boolean(asSurfaceId(segments[0]) && !parseAppLocation(pathname));
}

export function getAppRouteByPath(pathname: string): AppRouteDefinition | undefined {
  return parseAppLocation(pathname)?.definition;
}

export function buildCalculationPath(
  definition: AppRouteDefinition,
  modelId: ModelIdType,
): string {
  if (definition.standardId) {
    return `/standard/${definition.standardId}/${modelId}/`;
  }
  return `${definition.path}${modelId}/`;
}

export function buildCanonicalPathname(
  pathname: string,
  selectedModel: ModelIdType,
): string | undefined {
  const parsed = parseAppLocation(pathname);
  if (!parsed) {
    return undefined;
  }
  const { definition } = parsed;
  if (!definition.defaultModelId) {
    return definition.path;
  }
  const allowedModels = getAllowedModels(definition);
  const modelId = parsed.modelId
    ?? (allowedModels.includes(selectedModel)
      ? selectedModel
      : definition.defaultModelId);
  return buildCalculationPath(definition, modelId);
}

export function getAllowedModels(definition: AppRouteDefinition): ModelIdType[] {
  if (definition.standardId) {
    return getModelsForStandard(definition.standardId);
  }
  if (definition.workspace === SurfaceId.Explore) {
    return getModelsForSurface(SurfaceId.Explore);
  }
  if (definition.workspace === SurfaceId.TimeSeries) {
    return getModelsForSurface(SurfaceId.TimeSeries);
  }
  return [];
}

export function isCalculationRoute(
  definition: AppRouteDefinition | undefined,
): definition is AppRouteDefinition & {
  workspace: typeof SurfaceId.Standard | typeof SurfaceId.Explore;
  defaultModelId: ModelIdType;
} {
  return Boolean(
    definition
    && definition.defaultModelId
    && (definition.workspace === SurfaceId.Standard || definition.workspace === SurfaceId.Explore),
  );
}

export function isTimeSeriesRoute(
  definition: AppRouteDefinition | undefined,
): definition is AppRouteDefinition & {
  workspace: typeof SurfaceId.TimeSeries;
  defaultModelId: ModelIdType;
} {
  return Boolean(
    definition
    && definition.defaultModelId
    && definition.workspace === SurfaceId.TimeSeries
  );
}
