import { type ModelId as ModelIdType } from "../../catalog/modelIds";
import {
  ChartType,
  isChartType,
} from "../../catalog/chartTypes";
import type { ModelTables } from "../../catalog/tableTypes";
import {
  supportsTimeSeriesSurface,
  type SurfaceId,
} from "../../catalog/surfaces";
import {
  isPhysicalQuantityId,
  physicalQuantityMetaById,
  resolveQuantityState,
  QuantityState,
  type PhysicalQuantityId as PhysicalQuantityIdType,
  type PhysicalQuantityMeta,
} from "../../catalog/quantities";

/**
 * Model slice that assembled catalogs can check. This is not a second
 * authoring API — declarations still go through `defineModel` and registry
 * registration.
 */
export interface CatalogModelSlice {
  readonly id: ModelIdType;
  readonly extraQuantities: readonly PhysicalQuantityIdType[];
  readonly chartInstances: {
    readonly entries: readonly {
      readonly instanceId: string;
      readonly type: string;
    }[];
  };
  readonly chartEngineRegistrations: readonly {
    readonly instanceId: string;
    readonly registration: { readonly type: string };
  }[];
  readonly tables: ModelTables;
  readonly surfaceCapabilities: readonly SurfaceId[];
}

export interface AssembledCatalogs {
  readonly quantities: Readonly<Record<string, PhysicalQuantityMeta>>;
  readonly chartInstanceOwners: ReadonlyMap<string, ModelIdType>;
  readonly chartTypes: ReadonlySet<string>;
}

function indexChartOwners(models: readonly CatalogModelSlice[]): {
  chartInstanceOwners: Map<string, ModelIdType>;
} {
  const chartInstanceOwners = new Map<string, ModelIdType>();

  for (const model of models) {
    const instanceIds = model.chartInstances.entries.map(
      ({ instanceId }) => instanceId,
    );
    if (instanceIds.length === 0) {
      throw new Error(`${model.id} must declare at least one chart instance.`);
    }
    if (new Set(instanceIds).size !== instanceIds.length) {
      throw new Error(`${model.id} declares duplicate chart instance IDs.`);
    }
    for (const instanceId of instanceIds) {
      const owner = chartInstanceOwners.get(instanceId);
      if (owner !== undefined) {
        throw new Error(
          `Chart instance ID "${instanceId}" is declared by both ${owner} and ${model.id}.`,
        );
      }
      chartInstanceOwners.set(instanceId, model.id);
    }
  }

  return { chartInstanceOwners };
}

/**
 * Checks one model against assembled catalogs. Unknown extra
 * quantity ids, unknown chart types, and a Time-series table without
 * Time-series capability fail.
 */
export function validateModel(
  model: CatalogModelSlice,
  catalogs: AssembledCatalogs,
): void {
  const seenExtraIds = new Set<string>();
  for (const quantityId of model.extraQuantities) {
    if (!isPhysicalQuantityId(quantityId) || catalogs.quantities[quantityId] === undefined) {
      throw new Error(
        `Unknown extra quantity "${String(quantityId)}" on ${model.id}. Extra quantities must be catalog Extra ids.`,
      );
    }
    if (resolveQuantityState(quantityId) !== QuantityState.Extra) {
      throw new Error(
        `Quantity "${quantityId}" on ${model.id} is not an Extra catalog quantity.`,
      );
    }
    if (seenExtraIds.has(quantityId)) {
      throw new Error(`${model.id} declares duplicate extra quantity "${quantityId}".`);
    }
    seenExtraIds.add(quantityId);
  }

  const seenInstanceIds = new Set<string>();
  const seenTypes = new Set<string>();
  for (const entry of model.chartInstances.entries) {
    if (!catalogs.chartTypes.has(entry.type) || !isChartType(entry.type)) {
      throw new Error(
        `Unknown chart type "${String(entry.type)}". ChartType is a closed set.`,
      );
    }
    if (seenInstanceIds.has(entry.instanceId)) {
      throw new Error(`${model.id} declares duplicate chart instance IDs.`);
    }
    seenInstanceIds.add(entry.instanceId);
    const instanceOwner = catalogs.chartInstanceOwners.get(entry.instanceId);
    if (instanceOwner !== undefined && instanceOwner !== model.id) {
      throw new Error(
        `Chart instance ID "${entry.instanceId}" is declared by both ${instanceOwner} and ${model.id}.`,
      );
    }
    if (seenTypes.has(entry.type)) {
      throw new Error(
        `Comfort model declarations cannot contain duplicate chart types (${entry.type}).`,
      );
    }
    seenTypes.add(entry.type);
  }

  for (const registration of model.chartEngineRegistrations) {
    const type = registration.registration.type;
    if (!catalogs.chartTypes.has(type) || !isChartType(type)) {
      throw new Error(
        `Unknown chart type "${String(type)}". ChartType is a closed set.`,
      );
    }
  }

  if (
    model.tables.timeSeries &&
    !supportsTimeSeriesSurface(model.surfaceCapabilities)
  ) {
    throw new Error(
      "tables.timeSeries is allowed only with Time-series workspace capability.",
    );
  }

  if (model.tables.results.length === 0) {
    throw new Error("tables.results requires at least one row.");
  }
  if (model.tables.timeSeries && model.tables.timeSeries.length === 0) {
    throw new Error("tables.timeSeries requires at least one row.");
  }
}

/**
 * Assemble chart-owner catalogs from the models themselves. Quantity metadata
 * is the closed catalog in quantities.ts. Each model is checked with
 * `validateModel` during assemble.
 */
export function assembleCatalogs(
  models: Iterable<CatalogModelSlice>,
): AssembledCatalogs {
  const modelList = [...models];
  const { chartInstanceOwners } = indexChartOwners(modelList);
  const catalogs: AssembledCatalogs = {
    quantities: physicalQuantityMetaById,
    chartInstanceOwners,
    chartTypes: new Set<string>(Object.values(ChartType)),
  };
  for (const model of modelList) {
    validateModel(model, catalogs);
  }
  return catalogs;
}
