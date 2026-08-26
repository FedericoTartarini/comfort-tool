import {
  inputOrder,
  type InputId as InputIdType,
} from "../../../models/inputSlots";
import type { ModelOptionsState, ResultCellViewModel } from "../types";
import type {
  ComfortModelDefinition,
  DynamicAxisDefaults,
  ModelOptionChangeHandler,
  RuntimeComfortModelDefinition,
  SimulationOutputDeclaration,
} from "./definition";
import type { ModelId as ModelIdType } from "../../../models/modelIds";
import type { OptionKey as OptionKeyType } from "../../../models/inputModes";
import {
  modifierOrder,
  type InputModifier,
} from "../../../models/inputModifiers";
import type { InputControlDefinition } from "../../../services/comfort/controls/types";
import {
  resolveInputField,
  type InputFieldSpec,
} from "../../../services/comfort/controls/fieldInputBehaviors";
import {
  supportsExploreWorkspace,
  supportsStandardWorkspace,
  supportsTimeSeriesWorkspace,
  type StandardId as StandardIdType,
  type WorkspaceId as WorkspaceIdType,
} from "../../../models/workspaces";
import {
  type Band,
  type ComplianceSpec,
  type ModelOutput,
  type NumericBand,
} from "../../../models/modelCapabilities";
import {
  cloneNumericBands,
  validateNumericBands,
} from "../../../services/comfort/charts/bands";
import {
  PhysicalQuantityScope,
  primaryInputOrder,
  systemQuantityMetaById,
  type ChartAxisQuantityId,
  type QuantityExtension,
} from "../../../models/quantities";
import {
  ChartEngine,
  isChartEngine,
  isModelChartEngine,
  modelAllowsCustomCharts,
  resolveChartCapabilities,
} from "../../../models/chartEngines";
import type { ChartInstanceDeclaration } from "../../../models/chartEngines";
import {
  TableType,
  type ModelTables,
} from "../../../models/output/tableLayouts";
import { resolveChartBuildResult } from "../../../services/comfort/charts/kinds/index";
import {
  modelChartSpecMatchesEngine,
  specHasPlotlyBuild,
  type ChartEngineRegistration,
  type ModelChartDeclaration,
  type FrontendChartDeclaration,
  type ChartDeclarationInput,
  type RegisteredChartEngineSpec,
} from "../../../services/comfort/charts/kinds/types";
import { buildCompareMatrixTable } from "../../../services/comfort/output/tableResolver";

export type { ModelChartDeclaration, FrontendChartDeclaration, ChartDeclarationInput };

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

function toRegisteredChartEngineSpec<ResultType, ChartSourceType>(
  entry: FrontendChartDeclaration<ResultType, ChartSourceType>,
): RegisteredChartEngineSpec<ResultType, ChartSourceType> {
  if (!isChartEngine(entry.engine)) {
    throw new Error(
      `Unknown chart engine "${String(entry.engine)}". ChartEngine is a closed set.`,
    );
  }
  switch (entry.engine) {
    case ChartEngine.DynamicField:
      return { engine: ChartEngine.DynamicField, spec: entry.spec };
    case ChartEngine.BoundaryRegion:
      return { engine: ChartEngine.BoundaryRegion, spec: entry.spec };
    case ChartEngine.ParametricLine:
      return { engine: ChartEngine.ParametricLine, spec: entry.spec };
    case ChartEngine.BandScalar:
      return { engine: ChartEngine.BandScalar, spec: entry.spec };
    case ChartEngine.TimeSeriesLine:
      return { engine: ChartEngine.TimeSeriesLine, spec: entry.spec };
    case ChartEngine.Custom:
      return { engine: ChartEngine.Custom, spec: entry.spec };
  }
}

function createChartEngineRegistration<ResultType, ChartSourceType>(
  entry: FrontendChartDeclaration<ResultType, ChartSourceType>,
): ChartEngineRegistration<ResultType, ChartSourceType> {
  return {
    instanceId: entry.id,
    name: entry.name,
    emptyMessage: entry.emptyMessage,
    ...(entry.note ? { note: entry.note } : {}),
    ...(entry.supportedExploreOutputs
      ? { supportedExploreOutputs: [...entry.supportedExploreOutputs] }
      : {}),
    ...(entry.defaultExploreOutput
      ? { defaultExploreOutput: entry.defaultExploreOutput }
      : {}),
    registration: toRegisteredChartEngineSpec(entry),
  };
}

