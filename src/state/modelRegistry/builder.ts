import {
  InputId,
  inputOrder,
  type InputId as InputIdType,
} from "../../catalog/inputSlots";
import type { ModelOptionsState, ResultCellViewModel } from "../pointSession/types";
import type {
  ComfortModelDefinition,
  DynamicAxisDefaults,
  ModelOptionChangeHandler,
  RuntimeComfortModelDefinition,
  RuntimeTimeSeriesFeature,
  SimulationOutputDeclaration,
} from "./definition";
import type { ModelId as ModelIdType } from "../../catalog/modelIds";
import type { OptionKey as OptionKeyType } from "../../catalog/inputModes";
import type { InputControlDefinition } from "../../engines/comfort/controls/types";
import {
  declaredSiRangeForInputField,
  primaryQuantityIdsForInputField,
  resolveAuthoringInputField,
  resolveInputField,
  type AuthoringInputField,
  type InputFieldSpec,
} from "../../engines/comfort/controls/fieldInputBehaviors";
import {
  type StandardId as StandardIdType,
} from "../../catalog/surfaces";
import {
  numericBandFromToken,
  type Band,
  type ChartBuildContext,
  type ComplianceSpec,
  type ModelOutput,
  type NumericBand,
} from "../../catalog/modelCapabilities";
import {
  cloneNumericBands,
  validateNumericBands,
} from "../../engines/comfort/charts/bands";
import {
  PhysicalQuantityId,
  getPhysicalQuantityMeta,
  isDerivedHumidityQuantityId,
  isPhysicalQuantityId,
  type QuantityState,
} from "../../catalog/quantities";
import {
  inputModifierCatalogue,
  modifierOrder,
  type InputModifier,
} from "../../catalog/inputModifiers";
import {
  ChartType,
  chartTypeLabel,
  isChartType,
  resolveChartCapabilities,
  type ChartInstanceDeclaration,
} from "../../catalog/chartTypes";
import {
  type ModelTables,
  type ModelTablesAuthoring,
  type TableCellContext,
  type TableRowAuthoring,
  type TableRowSpec,
} from "../../catalog/tableTypes";
import { resolveChartBuildResult } from "../../engines/comfort/charts/kinds/index";
import {
  dynamicAxisPool,
  isBandScalarDataSpec,
  isBoundaryRegionDataSpec,
  isDynamicFieldGridSpec,
  isParametricLineDataSpec,
  isPsychrometricDataSpec,
  modelChartSpecMatchesType,
  type ChartEngineRegistration,
  type DynamicFieldGridSpec,
  type FrontendChartDeclaration,
  type RegisteredChartEngineSpec,
} from "../../engines/comfort/charts/kinds/types";
import {
  calculateFromLibrary,
  invokeMappedLibrary,
  quantityStateAxisAdapter,
  type ChartInputMapper,
  type ChartSourceBuilder,
  type JsModelFn,
  type LibraryInvokeFn,
} from "../../engines/comfort/libraryInvoke";
import { buildCompareMatrixTable } from "../../engines/comfort/output/tableResolver";
import type { ChartRange } from "../../engines/comfort/charts/types";
import {
  displayClassifierLabel,
  numericBandsFromInterval,
  tokenRowForValue,
  type LibraryInterval,
} from "../../catalog/classifierBins";
import { resolveZoneAppearance, ZoneToken } from "../../catalog/zoneTokens";
import {
  toAuthoringInputField,
  type QuantityInputBind,
  type QuantityResultBind,
} from "../../engines/comfort/libraryBinds";
import { compileModelTables, compileTableRow } from "../../engines/comfort/output/compileTableRows";

export {
  inputQuantity,
  quantityRow,
  resultQuantity,
} from "../../engines/comfort/libraryBinds";
export {
  intervalFromBands,
  intervalFromBins,
  intervalFromBounds,
  intervalFromOffsets,
} from "../../catalog/classifierBins";

export type { FrontendChartDeclaration };
export type { ModelAuthoring as ModelDeclaration };

export type JsModelLibrary = {
  readonly label: string;
  readonly description: string;
};

export type ResultRowDefinition<T> = {
  title: string;
  group?: string;
  formatter: (
    result: T,
    unitSystem?: unknown,
    context?: TableCellContext,
  ) => ResultCellViewModel;
};

interface RegisteredChart<ChartSourceType = unknown> {
  readonly declaration: ChartInstanceDeclaration;
  readonly registration: ChartEngineRegistration<QuantityState, ChartSourceType>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns true only when a record has the complete declared key set and no extras. */
export function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value);
  const expected = new Set(expectedKeys);
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key) => expected.has(key))
  );
}

/** Strict parser for models whose complete options schema is an empty object. */
export function parseEmptyOptions(value: unknown): ModelOptionsState | null {
  return isRecord(value) && hasExactKeys(value, []) ? {} : null;
}

export function createEmptyResults<T>(): Record<InputIdType, T | null> {
  return inputOrder.reduce(
    (acc, inputId) => {
      acc[inputId] = null;
      return acc;
    },
    {} as Record<InputIdType, T | null>,
  );
}

function toRegisteredChartBindSpec<ChartSourceType>(
  entry: FrontendChartDeclaration<ChartSourceType>,
): RegisteredChartEngineSpec<QuantityState, ChartSourceType> {
  if (!isChartType(entry.type)) {
    throw new Error(
      `Unknown chart type "${String(entry.type)}". ChartType is a closed set.`,
    );
  }
  return { type: entry.type, spec: entry.spec } as RegisteredChartEngineSpec<
    QuantityState,
    ChartSourceType
  >;
}

