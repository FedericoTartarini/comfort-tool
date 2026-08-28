import { type ModelId as ModelIdType } from "../../../catalog/modelIds";
import {
  ChartType,
  isChartType,
  modelAllowsPsychrometricCharts,
} from "../../../catalog/chartTypes";
import {
  TableType,
  type ModelTables,
} from "../../../catalog/tableTypes";
import {
  supportsTimeSeriesWorkspace,
  type WorkspaceId,
} from "../../../catalog/workspaces";
import {
  mergeQuantityCatalog,
  PhysicalQuantityScope,
  primaryInputOrder,
  systemQuantityMetaById,
  type PhysicalQuantityMeta,
  type QuantityExtension,
} from "../../../catalog/quantities";

/**
 * Contribution slice that assembled catalogs can check. This is not a second
 * authoring API — declarations still go through `defineModel` and registry
 * registration.
 */
export interface CatalogModelSlice {
  readonly id: ModelIdType;
  readonly quantities: {
    readonly extend: readonly QuantityExtension[];
  };
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
  readonly workspaceCapabilities: readonly WorkspaceId[];
}

export interface AssembledCatalogs {
  readonly quantities: Readonly<Record<string, PhysicalQuantityMeta>>;
  readonly chartInstanceOwners: ReadonlyMap<string, ModelIdType>;
  readonly chartTypes: ReadonlySet<string>;
  readonly tableTypes: ReadonlySet<string>;
  /**
   * Optional catalog hook. `assembleCatalogs` installs `validate.model` on the
   * returned instance; the type stays optional so this is not a required
   * authoring API.
   */
  readonly validate?: {
    readonly model?: (model: CatalogModelSlice) => void;
  };
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

export function collectRegisteredQuantityExtensions(
  configs: Iterable<Pick<CatalogModelSlice, "id" | "quantities">>,
): QuantityExtension[] {
  const extensions: QuantityExtension[] = [];
  for (const config of configs) {
    for (const extension of config.quantities.extend) {
      if (extension.owner !== config.id) {
        throw new Error(
          `Quantity extension "${extension.id}" is owned by ${extension.owner} but registered on ${config.id}.`,
        );
      }
      extensions.push(extension);
    }
  }
  return extensions;
}

/**
 * Checks one model contribution against assembled catalogs. Duplicate ids,
 * wrong owners, unknown chart types, and a TimeSeries table without Time-series
 * capability fail.
 */
export function validateModel(
  model: CatalogModelSlice,
  catalogs: AssembledCatalogs,
): void {
  const seenQuantityIds = new Set<string>();
  for (const extension of model.quantities.extend) {
    if (extension.owner !== model.id) {
      throw new Error(
        `Quantity extension "${extension.id}" is owned by ${extension.owner} but registered on ${model.id}.`,
      );
    }
    if (seenQuantityIds.has(extension.id)) {
      throw new Error(`Duplicate quantity id "${extension.id}".`);
    }
    seenQuantityIds.add(extension.id);
    if (primaryInputOrder.some((id) => id === extension.id)) {
      throw new Error(
        `Extended quantity ${extension.id} must not enter primaryInputOrder.`,
      );
    }
    const existing = catalogs.quantities[extension.id];
    if (existing === undefined) continue;
    if (existing.scope === PhysicalQuantityScope.System) {
      throw new Error(`Duplicate quantity id "${extension.id}".`);
    }
    if (
      existing.ownerModelId !== undefined &&
      existing.ownerModelId !== model.id
    ) {
      throw new Error(
        `Quantity extension "${extension.id}" is owned by ${existing.ownerModelId} but registered on ${model.id}.`,
      );
    }
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
    if (type === ChartType.Psychrometric && !modelAllowsPsychrometricCharts(model.id)) {
      throw new Error(
        `Psychrometric chart "${registration.instanceId}" on ${model.id} is not allowed. Psychrometric is frontend-only for PMV geometry.`,
      );
    }
  }

  if (
    model.tables.timeSeries &&
    !supportsTimeSeriesWorkspace(model.workspaceCapabilities)
  ) {
    throw new Error(
      "tables.timeSeries is allowed only with Time-series workspace capability.",
    );
  }
}

/**
 * Assemble quantity and chart-owner catalogs from the models themselves.
 * Duplicate extend ids fail here via `mergeQuantityCatalog`; the returned
 * instance installs optional `validate.model`.
 */
export function assembleCatalogs(
  models: Iterable<CatalogModelSlice>,
): AssembledCatalogs {
  const modelList = [...models];
  const quantities = mergeQuantityCatalog(
    systemQuantityMetaById,
    collectRegisteredQuantityExtensions(modelList),
  );
  const { chartInstanceOwners } = indexChartOwners(modelList);
  const catalogs: AssembledCatalogs = {
    quantities,
    chartInstanceOwners,
    chartTypes: new Set<string>(Object.values(ChartType)),
    tableTypes: new Set<string>(Object.values(TableType)),
    validate: {
      model: (model) => {
        validateModel(model, catalogs);
      },
    },
  };
  for (const model of modelList) {
    catalogs.validate?.model?.(model);
  }
  return catalogs;
}
