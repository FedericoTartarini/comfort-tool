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
  resolveInputField,
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
  type ComplianceSpec,
  type ModelOutput,
  type NumericBand,
} from "../../catalog/modelCapabilities";
import {
  cloneNumericBands,
  validateNumericBands,
} from "../../engines/comfort/charts/bands";
import {
  isExtraQuantityId,
  isPhysicalQuantityId,
  type ChartAxisQuantityId,
  type PhysicalQuantityId as PhysicalQuantityIdType,
} from "../../catalog/quantities";
import {
  ChartType,
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
  modelChartSpecMatchesType,
  type ChartEngineRegistration,
  type FrontendChartDeclaration,
  type RegisteredChartEngineSpec,
} from "../../engines/comfort/charts/kinds/types";
import { compileModelTables } from "../../engines/comfort/output/compileTableRows";
import { buildCompareMatrixTable } from "../../engines/comfort/output/tableResolver";

export type { FrontendChartDeclaration };

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

function createChartEngineRegistration<ResultType, ChartSourceType>(
  entry: FrontendChartDeclaration<ResultType, ChartSourceType>,
): ChartEngineRegistration<ResultType, ChartSourceType> {
  return {
    instanceId: entry.id,
    type: entry.type,
    emptyMessage: entry.emptyMessage,
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
): ChartInstanceDeclaration {
  return {
    instanceId: entry.id,
    type: entry.type,
    emptyMessage: entry.emptyMessage,
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

  private dynamicAxisFields?: readonly ChartAxisQuantityId[];

  private defaultDynamicAxes?: DynamicAxisDefaults;

  constructor(id: ModelIdType) {
    this.id = id;
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
    options?: { defaultChartId?: string },
  ): this {
    if (entries.length === 0) {
      throw new Error(
        "Comfort model declarations require at least one output chart.",
      );
    }

    const defaultChartId = options?.defaultChartId ?? entries[0]!.id;
    this.defaultChartId = defaultChartId;

    for (const entry of entries) {
      this.registerChart(entry);
    }

    return this;
  }

  setInputFields(specs: readonly InputFieldSpec[]): this {
    for (const spec of specs) {
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

  setDynamicAxisFields(fields: readonly ChartAxisQuantityId[]): this {
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
        `Chart "${entry.id}" spec does not match type "${entry.type}".`,
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
    if (
      this.registeredCharts.some(
        ({ registration }) => registration.instanceId === entry.id,
      )
    ) {
      throw new Error(
        `Comfort model declarations cannot contain duplicate chart instance IDs (${entry.id}).`,
      );
    }

    this.registeredCharts.push({
      declaration: createChartInstanceDeclaration(entry),
      registration: createChartEngineRegistration<ResultType, ChartSourceType>(
        entry,
      ),
    });

    if (!this.defaultChartId) {
      this.defaultChartId = entry.id;
    }
  }

  private validateExtraQuantities(): readonly PhysicalQuantityIdType[] {
    const seenIds = new Set<string>();
    const extras: PhysicalQuantityIdType[] = [];

    for (const quantityId of this.extraQuantities) {
      if (!isPhysicalQuantityId(quantityId) || !isExtraQuantityId(quantityId)) {
        throw new Error(
          `Unknown extra quantity "${String(quantityId)}". Extra quantities must be catalog Extra ids.`,
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
      if (!isPhysicalQuantityId(spec.quantityId) || !isExtraQuantityId(spec.quantityId)) {
        throw new Error(
          `quantity field ${spec.quantityId} must reference a catalog Extra quantity.`,
        );
      }
      if (!selectedIds.has(spec.quantityId)) {
        throw new Error(
          `quantity field ${spec.quantityId} must be listed in extraQuantities.`,
        );
      }
    }
  }

  private mergeDynamicAxisFields(): readonly ChartAxisQuantityId[] {
    const explicitFields = this.dynamicAxisFields ?? [];
    if (new Set(explicitFields).size !== explicitFields.length) {
      throw new Error("Dynamic axis fields cannot contain duplicates.");
    }

    const registeredFields = this.registeredCharts.flatMap(
      ({ registration }) => {
        if (registration.registration.type !== ChartType.Dynamic) {
          return [];
        }
        return registration.registration.spec.axisFields;
      },
    );

    return [...new Set([...explicitFields, ...registeredFields])];
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

    const tables = this.tables;
    if (!tables) {
      throw new Error("Comfort model declarations must set tables.");
    }

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
      throw new Error(
        "Comfort model declarations must explicitly set default options.",
      );
    }

    if (!this.parseOptions) {
      throw new Error("Comfort model declarations must set an option parser.");
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

    const dynamicAxisFields = this.mergeDynamicAxisFields();
    const defaultDynamicAxes = this.defaultDynamicAxes;
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
  readonly label: string;
  readonly description: string;
  readonly standardIds: readonly StandardIdType[];
  readonly surfaceCapabilities: readonly SurfaceIdType[];
  readonly exploreOutputs: readonly ModelOutput[];
  readonly modifiers: readonly InputModifier[];
  readonly complianceProfile?: ComplianceSpec<ComplianceBand, ResultType>;
  readonly inputFields: readonly InputFieldSpec[];
  readonly extraQuantities?: readonly PhysicalQuantityIdType[];
  readonly optionHandlersByKey?: Partial<
    Record<OptionKeyType, ModelOptionChangeHandler>
  >;
  readonly charts: readonly FrontendChartDeclaration<ResultType, ChartSourceType>[];
  readonly defaultChartId?: string;
  readonly tables: ModelTablesAuthoring<ResultType>;
  readonly calculate: ComfortModelDefinition<
    ResultType,
    ChartSourceType,
    ComplianceBand
  >["calculate"];
  readonly simulation?: SimulationOutputDeclaration;
  readonly dynamicAxisFields?: readonly ChartAxisQuantityId[];
  readonly defaultDynamicAxes: DynamicAxisDefaults;
  readonly defaultOptions: Partial<Record<OptionKeyType, string>>;
  readonly parseOptions: (value: unknown) => ModelOptionsState | null;
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
        `defineModel chart "${chart.id}" spec does not match type "${chart.type}".`,
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
    .setLabel(declaration.label)
    .setDescription(declaration.description)
    .setStandardIds(declaration.standardIds)
    .setSurfaceCapabilities(declaration.surfaceCapabilities)
    .setExploreOutputs(declaration.exploreOutputs)
    .setModifiers(declaration.modifiers)
    .setCharts(declaration.charts, {
      defaultChartId: declaration.defaultChartId,
    })
    .setInputFields(declaration.inputFields)
    .setTables(declaration.tables)
    .setCalculator(declaration.calculate)
    .setDefaultDynamicAxes(declaration.defaultDynamicAxes)
    .setDefaultOptions(declaration.defaultOptions)
    .setOptionParser(declaration.parseOptions);

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

  return builder.build();
}