function derivedChartTitle(
  entry: { type: ChartType; titlePrefix?: string | null },
  modelLabel: string,
): string {
  const typeLabel = chartTypeLabel[entry.type];
  if (entry.titlePrefix === null) {
    return typeLabel;
  }
  const prefix = entry.titlePrefix ?? modelLabel;
  return `${prefix} ${typeLabel}`.trim();
}

function derivedEmptyMessage(entry: {
  type: ChartType;
  emptyMessage?: string;
}): string {
  return entry.emptyMessage ?? `No ${chartTypeLabel[entry.type]} chart yet.`;
}

function createChartEngineRegistration<ChartSourceType>(
  entry: FrontendChartDeclaration<ChartSourceType>,
  instanceId: string,
  emptyMessage: string,
): ChartEngineRegistration<QuantityState, ChartSourceType> {
  return {
    instanceId,
    type: entry.type,
    emptyMessage,
    ...(entry.note ? { note: entry.note } : {}),
    ...(entry.supportedExploreOutputs
      ? { supportedExploreOutputs: [...entry.supportedExploreOutputs] }
      : {}),
    ...(entry.defaultExploreOutput
      ? { defaultExploreOutput: entry.defaultExploreOutput }
      : {}),
    registration: toRegisteredChartBindSpec(entry),
  };
}

function createChartInstanceDeclaration<ChartSourceType>(
  entry: FrontendChartDeclaration<ChartSourceType>,
  instanceId: string,
  emptyMessage: string,
): ChartInstanceDeclaration {
  return {
    instanceId,
    type: entry.type,
    emptyMessage,
    ...(entry.note ? { note: entry.note } : {}),
    ...(entry.capabilities
      ? {
          capabilities: resolveChartCapabilities(
            entry.type,
            entry.capabilities,
          ),
        }
      : {}),
    ...(entry.supportedExploreOutputs
      ? { supportedExploreOutputs: [...entry.supportedExploreOutputs] }
      : {}),
    ...(entry.defaultExploreOutput
      ? { defaultExploreOutput: entry.defaultExploreOutput }
      : {}),
  };
}


/** Sequential `defineModel` input after six-section compile. Not a public API. */
interface AssembleParams<
  ChartSourceType = unknown,
  ComplianceBand extends Band = NumericBand,
> {
  readonly id: ModelIdType;
  readonly label: string;
  readonly description: string;
  readonly exploreMode: boolean;
  readonly standardIds: readonly StandardIdType[];
  readonly exploreOutputs: readonly ModelOutput[];
  readonly modifiers: readonly InputModifier[];
  readonly complianceProfile?: ComplianceSpec<ComplianceBand>;
  readonly inputFields: readonly AuthoringInputField[];
  readonly optionHandlersByKey: Partial<
    Record<OptionKeyType, ModelOptionChangeHandler>
  >;
  readonly tables: ModelTablesAuthoring;
  readonly charts: readonly FrontendChartDeclaration<ChartSourceType>[];
  readonly defaultOptions: Partial<Record<OptionKeyType, string>>;
  readonly parseOptions: (value: unknown) => ModelOptionsState | null;
  readonly calculate: ComfortModelDefinition<
    ChartSourceType,
    ComplianceBand
  >["calculate"];
  readonly timeSeries?: {
    readonly rows: readonly TableRowAuthoring[];
    readonly simulation: SimulationOutputDeclaration;
  };
  readonly dynamicAxisFields?: readonly PhysicalQuantityId[];
  readonly defaultDynamicAxes?: DynamicAxisDefaults;
}

function compileInputFields(fields: readonly AuthoringInputField[]): {
  controls: InputControlDefinition[];
  inputFieldSpecs: InputFieldSpec[];
} {
  const controls: InputControlDefinition[] = [];
  const inputFieldSpecs: InputFieldSpec[] = [];
  for (const field of fields) {
    const spec = resolveAuthoringInputField(field);
    for (const quantityId of primaryQuantityIdsForInputField(spec)) {
      declaredSiRangeForInputField(spec, quantityId);
    }
    inputFieldSpecs.push(spec);
    controls.push(resolveInputField(spec));
  }
  return { controls, inputFieldSpecs };
}

function finalizeChartEntry<ChartSourceType>(
  entry: FrontendChartDeclaration<ChartSourceType>,
  emptyMessage: string,
  modelLabel: string,
): FrontendChartDeclaration<ChartSourceType> {
  const title = derivedChartTitle(entry, modelLabel);
  if (entry.type === ChartType.Dynamic && isDynamicFieldGridSpec(entry.spec)) {
    const spec = entry.spec;
    const axes = spec.axes ?? {
      x: (spec.axisFields ?? [])[0]!,
      y: (spec.axisFields ?? [])[1]!,
    };
    return {
      ...entry,
      emptyMessage,
      spec: {
        ...spec,
        title: spec.title ?? title,
        axes,
        axisFields: dynamicAxisPool({ ...spec, axes }),
      },
    } as FrontendChartDeclaration<ChartSourceType>;
  }
  if (
    isPsychrometricDataSpec(entry.spec)
    || isBandScalarDataSpec(entry.spec)
    || isBoundaryRegionDataSpec(entry.spec)
    || isParametricLineDataSpec(entry.spec)
  ) {
    return {
      ...entry,
      emptyMessage,
      spec: {
        ...entry.spec,
        title: entry.spec.title ?? title,
      },
    } as FrontendChartDeclaration<ChartSourceType>;
  }
  return { ...entry, emptyMessage };
}