function createChartInstanceDeclaration<ResultType, ChartSourceType>(
  entry: FrontendChartDeclaration<ResultType, ChartSourceType>,
): ChartInstanceDeclaration {
  return {
    instanceId: entry.id,
    engine: entry.engine,
    name: entry.name,
    emptyMessage: entry.emptyMessage,
    ...(entry.note ? { note: entry.note } : {}),
    ...(entry.type?.trim() ? { type: entry.type.trim() } : {}),
    ...(entry.capabilities
      ? {
          capabilities: resolveChartCapabilities(
            entry.engine,
            entry.capabilities,
          ),
        }
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

  private workspaceCapabilities?: readonly WorkspaceIdType[];

  private standardIds?: readonly StandardIdType[];

  private exploreOutputs?: readonly ModelOutput[];

  private modifiers?: readonly InputModifier[];

  private complianceProfile?: ComplianceSpec<ComplianceBand, ResultType>;

  private readonly controls: InputControlDefinition[] = [];

  private readonly inputFieldSpecs: InputFieldSpec[] = [];

  private quantityExtensions: QuantityExtension[] = [];

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

  setWorkspaceCapabilities(
    capabilities: readonly WorkspaceIdType[],
  ): this {
    this.workspaceCapabilities = capabilities;
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
      if (chart.engine !== ChartEngine.TimeSeriesLine) {
        throw new Error(
          `Simulation chart ${chart.id} must use ChartEngine.TimeSeriesLine.`,
        );
      }
    }
    this.simulationOutput = simulation;
    return this;
  }

  setTables(tables: ModelTables<ResultType>): this {
    this.tables = tables;
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

  extendQuantities(extensions: readonly QuantityExtension[]): this {
    this.quantityExtensions.push(...extensions);
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
    if (
      entry.engine === ChartEngine.Custom
      && !modelAllowsCustomCharts(this.id)
    ) {
      throw new Error(
        `Custom chart "${entry.id}" is not allowed. Custom is frontend-only for PMV psychrometric geometry.`,
      );
    }
    const chartType = entry.type?.trim();
    if (entry.type !== undefined && chartType === "") {
      throw new Error(
        `Chart "${entry.id}" has an empty type. Named chart types must be non-empty.`,
      );
    }
    if (
      chartType
      && this.registeredCharts.some(
        ({ declaration }) => declaration.type === chartType,
      )
    ) {
      throw new Error(
        `Comfort model declarations cannot contain duplicate chart types (${chartType}).`,
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

  private validateQuantityExtensions(): readonly QuantityExtension[] {
    const seenIds = new Set<string>();
    const extensions: QuantityExtension[] = [];

    for (const extension of this.quantityExtensions) {
      if (extension.owner !== this.id) {
        throw new Error(
          `Quantity extension ${extension.id} owner ${extension.owner} does not match ${this.id}.`,
        );
      }
      if (extension.scope !== PhysicalQuantityScope.Model) {
        throw new Error(
          `Quantity extension ${extension.id} must use scope "${PhysicalQuantityScope.Model}".`,
        );
      }
      if (extension.id in systemQuantityMetaById) {
        throw new Error(
          `Quantity extension ${extension.id} collides with a system-seed quantity.`,
        );
      }
      if (primaryInputOrder.some((id) => id === extension.id)) {
        throw new Error(
          `Extended quantity ${extension.id} must not enter primaryInputOrder.`,
        );
      }
      if (seenIds.has(extension.id)) {
        throw new Error(
          `Comfort model declarations cannot contain duplicate quantity ids (${extension.id}).`,
        );
      }
      if (!(extension.minSi < extension.maxSi)) {
        throw new Error(
          `Quantity extension ${extension.id} requires minSi < maxSi.`,
        );
      }
      if (
        extension.defaultSi < extension.minSi ||
        extension.defaultSi > extension.maxSi
      ) {
        throw new Error(
          `Quantity extension ${extension.id} defaultSi must lie within minSi and maxSi.`,
        );
      }
      seenIds.add(extension.id);
      extensions.push({ ...extension, display: { ...extension.display } });
    }

    return extensions;
  }

  private assertModelQuantityFields(
    extensions: readonly QuantityExtension[],
  ): void {
    const ownedIds = new Set(extensions.map((extension) => extension.id));
    for (const spec of this.inputFieldSpecs) {
      if (spec.kind !== "modelQuantity") continue;
      if (!ownedIds.has(spec.quantityId)) {
        throw new Error(
          `modelQuantity field ${spec.quantityId} must reference a quantities.extend entry owned by ${this.id}.`,
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
        if (registration.registration.engine !== ChartEngine.DynamicField) {
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
    const workspaceCapabilities = this.workspaceCapabilities;
    if (!workspaceCapabilities || workspaceCapabilities.length === 0) {
      throw new Error(
        "Comfort model declarations require at least one workspace capability.",
      );
    }

    if (new Set(workspaceCapabilities).size !== workspaceCapabilities.length) {
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

    const supportsStandard = supportsStandardWorkspace(workspaceCapabilities);
    const supportsExplore = supportsExploreWorkspace(workspaceCapabilities);
    const supportsTimeSeries = supportsTimeSeriesWorkspace(
      workspaceCapabilities,
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

    if (tables.analysis.type !== TableType.Analysis) {
      throw new Error("tables.analysis must use TableType.Analysis.");
    }

    if (tables.analysis.rows.length === 0) {
      throw new Error("tables.analysis requires at least one row.");
    }

    if (tables.timeSeries) {
      if (!supportsTimeSeries) {
        throw new Error(
          "tables.timeSeries is allowed only with Time-series workspace capability.",
        );
      }
      if (tables.timeSeries.type !== TableType.TimeSeries) {
        throw new Error("tables.timeSeries must use TableType.TimeSeries.");
      }
      if (tables.timeSeries.rows.length === 0) {
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
      if (!chart.name.trim() || !chart.emptyMessage.trim()) {
        throw new Error("Chart definitions require a name and empty message.");
      }

      const capabilities =
        chart.capabilities ?? resolveChartCapabilities(chart.engine);
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

    const quantityExtensions = this.validateQuantityExtensions();
    this.assertModelQuantityFields(quantityExtensions);

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
      workspaceCapabilities: [...workspaceCapabilities],
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
      quantities: {
        extend: quantityExtensions,
      },
      optionHandlersByKey: { ...this.optionHandlersByKey },
      tables: {
        analysis: {
          type: tables.analysis.type,
          rows: [...tables.analysis.rows],
        },
        ...(tables.timeSeries
          ? {
              timeSeries: {
                type: tables.timeSeries.type,
                rows: [...tables.timeSeries.rows],
              },
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
          tables.analysis,
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
              chartEntry.declaration.engine,
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
 * Charts are a data-only discriminated union over existing engines
 * (`ModelChartDeclaration`). Custom and Plotly `build` are forbidden.
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
  readonly workspaceCapabilities: readonly WorkspaceIdType[];
  readonly exploreOutputs: readonly ModelOutput[];
  readonly modifiers: readonly InputModifier[];
  readonly complianceProfile?: ComplianceSpec<ComplianceBand, ResultType>;
  readonly inputFields: readonly InputFieldSpec[];
  readonly quantities?: {
    readonly extend?: readonly QuantityExtension[];
  };
  readonly optionHandlersByKey?: Partial<
    Record<OptionKeyType, ModelOptionChangeHandler>
  >;
  readonly charts: readonly ModelChartDeclaration<ResultType>[];
  readonly defaultChartId?: string;
  readonly tables: ModelTables<ResultType>;
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

function assertModelChartDeclarations<TResult>(
  charts: readonly ModelChartDeclaration<TResult>[],
): void {
  for (const chart of charts) {
    if (!isModelChartEngine(chart.engine)) {
      throw new Error(
        `defineModel chart "${chart.id}" uses engine "${String(chart.engine)}". defineModel cannot add ChartEngine members or declare Custom.`,
      );
    }
    if (specHasPlotlyBuild(chart.spec)) {
      throw new Error(
        `defineModel chart "${chart.id}" must be data-only. defineModel cannot provide a Plotly build.`,
      );
    }
    if (!modelChartSpecMatchesEngine(chart)) {
      throw new Error(
        `defineModel chart "${chart.id}" spec does not match engine "${chart.engine}". Extended types cannot escape the ChartEngine spec union.`,
      );
    }
  }
}

/** Sole assembly function for a complete model declaration. Do not add defineIndexModel(). */
export function defineModel<
  ResultType,
  ChartSourceType,
  ComplianceBand extends Band = NumericBand,
>(
  declaration: ModelDeclaration<ResultType, ChartSourceType, ComplianceBand>,
): RuntimeComfortModelDefinition {
  assertModelChartDeclarations(declaration.charts);

  const builder = new ComfortModelBuilder<
    ResultType,
    ChartSourceType,
    ComplianceBand
  >(declaration.id);

  builder
    .setLabel(declaration.label)
    .setDescription(declaration.description)
    .setStandardIds(declaration.standardIds)
    .setWorkspaceCapabilities(declaration.workspaceCapabilities)
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
  if (declaration.quantities?.extend) {
    builder.extendQuantities(declaration.quantities.extend);
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
