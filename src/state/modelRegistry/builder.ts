import {
  inputOrder,
  type InputId as InputIdType,
} from "../../catalog/inputSlots";
import type { ModelOptionsState, ResultCellViewModel } from "../pointSession/types";
import type {
  ComfortModelDefinition,
  DynamicAxisDefaults,
  ModelOptionChangeHandler,
  RuntimeComfortModelDefinition,
  SimulationOutputDeclaration,
} from "./definition";
import type { ModelId as ModelIdType } from "../../catalog/modelIds";
import type { OptionKey as OptionKeyType } from "../../catalog/inputModes";
import {
  modifierOrder,
  type InputModifier,
} from "../../catalog/inputModifiers";
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
  supportsExploreSurface,
  supportsStandardSurface,
  supportsTimeSeriesSurface,
  type StandardId as StandardIdType,
  type SurfaceId as SurfaceIdType,
} from "../../catalog/surfaces";
import {
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
  isPhysicalQuantityId,
  type PhysicalQuantityId as PhysicalQuantityIdType,
} from "../../catalog/quantities";
import { isAllowedExtraQuantityId } from "../../engines/comfort/quantityStateRouting";
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
import { compileModelTables } from "../../engines/comfort/output/compileTableRows";
import { buildCompareMatrixTable } from "../../engines/comfort/output/tableResolver";
import type { ChartRange } from "../../engines/comfort/charts/types";

export type { FrontendChartDeclaration };

export type JsModelLibrary = {
  readonly label: string;
  readonly description: string;
};

export type ResultRowDefinition<T> = {
  title: string;
  group?: string;
  formatter: (result: T) => ResultCellViewModel;
};

interface RegisteredChart<
  ResultType,
  ChartSourceType,
  ComplianceBand extends Band,