function compileRegisteredCharts<ChartSourceType>(
  entries: readonly FrontendChartDeclaration<ChartSourceType>[],
  modelLabel: string,
): {
  registeredCharts: RegisteredChart<ChartSourceType>[];
  defaultChartId: string;
} {
  if (entries.length === 0) {
    throw new Error(
      "Comfort model declarations require at least one output chart.",
    );
  }
  const registeredCharts: RegisteredChart<ChartSourceType>[] = [];
  for (const entry of entries) {
    if (!isChartType(entry.type)) {
      throw new Error(
        `Unknown chart type "${String(entry.type)}". ChartType is a closed set.`,
      );
    }
    if (!modelChartSpecMatchesType(entry)) {
      throw new Error(
        `Chart "${entry.type}" spec does not match type "${entry.type}".`,
      );
    }
    if (registeredCharts.some(({ declaration }) => declaration.type === entry.type)) {
      throw new Error(
        `Comfort model declarations cannot contain duplicate chart types (${entry.type}).`,
      );
    }
    const instanceId = entry.type;
    const emptyMessage = derivedEmptyMessage(entry);
    const finalized = finalizeChartEntry(entry, emptyMessage, modelLabel);
    registeredCharts.push({
      declaration: createChartInstanceDeclaration(
        finalized as FrontendChartDeclaration,
        instanceId,
        emptyMessage,
      ),
      registration: createChartEngineRegistration<ChartSourceType>(
        finalized,
        instanceId,
        emptyMessage,
      ),
    });
  }
  return {
    registeredCharts,
    defaultChartId: entries[0]!.type,
  };
}

function axisRangesFromInputFields(
  inputFieldSpecs: readonly InputFieldSpec[],
): Partial<Record<PhysicalQuantityId, ChartRange>> {
  const ranges: Partial<Record<PhysicalQuantityId, ChartRange>> = {};
  for (const spec of inputFieldSpecs) {
    for (const quantityId of primaryQuantityIdsForInputField(spec)) {
      const { minSi, maxSi } = declaredSiRangeForInputField(spec, quantityId);
      ranges[quantityId] = { min: minSi, max: maxSi };
    }
  }
  return ranges;
}

function injectDynamicGridResolvers<ChartSourceType>(
  registeredCharts: readonly RegisteredChart<ChartSourceType>[],
  exploreOutputs: readonly ModelOutput[],
  inputFieldSpecs: readonly InputFieldSpec[],
): void {
  const axisRanges = axisRangesFromInputFields(inputFieldSpecs);
  for (const chart of registeredCharts) {
    if (chart.registration.registration.type !== ChartType.Dynamic) {
      continue;
    }
    const spec = chart.registration.registration.spec;
    if (!isDynamicFieldGridSpec(spec)) {
      continue;
    }
    if (spec.resolveGridSpec) {
      const authoringResolve = spec.resolveGridSpec;
      Object.assign(spec, {
        resolveGridSpec: (context: ChartBuildContext) => {
          const resolved = authoringResolve(context);
          return {
            ...resolved,
            axisRanges: { ...axisRanges, ...resolved.axisRanges },
          };
        },
      });
      continue;
    }
    const authoring: DynamicFieldGridSpec<QuantityState> = spec;
    Object.assign(spec, {
      resolveGridSpec: (context: ChartBuildContext) => ({
        output: exploreOutputs[0]!,
        exploreOutputs,
        axisRanges: { ...axisRanges, ...authoring.axisRanges },
        requestAdapter: authoring.requestAdapter!,
        evaluate: authoring.evaluate!,
        getOutputValue: authoring.getOutputValue!,
        ...(authoring.tryEvaluatePayload
          ? { tryEvaluatePayload: authoring.tryEvaluatePayload }
          : {}),
        ...(authoring.chartAxisAdapter
          ? { chartAxisAdapter: authoring.chartAxisAdapter }
          : {}),
        ...(authoring.applyChartCoordinates
          ? { applyChartCoordinates: authoring.applyChartCoordinates }
          : {}),
        ...(authoring.dynamicHoverExtension
          ? { dynamicHoverExtension: authoring.dynamicHoverExtension }
          : {}),
        ...(authoring.gridPoints !== undefined
          ? { gridPoints: authoring.gridPoints }
          : {}),
        ...(authoring.dynamicViewLayout
          ? { dynamicViewLayout: authoring.dynamicViewLayout }
          : {}),
        ...(authoring.getIsolineValue
          ? { getIsolineValue: authoring.getIsolineValue }
          : {}),
        ...(authoring.isolineLayout
          ? { isolineLayout: authoring.isolineLayout }
          : context.fieldChartConfig.zOutput === PhysicalQuantityId.PredictedPercentageOfDissatisfied
            ? { isolineLayout: "radial" as const }
            : {}),
        ...(authoring.absFromThreshold
          ? { absFromThreshold: authoring.absFromThreshold }
          : {}),
        ...(authoring.clipAirSpeedWithoutOccupantControl !== undefined
          ? {
              clipAirSpeedWithoutOccupantControl:
                authoring.clipAirSpeedWithoutOccupantControl,
            }
          : {}),
        bandLabel: authoring.bandLabel
          ?? (context.fieldChartConfig.zOutput === PhysicalQuantityId.PredictedMeanVote
            ? "Zone"
            : "Band"),
      }),
    });
  }
}

function assertQuantityFields(inputFieldSpecs: readonly InputFieldSpec[]): void {
  const modifierInputIds = new Set<PhysicalQuantityId>(
    modifierOrder.flatMap((id) => [...inputModifierCatalogue[id].modifierInputs]),
  );
  for (const spec of inputFieldSpecs) {
    if (spec.kind !== "quantity") continue;
    if (!isPhysicalQuantityId(spec.quantityId)) {
      throw new Error(
        `quantity field ${String(spec.quantityId)} must reference a catalog quantity.`,
      );
    }
    if (isDerivedHumidityQuantityId(spec.quantityId)) {
      throw new Error(
        `quantity field ${spec.quantityId} cannot be a derived humidity slot.`,
      );
    }
    if (modifierInputIds.has(spec.quantityId)) {
      throw new Error(
        `quantity field ${spec.quantityId} cannot occupy a modifier input.`,
      );
    }
  }
}

function mergeDynamicAxisFields<ChartSourceType>(
  registeredCharts: readonly RegisteredChart<ChartSourceType>[],
  explicitFields: readonly PhysicalQuantityId[],
): readonly PhysicalQuantityId[] {
  if (new Set(explicitFields).size !== explicitFields.length) {
    throw new Error("Dynamic axis fields cannot contain duplicates.");
  }
  const registeredFields = registeredCharts.flatMap(({ registration }) => {
    const bind = registration.registration;
    if (bind.type === ChartType.Dynamic) {
      if (isDynamicFieldGridSpec(bind.spec)) {
        return [...dynamicAxisPool(bind.spec)];
      }
      if ("axisFields" in bind.spec && Array.isArray(bind.spec.axisFields)) {
        return [...bind.spec.axisFields];
      }
      return [];
    }
    if (
      bind.type === ChartType.Adaptive
      && "axisFields" in bind.spec
      && Array.isArray(bind.spec.axisFields)
    ) {
      return [...bind.spec.axisFields];
    }
    return [];
  });
  return [...new Set([...explicitFields, ...registeredFields])];
}

function deriveDefaultDynamicAxes<ChartSourceType>(
  registeredCharts: readonly RegisteredChart<ChartSourceType>[],
  fields: readonly PhysicalQuantityId[],
  authored: DynamicAxisDefaults | undefined,
): DynamicAxisDefaults | undefined {
  if (authored) {
    return authored;
  }
  for (const { registration } of registeredCharts) {
    const bind = registration.registration;
    if (bind.type === ChartType.Dynamic && isDynamicFieldGridSpec(bind.spec)) {
      return { xAxis: bind.spec.axes.x, yAxis: bind.spec.axes.y };
    }
    if (
      bind.type === ChartType.Adaptive
      && "axisFields" in bind.spec
      && Array.isArray(bind.spec.axisFields)
      && bind.spec.axisFields.length >= 2
    ) {
      return {
        xAxis: bind.spec.axisFields[0]!,
        yAxis: bind.spec.axisFields[1]!,
      };
    }
  }
  if (fields.length >= 2) {
    return { xAxis: fields[0]!, yAxis: fields[1]! };
  }
  return undefined;
}

function compileSimulation(
  timeSeries: AssembleParams["timeSeries"],
): {
  simulationOutput?: SimulationOutputDeclaration;
  timeSeriesRows?: readonly TableRowSpec[];
} {
  if (!timeSeries) {
    return {};
  }
  for (const chart of timeSeries.simulation.charts) {
    if (
      chart.type !== ChartType.BodyTemperature
      && chart.type !== ChartType.WaterLoss
    ) {
      throw new Error(
        `Simulation chart ${chart.id} must use ChartType.BodyTemperature or ChartType.WaterLoss.`,
      );
    }
  }
  return {
    simulationOutput: timeSeries.simulation,
    timeSeriesRows: timeSeries.rows?.map(compileTableRow),
  };
}

function assembleRuntime<
  ChartSourceType = unknown,
  ComplianceBand extends Band = NumericBand,