> {
  readonly declaration: ChartInstanceDeclaration;
  readonly registration: ChartEngineRegistration<ResultType, ChartSourceType>;
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

function toRegisteredChartBindSpec<ResultType, ChartSourceType>(
  entry: FrontendChartDeclaration<ResultType, ChartSourceType>,
): RegisteredChartEngineSpec<ResultType, ChartSourceType> {
  if (!isChartType(entry.type)) {
    throw new Error(
      `Unknown chart type "${String(entry.type)}". ChartType is a closed set.`,
    );
  }
  return { type: entry.type, spec: entry.spec } as RegisteredChartEngineSpec<
    ResultType,
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

function createChartEngineRegistration<ResultType, ChartSourceType>(
  entry: FrontendChartDeclaration<ResultType, ChartSourceType>,
  instanceId: string,
  emptyMessage: string,
): ChartEngineRegistration<ResultType, ChartSourceType> {
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

function createChartInstanceDeclaration<ResultType, ChartSourceType>(
  entry: FrontendChartDeclaration<ResultType, ChartSourceType>,
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

export class ComfortModelBuilder<
  ResultType,
  ChartSourceType,
  ComplianceBand extends Band = NumericBand,
> {
  private readonly id: ModelIdType;

  private label?: string;

  private description?: string;

  private surfaceCapabilities?: readonly SurfaceIdType[];

  private standardIds?: readonly StandardIdType[];

  private exploreOutputs?: readonly ModelOutput[];

  private modifiers?: readonly InputModifier[];

  private complianceProfile?: ComplianceSpec<ComplianceBand, ResultType>;

  private readonly controls: InputControlDefinition[] = [];

  private readonly inputFieldSpecs: InputFieldSpec[] = [];

  private extraQuantities: PhysicalQuantityIdType[] = [];

  private readonly optionHandlersByKey: Partial<
    Record<OptionKeyType, ModelOptionChangeHandler>
  > = {};

  private tables?: ModelTables<ResultType>;

  private defaultChartId?: string;

  private readonly registeredCharts: RegisteredChart<
    ResultType,
    ChartSourceType,
    ComplianceBand
  >[] = [];

  private defaultOptions?: Partial<Record<OptionKeyType, string>>;

  private parseOptions?: ComfortModelDefinition<
    ResultType,
    ChartSourceType,
    ComplianceBand
  >["parseOptions"];

  private calculate?: ComfortModelDefinition<
    ResultType,
    ChartSourceType,
    ComplianceBand
  >["calculate"];

  private simulationOutput?: SimulationOutputDeclaration;

  private dynamicAxisFields?: readonly PhysicalQuantityId[];

  private defaultDynamicAxes?: DynamicAxisDefaults;

  constructor(id: ModelIdType) {
    this.id = id;
  }

  setLibrary(library: JsModelLibrary): this {
    this.label = library.label;
    this.description = library.description;
    return this;
  }

  setLabel(label: string): this {
    this.label = label;
    return this;
  }

  setDescription(description: string): this {
    this.description = description;
    return this;
  }

  setSurfaceCapabilities(
    capabilities: readonly SurfaceIdType[],
  ): this {
    this.surfaceCapabilities = capabilities;
    return this;
  }

  setStandardIds(standardIds: readonly StandardIdType[]): this {
    this.standardIds = standardIds;
    return this;
  }

  setExploreOutputs(outputs: readonly ModelOutput[]): this {
    this.exploreOutputs = outputs;
    return this;
  }

  setModifiers(modifiers: readonly InputModifier[]): this {
    this.modifiers = modifiers;
    return this;
  }

  setComplianceProfile(spec: ComplianceSpec<ComplianceBand, ResultType>): this {
    this.complianceProfile = spec;
    return this;
  }

  setSimulation(simulation: SimulationOutputDeclaration): this {
    for (const chart of simulation.charts) {
      if (
        chart.type !== ChartType.BodyTemperature
        && chart.type !== ChartType.WaterLoss
      ) {
        throw new Error(
          `Simulation chart ${chart.id} must use ChartType.BodyTemperature or ChartType.WaterLoss.`,
        );
      }
    }
    this.simulationOutput = simulation;
    return this;
  }

  setTables(tables: ModelTablesAuthoring<ResultType>): this {
    this.tables = compileModelTables(tables);
    return this;
  }

  setCharts(
    entries: readonly FrontendChartDeclaration<ResultType, ChartSourceType>[],
  ): this {
    if (entries.length === 0) {
      throw new Error(
        "Comfort model declarations require at least one output chart.",
      );
    }

    this.defaultChartId = entries[0]!.type;

    for (const entry of entries) {
      this.registerChart(entry);
    }

    return this;
  }

  setInputFields(fields: readonly AuthoringInputField[]): this {
    for (const field of fields) {
      const spec = resolveAuthoringInputField(field);
      this.inputFieldSpecs.push(spec);
      this.controls.push(resolveInputField(spec));
    }
    return this;
  }

  setExtraQuantities(ids: readonly PhysicalQuantityIdType[]): this {
    this.extraQuantities = [...ids];
    return this;
  }

  addOptionHandler(
    optionKey: OptionKeyType,
    handler: ModelOptionChangeHandler,
  ): this {
    this.optionHandlersByKey[optionKey] = handler;
    return this;
  }

  setDefaultOptions(options: Partial<Record<OptionKeyType, string>>): this {
    this.defaultOptions = options;
    return this;
  }

  setOptionParser(parser: (value: unknown) => ModelOptionsState | null): this {
    this.parseOptions = parser;
    return this;
  }

  setCalculator(
    calculator: ComfortModelDefinition<
      ResultType,
      ChartSourceType,
      ComplianceBand
    >["calculate"],
  ): this {
    this.calculate = calculator;
    return this;
  }

  setDynamicAxisFields(fields: readonly PhysicalQuantityId[]): this {
    this.dynamicAxisFields = fields;
    return this;
  }

  setDefaultDynamicAxes(defaults: DynamicAxisDefaults): this {
    this.defaultDynamicAxes = defaults;
    return this;
  }

  private registerChart(
    entry: FrontendChartDeclaration<ResultType, ChartSourceType>,
  ): void {
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
    if (
      this.registeredCharts.some(
        ({ declaration }) => declaration.type === entry.type,
      )
    ) {
      throw new Error(
        `Comfort model declarations cannot contain duplicate chart types (${entry.type}).`,
      );
    }

    const instanceId = entry.type;
    const emptyMessage = derivedEmptyMessage(entry);
    const finalized = this.finalizeChartEntry(entry, emptyMessage);
    this.registeredCharts.push({
      declaration: createChartInstanceDeclaration(
        finalized as FrontendChartDeclaration,
        instanceId,
        emptyMessage,
      ),
      registration: createChartEngineRegistration<ResultType, ChartSourceType>(
        finalized,
        instanceId,
        emptyMessage,
      ),
    });

    if (!this.defaultChartId) {
      this.defaultChartId = instanceId;
    }
  }

  private finalizeChartEntry(
    entry: FrontendChartDeclaration<ResultType, ChartSourceType>,
    emptyMessage: string,
  ): FrontendChartDeclaration<ResultType, ChartSourceType> {
    const modelLabel = this.label ?? "";
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
      } as FrontendChartDeclaration<ResultType, ChartSourceType>;
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
      } as FrontendChartDeclaration<ResultType, ChartSourceType>;
    }
    return { ...entry, emptyMessage };
  }

  private axisRangesFromInputFields(): Partial<
    Record<PhysicalQuantityId, ChartRange>
  > {
    const ranges: Partial<Record<PhysicalQuantityId, ChartRange>> = {};
    for (const spec of this.inputFieldSpecs) {
      for (const quantityId of primaryQuantityIdsForInputField(spec)) {
        const { minSi, maxSi } = declaredSiRangeForInputField(spec, quantityId);
        const meta = getPhysicalQuantityMeta(quantityId);
        if (minSi !== meta.minSi || maxSi !== meta.maxSi) {
          ranges[quantityId] = { min: minSi, max: maxSi };
        }
      }
    }
    return ranges;
  }

  private injectDynamicGridResolvers(): void {
    const exploreOutputs = this.exploreOutputs ?? [];
    const axisRanges = this.axisRangesFromInputFields();
    for (const chart of this.registeredCharts) {
      if (chart.registration.registration.type !== ChartType.Dynamic) {
        continue;
      }
      const spec = chart.registration.registration.spec;
      if (!isDynamicFieldGridSpec(spec) || spec.resolveGridSpec) {
        continue;
      }
      const authoring: DynamicFieldGridSpec<ResultType> = spec;
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

  private validateExtraQuantities(): readonly PhysicalQuantityIdType[] {
    const seenIds = new Set<string>();
    const extras: PhysicalQuantityIdType[] = [];

    for (const quantityId of this.extraQuantities) {
      if (!isPhysicalQuantityId(quantityId) || !isAllowedExtraQuantityId(quantityId)) {
        throw new Error(
          `Unknown extra quantity "${String(quantityId)}". Extra quantities must be catalog ids that are not primary, humidity, or modifier slots.`,
        );
      }
      if (seenIds.has(quantityId)) {
        throw new Error(
          `Comfort model declarations cannot contain duplicate extra quantities (${quantityId}).`,
        );
      }
      seenIds.add(quantityId);
      extras.push(quantityId);
    }

    return extras;
  }

  private assertQuantityFields(
    extras: readonly PhysicalQuantityIdType[],
  ): void {
    const selectedIds = new Set(extras);
    for (const spec of this.inputFieldSpecs) {
      if (spec.kind !== "quantity") continue;
      if (!isPhysicalQuantityId(spec.quantityId) || !isAllowedExtraQuantityId(spec.quantityId)) {
        throw new Error(
          `quantity field ${spec.quantityId} must reference a non-primary catalog quantity.`,
        );
      }
      if (!selectedIds.has(spec.quantityId)) {
        throw new Error(
          `quantity field ${spec.quantityId} must be listed in extraQuantities.`,
        );
      }
    }
  }

  private mergeDynamicAxisFields(): readonly PhysicalQuantityId[] {
    const explicitFields = this.dynamicAxisFields ?? [];
    if (new Set(explicitFields).size !== explicitFields.length) {
      throw new Error("Dynamic axis fields cannot contain duplicates.");
    }

    const registeredFields = this.registeredCharts.flatMap(
      ({ registration }) => {
        const bind = registration.registration;
        if (bind.type === ChartType.Dynamic) {
          if (isDynamicFieldGridSpec(bind.spec)) {
            return [...dynamicAxisPool(bind.spec)];
          }
          if (
            "axisFields" in bind.spec &&
            Array.isArray(bind.spec.axisFields)
          ) {
            return [...bind.spec.axisFields];
          }
          return [];
        }
        if (
          bind.type === ChartType.Adaptive &&
          "axisFields" in bind.spec &&
          Array.isArray(bind.spec.axisFields)
        ) {
          return [...bind.spec.axisFields];
        }
        return [];
      },
    );

    return [...new Set([...explicitFields, ...registeredFields])];
  }

  private deriveDefaultDynamicAxes(
    fields: readonly PhysicalQuantityId[],
  ): DynamicAxisDefaults | undefined {
    if (this.defaultDynamicAxes) {
      return this.defaultDynamicAxes;
    }
    for (const { registration } of this.registeredCharts) {
      const bind = registration.registration;
      if (bind.type === ChartType.Dynamic && isDynamicFieldGridSpec(bind.spec)) {
        return { xAxis: bind.spec.axes.x, yAxis: bind.spec.axes.y };
      }
      if (
        bind.type === ChartType.Adaptive &&
        "axisFields" in bind.spec &&
        Array.isArray(bind.spec.axisFields) &&
        bind.spec.axisFields.length >= 2
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

  private resolveChartInstances(): ComfortModelDefinition<
    ResultType,
    ChartSourceType,
    ComplianceBand
  >["chartInstances"] {
    const entries = this.registeredCharts.map(({ declaration }) => ({
      ...declaration,
      ...(declaration.capabilities
        ? { capabilities: { ...declaration.capabilities } }
        : {}),
    }));

    const defaultInstanceId =
      this.defaultChartId ?? entries[0]?.instanceId;
    if (!defaultInstanceId) {
      throw new Error(
        "Comfort model declarations require at least one output chart.",
      );
    }

    return {
      defaultInstanceId,
      entries,
    };
  }

  build(): RuntimeComfortModelDefinition {
    const surfaceCapabilities = this.surfaceCapabilities;
    if (!surfaceCapabilities || surfaceCapabilities.length === 0) {
      throw new Error(
        "Comfort model declarations require at least one workspace capability.",
      );
    }

    if (new Set(surfaceCapabilities).size !== surfaceCapabilities.length) {
      throw new Error(
        "Comfort model declarations cannot contain duplicate workspace capabilities.",
      );
    }

    const exploreOutputs = this.exploreOutputs;
    if (!exploreOutputs) {
      throw new Error(
        "Comfort model declarations must explicitly set explore outputs.",
      );
    }

    const outputKeys = exploreOutputs.map((output) => output.key);
    if (new Set(outputKeys).size !== outputKeys.length) {
      throw new Error(
        "Comfort model declarations cannot contain duplicate output keys.",
      );
    }

    const modifiers = this.modifiers;
    if (!modifiers) {
      throw new Error(
        "Comfort model declarations must explicitly set supported modifiers.",
      );
    }
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
      modifierPositions.some((position) => position < 0) ||
      modifierPositions.some(
        (position, index) =>
          index > 0 && position <= modifierPositions[index - 1],
      )
    ) {
      throw new Error(
        "Comfort model declarations must follow the global modifier order.",
      );
    }

    const supportsStandard = supportsStandardSurface(surfaceCapabilities);
    const supportsExplore = supportsExploreSurface(surfaceCapabilities);
    const supportsTimeSeries = supportsTimeSeriesSurface(
      surfaceCapabilities,
    );

    const standardIds = this.standardIds;
    if (!standardIds) {
      throw new Error(
        "Comfort model declarations must explicitly set standard IDs.",
      );
    }
    if (new Set(standardIds).size !== standardIds.length) {
      throw new Error(
        "Comfort model declarations cannot contain duplicate standard IDs.",
      );
    }
    if (supportsStandard && standardIds.length === 0) {
      throw new Error(
        "Standard workspace models must declare at least one standard ID.",
      );
    }
    if (!supportsStandard && standardIds.length > 0) {
      throw new Error(
        "Models without Standard workspace capability cannot declare a standard ID.",
      );
    }

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
      supportsStandard &&
      (!this.complianceProfile ||
        this.complianceProfile.bands.length === 0 ||
        this.complianceProfile.legendTitle.trim().length === 0 ||
        this.complianceProfile.caption.trim().length === 0)
    ) {
      throw new Error(
        "Standard workspace requires a non-empty compliance profile.",
      );
    }

    if (!supportsStandard && this.complianceProfile) {
      throw new Error(
        "A model without Standard workspace capability cannot declare a compliance profile.",
      );
    }

    if (!this.label || this.label.trim().length === 0) {
      throw new Error("Comfort model declarations require a non-empty label.");
    }

    if (!this.description || this.description.trim().length === 0) {
      throw new Error(
        "Comfort model declarations require a non-empty description.",
      );
    }

    const tables = this.tables ?? compileModelTables({
      results: exploreOutputs.map((output) => output.key),
    });

    if (tables.results.length === 0) {
      throw new Error("tables.results requires at least one row.");
    }

    if (tables.timeSeries) {
      if (!supportsTimeSeries) {
        throw new Error(
          "tables.timeSeries is allowed only with Time-series workspace capability.",
        );
      }
      if (tables.timeSeries.length === 0) {
        throw new Error("tables.timeSeries requires at least one row.");
      }
    } else if (supportsTimeSeries) {
      throw new Error(
        "Time-series workspace capability requires tables.timeSeries.",
      );
    }

    if (supportsTimeSeries && !this.simulationOutput) {
      throw new Error(
        "Time-series workspace capability requires simulation charts.",
      );
    }

    if (this.simulationOutput && !supportsTimeSeries) {
      throw new Error(
        "Simulation charts require Time-series workspace capability.",
      );
    }

    if (this.simulationOutput && this.simulationOutput.charts.length === 0) {
      throw new Error("Simulation output requires at least one chart.");
    }

    const chartInstances = this.resolveChartInstances();
    if (chartInstances.entries.length === 0) {
      throw new Error(
        "Comfort model declarations require at least one output chart.",
      );
    }

    const instanceIds = chartInstances.entries.map(
      ({ instanceId }) => instanceId,
    );
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

      const registration = this.registeredCharts.find(
        ({ registration: entry }) => entry.instanceId === chart.instanceId,
      )?.registration;
      const supportedExploreOutputs = registration?.supportedExploreOutputs;
      if (supportedExploreOutputs) {
        if (!supportsExplore || supportedExploreOutputs.length === 0) {
          throw new Error(
            "Chart-specific Explore outputs require Explore workspace capability and at least one output.",
          );
        }
        if (
          new Set(supportedExploreOutputs).size !==
          supportedExploreOutputs.length
        ) {
          throw new Error(
            "Chart-specific Explore outputs cannot contain duplicates.",
          );
        }
        if (
          supportedExploreOutputs.some(
            (outputKey) => !outputKeys.includes(outputKey),
          )
        ) {
          throw new Error(
            "Chart-specific Explore outputs must belong to the model declaration.",
          );
        }
      }
      const defaultExploreOutput = registration?.defaultExploreOutput;
      if (
        defaultExploreOutput &&
        (!outputKeys.includes(defaultExploreOutput) ||
          (supportedExploreOutputs &&
            !supportedExploreOutputs.includes(defaultExploreOutput)))
      ) {
        throw new Error(
          "A chart's default Explore output must be supported by that chart.",
        );
      }
    }

    if (this.defaultOptions === undefined) {
      this.defaultOptions = {};
    }

    if (!this.parseOptions) {
      this.parseOptions = parseEmptyOptions;
    }

    const defaultOptions = this.parseOptions(this.defaultOptions);
    if (!defaultOptions) {
      throw new Error(
        "Comfort model default options must satisfy the model's exact option schema.",
      );
    }

    if (!this.calculate) {
      throw new Error("Comfort model declarations must set a calculator.");
    }

    this.injectDynamicGridResolvers();
    const dynamicAxisFields = this.mergeDynamicAxisFields();
    const defaultDynamicAxes = this.deriveDefaultDynamicAxes(dynamicAxisFields);
    if (dynamicAxisFields.length < 2 || !defaultDynamicAxes) {
      throw new Error(
        "Comfort model declarations require dynamic axis fields and explicit default dynamic axes.",
      );
    }

    if (new Set(dynamicAxisFields).size !== dynamicAxisFields.length) {
      throw new Error("Dynamic axis fields cannot contain duplicates.");
    }

    const defaultsAreValid =
      dynamicAxisFields.includes(defaultDynamicAxes.xAxis) &&
      dynamicAxisFields.includes(defaultDynamicAxes.yAxis) &&
      defaultDynamicAxes.xAxis !== defaultDynamicAxes.yAxis;
    if (!defaultsAreValid) {
      throw new Error("Default dynamic axes must be supported and distinct.");
    }

    const extraQuantities = this.validateExtraQuantities();
    this.assertQuantityFields(extraQuantities);

    const complianceProfile = this.complianceProfile;
    const calculate = this.calculate;
    const chartEngineRegistrations = this.registeredCharts.map(
      ({ registration }) => registration,
    );
    const registeredChartsForBuild = this.registeredCharts;
    const builtModelId = this.id;

    return {
      id: this.id,
      label: this.label,
      description: this.description,
      surfaceCapabilities: [...surfaceCapabilities],
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
              getFeedback: (result: unknown) =>
                complianceProfile.getFeedback(result as ResultType),
            },
          }
        : {}),
      controls: [...this.controls],
      inputFields: [...this.inputFieldSpecs],
      extraQuantities: [...extraQuantities],
      optionHandlersByKey: { ...this.optionHandlersByKey },
      tables: {
        results: [...tables.results],
        ...(tables.timeSeries
          ? {
              timeSeries: [...tables.timeSeries],
            }
          : {}),
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
      defaultOptions: { ...defaultOptions },
      parseOptions: this.parseOptions,
      calculate: (context, visibleInputIds) =>
        calculate(context, visibleInputIds),
      buildTable: (resultsByInput, visibleInputIds, unitSystem) => {
        return buildCompareMatrixTable(
          tables.results,
          resultsByInput as Record<InputIdType, ResultType | null>,
          visibleInputIds,
          unitSystem,
        );
      },
      buildChart: (
        instanceId,
        chartSource,
        resultsByInput,
        profile,
        context,
      ) => {
        const chartEntry = registeredChartsForBuild.find(
          ({ declaration }) => declaration.instanceId === instanceId,
        );
        const showsLegend = chartEntry
          ? resolveChartCapabilities(
              chartEntry.declaration.type,
              chartEntry.declaration.capabilities,
            ).showsLegend
          : false;
        return resolveChartBuildResult({
          modelId: builtModelId,
          registrations: chartEngineRegistrations,
          instanceId,
          chartSource: chartSource as ChartSourceType | null,
          resultsByInput: resultsByInput as Record<
            InputIdType,
            ResultType | null
          >,
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
      ...(this.simulationOutput
        ? {
            simulation: {
              charts: this.simulationOutput.charts.map((chart) => ({
                ...chart,
              })),
            },
          }
        : {}),
    };
  }
}

/**
 * Complete model declaration assembled into a runtime model definition.
 * Charts are a discriminated union over ChartType (`FrontendChartDeclaration`).
 */
export interface ModelDeclaration<
  ResultType,
  ChartSourceType,
  ComplianceBand extends Band = NumericBand,
> {
  readonly id: ModelIdType;
  readonly library: JsModelLibrary;
  readonly standardIds: readonly StandardIdType[];
  readonly surfaceCapabilities: readonly SurfaceIdType[];
  readonly exploreOutputs: readonly ModelOutput[];
  readonly modifiers: readonly InputModifier[];
  readonly complianceProfile?: ComplianceSpec<ComplianceBand, ResultType>;
  readonly inputFields: readonly AuthoringInputField[];
  readonly extraQuantities?: readonly PhysicalQuantityIdType[];
  readonly optionHandlersByKey?: Partial<
    Record<OptionKeyType, ModelOptionChangeHandler>
  >;
  readonly charts: readonly FrontendChartDeclaration<ResultType, ChartSourceType>[];
  readonly tables?: ModelTablesAuthoring<ResultType>;
  readonly calculate: ComfortModelDefinition<
    ResultType,
    ChartSourceType,
    ComplianceBand
  >["calculate"];
  readonly simulation?: SimulationOutputDeclaration;
  readonly dynamicAxisFields?: readonly PhysicalQuantityId[];
  readonly defaultDynamicAxes?: DynamicAxisDefaults;
  readonly defaultOptions?: Partial<Record<OptionKeyType, string>>;
  readonly parseOptions?: (value: unknown) => ModelOptionsState | null;
}

function assertChartDeclarations<TResult, ChartSourceType>(
  charts: readonly FrontendChartDeclaration<TResult, ChartSourceType>[],
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

/** Sole assembly function for a complete model declaration. */
export function defineModel<
  ResultType,
  ChartSourceType,
  ComplianceBand extends Band = NumericBand,
>(
  declaration: ModelDeclaration<ResultType, ChartSourceType, ComplianceBand>,
): RuntimeComfortModelDefinition {
  assertChartDeclarations(declaration.charts);

  const builder = new ComfortModelBuilder<
    ResultType,
    ChartSourceType,
    ComplianceBand
  >(declaration.id);

  builder
    .setLibrary(declaration.library)
    .setStandardIds(declaration.standardIds)
    .setSurfaceCapabilities(declaration.surfaceCapabilities)
    .setExploreOutputs(declaration.exploreOutputs)
    .setModifiers(declaration.modifiers)
    .setCharts(declaration.charts)
    .setInputFields(declaration.inputFields)
    .setCalculator(declaration.calculate);

  if (declaration.tables) {
    builder.setTables(declaration.tables);
  }
  if (declaration.complianceProfile) {
    builder.setComplianceProfile(declaration.complianceProfile);
  }
  if (declaration.extraQuantities) {
    builder.setExtraQuantities(declaration.extraQuantities);
  }
  if (declaration.optionHandlersByKey) {
    for (const optionKey of Object.keys(
      declaration.optionHandlersByKey,
    ) as OptionKeyType[]) {
      const handler = declaration.optionHandlersByKey[optionKey];
      if (handler) {
        builder.addOptionHandler(optionKey, handler);
      }
    }
  }
  if (declaration.simulation) {
    builder.setSimulation(declaration.simulation);
  }
  if (declaration.dynamicAxisFields) {
    builder.setDynamicAxisFields(declaration.dynamicAxisFields);
  }
  if (declaration.defaultDynamicAxes) {
    builder.setDefaultDynamicAxes(declaration.defaultDynamicAxes);
  }
  if (declaration.defaultOptions) {
    builder.setDefaultOptions(declaration.defaultOptions);
  }
  if (declaration.parseOptions) {
    builder.setOptionParser(declaration.parseOptions);
  }

  return builder.build();
}