>(
  params: AssembleParams<ChartSourceType, ComplianceBand>,
): RuntimeComfortModelDefinition {
  const { controls, inputFieldSpecs } = compileInputFields(params.inputFields);
  const { registeredCharts, defaultChartId } = compileRegisteredCharts(
    params.charts,
    params.label,
  );
  const { simulationOutput, timeSeriesRows } = compileSimulation(params.timeSeries);
  const tables = compileModelTables(params.tables);

  const exploreMode = params.exploreMode;
  const exploreOutputs = params.exploreOutputs;
  const outputKeys = exploreOutputs.map((output) => output.key);
  if (new Set(outputKeys).size !== outputKeys.length) {
    throw new Error(
      "Comfort model declarations cannot contain duplicate output keys.",
    );
  }

  const modifiers = params.modifiers;
  const modifierIds = modifiers.map(({ id }) => id);
  if (new Set(modifierIds).size !== modifierIds.length) {
    throw new Error(
      "Comfort model declarations cannot contain duplicate modifiers.",
    );
  }
  const modifierPositions = modifierIds.map((modifierId) =>
    modifierOrder.indexOf(modifierId),
  );
  if (
    modifierPositions.some((position) => position < 0)
    || modifierPositions.some(
      (position, index) => index > 0 && position <= modifierPositions[index - 1],
    )
  ) {
    throw new Error(
      "Comfort model declarations must follow the global modifier order.",
    );
  }
  for (const modifier of modifiers) {
    for (const quantityId of modifier.modifierInputs) {
      const range = modifier.modifierInputRangeSi[quantityId];
      if (
        range === undefined
        || !Number.isFinite(range.min)
        || !Number.isFinite(range.max)
        || range.min > range.max
      ) {
        throw new Error(
          `Modifier ${modifier.id} is missing SI range for ${quantityId}.`,
        );
      }
    }
  }

  const standardIds = params.standardIds;
  if (new Set(standardIds).size !== standardIds.length) {
    throw new Error(
      "Comfort model declarations cannot contain duplicate standard IDs.",
    );
  }
  const supportsStandard = standardIds.length > 0;
  const supportsExplore = exploreMode;
  if (supportsExplore && exploreOutputs.length === 0) {
    throw new Error(
      "Explore workspace requires at least one explore output.",
    );
  }
  for (const output of exploreOutputs) {
    const validation = validateNumericBands(output.defaultBands);
    if (!validation.valid) {
      throw new Error(
        `Explore output ${output.key} has invalid default bands: ${validation.issues[0].message}`,
      );
    }
  }
  if (
    supportsStandard
    && (
      !params.complianceProfile
      || params.complianceProfile.bands.length === 0
      || params.complianceProfile.legendTitle.trim().length === 0
      || params.complianceProfile.caption.trim().length === 0
    )
  ) {
    throw new Error(
      "Standard workspace requires a non-empty compliance profile.",
    );
  }
  if (!supportsStandard && params.complianceProfile) {
    throw new Error(
      "A model without Standard workspace capability cannot declare a compliance profile.",
    );
  }
  if (!params.label || params.label.trim().length === 0) {
    throw new Error("Comfort model declarations require a non-empty label.");
  }
  if (!params.description || params.description.trim().length === 0) {
    throw new Error(
      "Comfort model declarations require a non-empty description.",
    );
  }
  if (tables.results.length === 0) {
    throw new Error("tables.results requires at least one row.");
  }

  const supportsTimeSeries = simulationOutput !== undefined;
  if (timeSeriesRows) {
    if (!supportsTimeSeries) {
      throw new Error(
        "tables.timeSeries is not a Compare table; declare features.timeSeries.",
      );
    }
    if (timeSeriesRows.length === 0) {
      throw new Error("features.timeSeries requires at least one row.");
    }
  } else if (supportsTimeSeries) {
    throw new Error(
      "features.timeSeries requires rows and simulation charts.",
    );
  }
  if (simulationOutput && simulationOutput.charts.length === 0) {
    throw new Error("Simulation output requires at least one chart.");
  }
  if (!supportsStandard && !supportsExplore && !supportsTimeSeries) {
    throw new Error(
      "Comfort model declarations require Standard, Explore, or Time-series membership.",
    );
  }

  const chartEntries = registeredCharts.map(({ declaration }) => ({
    ...declaration,
    ...(declaration.capabilities
      ? { capabilities: { ...declaration.capabilities } }
      : {}),
  }));
  const defaultInstanceId = defaultChartId ?? chartEntries[0]?.instanceId;
  if (!defaultInstanceId) {
    throw new Error(
      "Comfort model declarations require at least one output chart.",
    );
  }
  const chartInstances = {
    defaultInstanceId,
    entries: chartEntries,
  };
  if (chartInstances.entries.length === 0) {
    throw new Error(
      "Comfort model declarations require at least one output chart.",
    );
  }
  const instanceIds = chartInstances.entries.map(({ instanceId }) => instanceId);
  if (new Set(instanceIds).size !== instanceIds.length) {
    throw new Error(
      "Comfort model declarations cannot contain duplicate chart instance IDs.",
    );
  }
  if (!instanceIds.includes(chartInstances.defaultInstanceId)) {
    throw new Error(
      "The default output chart must belong to the declared chart instances.",
    );
  }

  for (const chart of chartInstances.entries) {
    if (!chart.emptyMessage.trim()) {
      throw new Error("Chart definitions require an empty message.");
    }
    const capabilities =
      chart.capabilities ?? resolveChartCapabilities(chart.type);
    if (capabilities.locksYAxis && !capabilities.allowsAxisSelection) {
      throw new Error("A locked Y axis requires an axis-selectable chart.");
    }
    const registration = registeredCharts.find(
      ({ registration: entry }) => entry.instanceId === chart.instanceId,
    )?.registration;
    const supportedExploreOutputs = registration?.supportedExploreOutputs;
    if (supportedExploreOutputs) {
      if (!supportsExplore || supportedExploreOutputs.length === 0) {
        throw new Error(
          "Chart-specific Explore outputs require Explore workspace capability and at least one output.",
        );
      }
      if (new Set(supportedExploreOutputs).size !== supportedExploreOutputs.length) {
        throw new Error(
          "Chart-specific Explore outputs cannot contain duplicates.",
        );
      }
      if (supportedExploreOutputs.some((outputKey) => !outputKeys.includes(outputKey))) {
        throw new Error(
          "Chart-specific Explore outputs must belong to the model declaration.",
        );
      }
    }
    const defaultExploreOutput = registration?.defaultExploreOutput;
    if (
      defaultExploreOutput
      && (
        !outputKeys.includes(defaultExploreOutput)
        || (supportedExploreOutputs && !supportedExploreOutputs.includes(defaultExploreOutput))
      )
    ) {
      throw new Error(
        "A chart's default Explore output must be supported by that chart.",
      );
    }
  }

  const parsedDefaults = params.parseOptions(params.defaultOptions);
  if (!parsedDefaults) {
    throw new Error(
      "Comfort model default options must satisfy the model's exact option schema.",
    );
  }

  injectDynamicGridResolvers(registeredCharts, exploreOutputs, inputFieldSpecs);
  const dynamicAxisFields = mergeDynamicAxisFields(
    registeredCharts,
    params.dynamicAxisFields ?? [],
  );
  const defaultDynamicAxes = deriveDefaultDynamicAxes(
    registeredCharts,
    dynamicAxisFields,
    params.defaultDynamicAxes,
  );
  if (dynamicAxisFields.length < 2 || !defaultDynamicAxes) {
    throw new Error(
      "Comfort model declarations require dynamic axis fields and explicit default dynamic axes.",
    );
  }
  if (new Set(dynamicAxisFields).size !== dynamicAxisFields.length) {
    throw new Error("Dynamic axis fields cannot contain duplicates.");
  }
  const defaultsAreValid =
    dynamicAxisFields.includes(defaultDynamicAxes.xAxis)
    && dynamicAxisFields.includes(defaultDynamicAxes.yAxis)
    && defaultDynamicAxes.xAxis !== defaultDynamicAxes.yAxis;
  if (!defaultsAreValid) {
    throw new Error("Default dynamic axes must be supported and distinct.");
  }
  assertQuantityFields(inputFieldSpecs);

  const complianceProfile = params.complianceProfile;
  const calculate = params.calculate;
  const chartEngineRegistrations = registeredCharts.map(
    ({ registration }) => registration,
  );
  const timeSeriesFeature: RuntimeTimeSeriesFeature | undefined =
    supportsTimeSeries && simulationOutput && timeSeriesRows
      ? {
          rows: [...timeSeriesRows] as RuntimeTimeSeriesFeature["rows"],
          simulation: {
            charts: simulationOutput.charts.map((chart) => ({ ...chart })),
          },
        }
      : undefined;

  return {
    id: params.id,
    label: params.label,
    description: params.description,
    exploreMode,
    standardIds: [...standardIds],
    exploreOutputs: exploreOutputs.map((output) => ({
      ...output,
      defaultBands: cloneNumericBands(output.defaultBands),
    })),
    modifiers: [...modifiers],
    ...(complianceProfile
      ? {
          complianceProfile: {
            ...complianceProfile,
            bands: complianceProfile.bands.map((band) => ({ ...band })),
            getFeedback: (result, context) =>
              complianceProfile.getFeedback(
                result as QuantityState | null,
                context,
              ),
          },
        }
      : {}),
    controls: [...controls],
    inputFields: [...inputFieldSpecs],
    optionHandlersByKey: { ...params.optionHandlersByKey },
    tables: {
      results: [...tables.results],
    } as ModelTables,
    chartInstances: {
      defaultInstanceId: chartInstances.defaultInstanceId,
      entries: chartInstances.entries.map((entry) => ({
        ...entry,
        ...(entry.capabilities
          ? { capabilities: { ...entry.capabilities } }
          : {}),
      })),
    },
    chartEngineRegistrations: [
      ...chartEngineRegistrations,
    ] as RuntimeComfortModelDefinition["chartEngineRegistrations"],
    defaultOptions: { ...parsedDefaults },
    parseOptions: params.parseOptions,
    calculate: (context, visibleInputIds) => calculate(context, visibleInputIds),
    buildTable: (valuesByInput, visibleInputIds, unitSystem, tableContext) => {
      return buildCompareMatrixTable(
        tables.results,
        valuesByInput,
        visibleInputIds,
        unitSystem,
        tableContext,
      );
    },
    buildChart: (
      instanceId,
      chartSource,
      valuesByInput,
      profile,
      context,
    ) => {
      const chartEntry = registeredCharts.find(
        ({ declaration }) => declaration.instanceId === instanceId,
      );
      const showsLegend = chartEntry
        ? resolveChartCapabilities(
            chartEntry.declaration.type,
            chartEntry.declaration.capabilities,
          ).showsLegend
        : false;
      return resolveChartBuildResult({
        modelId: params.id,
        registrations: chartEngineRegistrations,
        instanceId,
        chartSource: chartSource as ChartSourceType | null,
        valuesByInput,
        profile,
        unitSystem: context.unitSystem,
        baselineInputId: context.baselineInputId,
        chartSourceVersion: context.chartSourceVersion,
        modelInputs: context.modelInputs,
        showsLegend,
        ...(complianceProfile
          ? { complianceProfile: complianceProfile as ComplianceSpec }
          : {}),
        exploreOutputs: exploreOutputs.map((output) => ({
          ...output,
          defaultBands: cloneNumericBands(output.defaultBands),
        })),
      });
    },
    dynamicAxisFields: [...dynamicAxisFields],
    defaultDynamicAxes: { ...defaultDynamicAxes },
    ...(timeSeriesFeature ? { timeSeries: timeSeriesFeature } : {}),
    ...(simulationOutput
      ? {
          simulation: {
            charts: simulationOutput.charts.map((chart) => ({ ...chart })),
          },
        }
      : {}),
  };
}

/**
 * Six-section model authoring. `defineModel(library, authoring)` is the public API.
 */
export interface ModelFeatures<ComplianceBand extends Band = NumericBand> {
  readonly modifiers?: readonly InputModifier[];
  readonly optionHandlers?: readonly {
    readonly key: OptionKeyType;
    readonly handler: ModelOptionChangeHandler;
  }[];
  readonly optionHandlersByKey?: Partial<
    Record<OptionKeyType, ModelOptionChangeHandler>
  >;
  readonly complianceProfile?: ComplianceSpec<ComplianceBand>;
  readonly timeSeries?: {
    readonly rows: readonly TableRowAuthoring[];
    readonly simulation: SimulationOutputDeclaration;
  };
  readonly parseOptions?: (value: unknown) => ModelOptionsState | null;
  readonly defaultOptions?: Partial<Record<OptionKeyType, string>>;
  readonly exploreOutputs?: readonly ModelOutput[];
}

/** Call adapter when the library is not positional + kwargs. Not a page feature. */
export interface ModelPipeline<ChartSourceType = unknown> {
  readonly invoke?: LibraryInvokeFn;
  readonly mapChartInput?: ChartInputMapper<unknown>;
  readonly buildChartSource?: ChartSourceBuilder<ChartSourceType>;
}

export interface ModelAuthoring<
  ChartSourceType = unknown,
  ComplianceBand extends Band = NumericBand,
> {
  readonly id: ModelIdType;
  readonly standardIds: readonly StandardIdType[];
  readonly exploreMode: boolean;
  readonly inputs: readonly QuantityInputBind[];
  readonly response: {
    readonly values: readonly QuantityResultBind[];
    readonly intervals?: readonly LibraryInterval[];
  };
  readonly tables?: {
    readonly results?: readonly TableRowAuthoring[];
  };
  readonly charts: readonly FrontendChartDeclaration<ChartSourceType>[];
  readonly features?: ModelFeatures<ComplianceBand>;
  readonly pipeline?: ModelPipeline<ChartSourceType>;
  readonly dynamicAxisFields?: readonly PhysicalQuantityId[];
  readonly defaultDynamicAxes?: DynamicAxisDefaults;
}

function unboundedExploreBands(label: string): NumericBand[] {
  return [
    numericBandFromToken(ZoneToken.Neutral, {
      min: Number.NEGATIVE_INFINITY,
      max: Number.POSITIVE_INFINITY,
      label,
    }),
  ];
}

function deriveExploreOutputs(
  library: JsModelFn,
  authoring: ModelAuthoring<unknown, Band>,
): ModelOutput[] {
  if (authoring.features?.exploreOutputs) {
    return [...authoring.features.exploreOutputs];
  }
  if (!authoring.exploreMode) {
    return [];
  }
  const intervals = authoring.response.intervals ?? [];
  const valued = authoring.response.values.filter((row) =>
    intervals.some((interval) => interval.quantity === row.quantity),
  );
  const rows = valued.length > 0 ? valued : authoring.response.values.slice(0, 1);
  return rows.map((row) => {
    const interval = intervals.find((item) => item.quantity === row.quantity);
    const label = library.label || getPhysicalQuantityMeta(row.quantity).label;
    return {
      key: row.quantity,
      label,
      defaultBands: interval
        ? numericBandsFromInterval(interval)
        : unboundedExploreBands(label),
    };
  });
}

function decorateResultRows(
  rows: readonly TableRowAuthoring[],
  intervals: readonly LibraryInterval[],
): TableRowAuthoring[] {
  return rows.map((row) => {
    const quantity = typeof row === "string"
      ? row
      : "quantity" in row
        ? row.quantity
        : undefined;
    if (!quantity) {
      return row;
    }
    const interval = intervals.find((item) => item.quantity === quantity);
    if (!interval) {
      return row;
    }
    const authored = typeof row === "string" ? { quantity } : row;
    if ("format" in authored) {
      return row;
    }
    return {
      ...authored,
      subtext: authored.subtext ?? ((result) => {
        const value = result[quantity];
        if (typeof value !== "number") {
          return undefined;
        }
        const tokenRow = tokenRowForValue(interval, value);
        if (!tokenRow) {
          const bands = numericBandsFromInterval(interval);
          return bands.find((band) =>
            value >= band.min && value <= band.max,
          )?.label;
        }
        return displayClassifierLabel(tokenRow.label);
      }),
      color: authored.color ?? ((result) => {
        const value = result[quantity];
        if (typeof value !== "number") {
          return undefined;
        }
        const tokenRow = tokenRowForValue(interval, value);
        return tokenRow
          ? resolveZoneAppearance(tokenRow.token).text
          : undefined;
      }),
    };
  });
}

function withDefaultDynamicEvaluate<ChartSourceType>(
  library: JsModelFn,
  authoring: ModelAuthoring<ChartSourceType, Band>,
  charts: readonly FrontendChartDeclaration<ChartSourceType>[],
): FrontendChartDeclaration<ChartSourceType>[] {
  return charts.map((chart) => {
    if (chart.type !== ChartType.Dynamic) {
      return chart;
    }
    if (!("axes" in chart.spec)) {
      return chart;
    }
    const spec = chart.spec as DynamicFieldGridSpec<QuantityState>;
    if (spec.resolveGridSpec || spec.evaluate) {
      return chart;
    }
    const firstOutput = authoring.response.values[0]?.quantity;
    const invoke = authoring.pipeline?.invoke;
    return {
      ...chart,
      spec: {
        ...spec,
        evaluate: ((payload: QuantityState) => {
          if (invoke) {
            return invoke(payload, {
              effectiveQuantitiesByInput: {
                [InputId.Input1]: payload,
                [InputId.Input2]: payload,
                [InputId.Input3]: payload,
              },
              options: {},
            });
          }
          return invokeMappedLibrary(
            library,
            authoring.inputs,
            authoring.response.values,
            payload,
          );
        }) as DynamicFieldGridSpec<QuantityState>["evaluate"],
        getOutputValue: ((result: QuantityState, outputKey?: PhysicalQuantityId) => {
          const key = outputKey ?? firstOutput;
          if (!key) {
            return null;
          }
          const value = result[key];
          return typeof value === "number" ? value : null;
        }) as DynamicFieldGridSpec<QuantityState>["getOutputValue"],
        requestAdapter: spec.requestAdapter ?? quantityStateAxisAdapter,
      },
    };
  });
}

function assertChartDeclarations<ChartSourceType>(
  charts: readonly FrontendChartDeclaration<ChartSourceType>[],
): void {
  for (const chart of charts) {
    if (!isChartType(chart.type)) {
      throw new Error(
        `Unknown chart type "${String(chart.type)}". ChartType is a closed set.`,
      );
    }
    if (!modelChartSpecMatchesType(chart)) {
      throw new Error(
        `defineModel chart "${chart.type}" spec does not match type "${chart.type}".`,
      );
    }
  }
}

/** Sole assembly function: library once, then six-section authoring. */
export function defineModel<
  ChartSourceType = unknown,
  ComplianceBand extends Band = NumericBand,
>(
  library: JsModelFn,
  authoring: ModelAuthoring<ChartSourceType, ComplianceBand>,
): RuntimeComfortModelDefinition {
  assertChartDeclarations(authoring.charts);

  const exploreOutputs = deriveExploreOutputs(
    library,
    authoring as ModelAuthoring<unknown, Band>,
  );
  const charts = withDefaultDynamicEvaluate(
    library,
    authoring as ModelAuthoring<ChartSourceType, Band>,
    authoring.charts,
  );
  const intervals = authoring.response.intervals ?? [];
  const resultRows = authoring.tables?.results
    ?? authoring.response.values.map((row) => row.quantity);
  if (
    authoring.tables
    && "timeSeries" in authoring.tables
    && (authoring.tables as { timeSeries?: unknown }).timeSeries !== undefined
  ) {
    throw new Error(
      "tables.timeSeries is not a Compare table; declare features.timeSeries.",
    );
  }
  const tables: ModelTablesAuthoring = {
    results: decorateResultRows(resultRows, intervals),
  };

  const optionHandlersByKey: Partial<
    Record<OptionKeyType, ModelOptionChangeHandler>
  > = { ...(authoring.features?.optionHandlersByKey ?? {}) };
  if (authoring.features?.optionHandlers) {
    for (const { key, handler } of authoring.features.optionHandlers) {
      optionHandlersByKey[key] = handler;
    }
  }

  return assembleRuntime({
    id: authoring.id,
    label: library.label,
    description: library.description,
    exploreMode: authoring.exploreMode,
    standardIds: authoring.standardIds,
    exploreOutputs,
    modifiers: authoring.features?.modifiers ?? [],
    ...(authoring.features?.complianceProfile
      ? { complianceProfile: authoring.features.complianceProfile }
      : {}),
    inputFields: authoring.inputs.map(toAuthoringInputField),
    optionHandlersByKey,
    tables,
    charts,
    defaultOptions: authoring.features?.defaultOptions ?? {},
    parseOptions: authoring.features?.parseOptions ?? parseEmptyOptions,
    calculate: (context, visibleInputIds) =>
      calculateFromLibrary(
        library,
        authoring.inputs,
        authoring.response.values,
        context,
        visibleInputIds,
        {
          ...(authoring.pipeline?.invoke
            ? { invoke: authoring.pipeline.invoke }
            : {}),
          ...(authoring.pipeline?.mapChartInput
            ? { mapChartInput: authoring.pipeline.mapChartInput }
            : {}),
          ...(authoring.pipeline?.buildChartSource
            ? { buildChartSource: authoring.pipeline.buildChartSource }
            : {}),
        },
      ),
    ...(authoring.features?.timeSeries
      ? { timeSeries: authoring.features.timeSeries }
      : {}),
    ...(authoring.dynamicAxisFields
      ? { dynamicAxisFields: authoring.dynamicAxisFields }
      : {}),
    ...(authoring.defaultDynamicAxes
      ? { defaultDynamicAxes: authoring.defaultDynamicAxes }
      : {}),
  });
}

export function assembleModel<
  ChartSourceType = unknown,
  ComplianceBand extends Band = NumericBand,
>(
  library: JsModelFn,
  authoring: ModelAuthoring<ChartSourceType, ComplianceBand>,
): RuntimeComfortModelDefinition {
  return defineModel(library, authoring);
}
