import { inputOrder, type InputId as InputIdType } from "../../../models/inputSlots";
import type { ModelOptionsState, ResultCellViewModel } from "../types";
import type {
  ComfortModelDefinition,
  DynamicAxisDefaults,
  ModelOptionChangeHandler,
  RuntimeComfortModelDefinition,
  SimulationOutputDeclaration,
} from "./definition";
import type { ComfortModel as ComfortModelType } from "../../../models/comfortModels";
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
import type { StandardId as StandardIdType } from "../../../models/workspaces";
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
  type ChartAxisQuantityId,
  type PhysicalQuantityId as PhysicalQuantityIdType,
  getPhysicalQuantityMeta,
} from "../../../models/physicalQuantities";
import {
  ChartKind,
  type ChartInstanceCapabilities,
  resolveChartCapabilities,
} from "../../../models/output/chartKinds";
import type { ChartInstanceDeclaration } from "../../../models/output/chartKinds";
import {
  TableType,
  type ModelTables,
} from "../../../models/output/tableLayouts";
import {
  supportsExploreWorkspace,
  supportsStandardWorkspace,
  supportsTimeSeriesWorkspace,
  type WorkspaceCapability as WorkspaceCapabilityType,
} from "../../../models/output/workspaceCapabilities";
import { resolveChartBuildResult } from "../../../services/comfort/charts/kinds/index";
import type {
  ChartKindRegistration,
  RegisteredChartKindSpec,
} from "../../../services/comfort/charts/kinds/types";
import { buildCompareMatrixTable } from "../../../services/comfort/output/tableResolver";
export type ResultRowDefinition<T> = {
  title: string;
  group?: string;
  formatter: (result: T) => ResultCellViewModel;
};

export interface OutputChartDeclarationInput {
  readonly instanceId: string;
  readonly kind: ChartKind;
  readonly name: string;
  readonly emptyMessage: string;
  readonly note?: string;
  readonly capabilities?: Partial<ChartInstanceCapabilities>;
  readonly spec: unknown;
  readonly supportedExploreOutputs?: readonly ModelOutput["key"][];
  readonly defaultExploreOutput?: ModelOutput["key"];
}

interface RegisteredOutputChart<
  ResultType,
  ChartSourceType,
  ComplianceBand extends Band,
> {
  readonly declaration: ChartInstanceDeclaration;
  readonly registration: ChartKindRegistration<ResultType, ChartSourceType>;
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
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key) => expected.has(key));
}

/** Strict parser for models whose complete options schema is an empty object. */
export function parseEmptyOptions(value: unknown): ModelOptionsState | null {
  return isRecord(value) && hasExactKeys(value, []) ? {} : null;
}

export function createEmptyResults<T>(): Record<InputIdType, T | null> {
  return inputOrder.reduce((acc, inputId) => {
    acc[inputId] = null;
    return acc;
  }, {} as Record<InputIdType, T | null>);
}

function chartKindToRegistrationKind(kind: ChartKind): RegisteredChartKindSpec<
  unknown,
  unknown,
  object
>["kind"] {
  switch (kind) {
    case ChartKind.DynamicField:
      return "dynamic-field";
    case ChartKind.BoundaryRegion:
      return "boundary-region";
    case ChartKind.BandScalar:
      return "band-scalar";
    case ChartKind.TimeSeriesLine:
      return "time-series-line";
    case ChartKind.ParametricLine:
      return "parametric-line";
    case ChartKind.Custom:
      return "custom";
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unsupported chart kind: ${exhaustive}`);
    }
  }
}

function createChartKindRegistration<
  ResultType,
  ChartSourceType,
>(
  entry: OutputChartDeclarationInput,
): ChartKindRegistration<ResultType, ChartSourceType> {
  return {
    instanceId: entry.instanceId,
    name: entry.name,
    emptyMessage: entry.emptyMessage,
    ...(entry.note ? { note: entry.note } : {}),
    ...(entry.supportedExploreOutputs
      ? { supportedExploreOutputs: [...entry.supportedExploreOutputs] }
      : {}),
    ...(entry.defaultExploreOutput
      ? { defaultExploreOutput: entry.defaultExploreOutput }
      : {}),
    registration: {
      kind: chartKindToRegistrationKind(entry.kind),
      spec: entry.spec,
    } as RegisteredChartKindSpec<ResultType, ChartSourceType, object>,
  };
}

function createChartInstanceDeclaration(
  entry: OutputChartDeclarationInput,
): ChartInstanceDeclaration {
  return {
    instanceId: entry.instanceId,
    kind: entry.kind,
    name: entry.name,
    emptyMessage: entry.emptyMessage,
    ...(entry.note ? { note: entry.note } : {}),
    ...(entry.capabilities
      ? { capabilities: resolveChartCapabilities(entry.kind, entry.capabilities) }
      : {}),
    spec: entry.spec,
  };
}

export class ComfortModelBuilder<
  ResultType,
  ChartSourceType,
  ComplianceBand extends Band = NumericBand,
> {
  private readonly id: ComfortModelType;

  private label?: string;

  private description?: string;

  private workspaceCapabilities?: readonly WorkspaceCapabilityType[];

  private standardIds?: readonly StandardIdType[];

  private exploreOutputs?: readonly ModelOutput[];

  private modifiers?: readonly InputModifier[];

  private complianceProfile?: ComplianceSpec<ComplianceBand, ResultType>;

  private readonly controls: InputControlDefinition[] = [];

  private registeredModelQuantities: PhysicalQuantityIdType[] = [];

  private readonly optionHandlersByKey: Partial<
    Record<OptionKeyType, ModelOptionChangeHandler>
  > = {};

  private tables?: ModelTables<ResultType>;

  private defaultOutputChartInstanceId?: string;

  private readonly registeredOutputCharts: RegisteredOutputChart<
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

  constructor(id: ComfortModelType) {
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

  setWorkspaceCapabilities(capabilities: readonly WorkspaceCapabilityType[]): this {
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
      if (chart.kind !== ChartKind.TimeSeriesLine) {
        throw new Error(
          `Simulation chart ${chart.id} must use ChartKind.TimeSeriesLine.`,
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

  setOutputCharts(
    entries: readonly OutputChartDeclarationInput[],
    options?: { defaultInstanceId?: string },
  ): this {
    if (entries.length === 0) {
      throw new Error("Comfort model declarations require at least one output chart.");
    }

    const defaultInstanceId = options?.defaultInstanceId ?? entries[0]!.instanceId;
    this.defaultOutputChartInstanceId = defaultInstanceId;

    for (const entry of entries) {
      this.registerOutputChart(entry);
    }

    return this;
  }

  setInputFields(specs: readonly InputFieldSpec[]): this {
    for (const spec of specs) {
      this.controls.push(resolveInputField(spec));
    }
    return this;
  }

  registerModelQuantities(quantityIds: readonly PhysicalQuantityIdType[]): this {
    this.registeredModelQuantities.push(...quantityIds);
    return this;
  }

  addOptionHandler(optionKey: OptionKeyType, handler: ModelOptionChangeHandler): this {
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

  setCalculator(calculator: ComfortModelDefinition<
    ResultType,
    ChartSourceType,
    ComplianceBand
  >["calculate"]): this {
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

  private registerOutputChart(entry: OutputChartDeclarationInput): void {
    if (this.registeredOutputCharts.some(
      ({ registration }) => registration.instanceId === entry.instanceId,
    )) {
      throw new Error(
        `Comfort model declarations cannot contain duplicate chart instance IDs (${entry.instanceId}).`,
      );
    }

    this.registeredOutputCharts.push({
      declaration: createChartInstanceDeclaration(entry),
      registration: createChartKindRegistration<ResultType, ChartSourceType>(entry),
    });

    if (!this.defaultOutputChartInstanceId) {
      this.defaultOutputChartInstanceId = entry.instanceId;
    }
  }

  private mergeDynamicAxisFields(): readonly ChartAxisQuantityId[] {
    const explicitFields = this.dynamicAxisFields ?? [];
    if (new Set(explicitFields).size !== explicitFields.length) {
      throw new Error("Dynamic axis fields cannot contain duplicates.");
    }

    const registeredFields = this.registeredOutputCharts.flatMap(({ registration }) => {
      if (registration.registration.kind !== "dynamic-field") {
        return [];
      }
      return registration.registration.spec.axisFields;
    });

    return [...new Set([...explicitFields, ...registeredFields])];
  }

  private resolveOutputCharts(): ComfortModelDefinition<
    ResultType,
    ChartSourceType,
    ComplianceBand
  >["outputCharts"] {
    const entries = this.registeredOutputCharts.map(({ declaration }) => ({
      ...declaration,
      ...(declaration.capabilities
        ? { capabilities: { ...declaration.capabilities } }
        : {}),
    }));

    const defaultInstanceId = this.defaultOutputChartInstanceId ?? entries[0]?.instanceId;
    if (!defaultInstanceId) {
      throw new Error("Comfort model declarations require at least one output chart.");
    }

    return {
      defaultInstanceId,
      entries,
    };
  }

  build(): RuntimeComfortModelDefinition {
    const workspaceCapabilities = this.workspaceCapabilities;
    if (!workspaceCapabilities || workspaceCapabilities.length === 0) {
      throw new Error("Comfort model declarations require at least one workspace capability.");
    }

    if (new Set(workspaceCapabilities).size !== workspaceCapabilities.length) {
      throw new Error("Comfort model declarations cannot contain duplicate workspace capabilities.");
    }

    const exploreOutputs = this.exploreOutputs;
    if (!exploreOutputs) {
      throw new Error("Comfort model declarations must explicitly set explore outputs.");
    }

    const outputKeys = exploreOutputs.map((output) => output.key);
    if (new Set(outputKeys).size !== outputKeys.length) {
      throw new Error("Comfort model declarations cannot contain duplicate output keys.");
    }

    const modifiers = this.modifiers;
    if (!modifiers) {
      throw new Error("Comfort model declarations must explicitly set supported modifiers.");
    }
    const modifierIds = modifiers.map(({ id }) => id);
    if (new Set(modifierIds).size !== modifierIds.length) {
      throw new Error("Comfort model declarations cannot contain duplicate modifiers.");
    }
    const modifierPositions = modifierIds.map((modifierId) => (
      modifierOrder.indexOf(modifierId)
    ));
    if (
      modifierPositions.some((position) => position < 0)
      || modifierPositions.some((position, index) => (
        index > 0 && position <= modifierPositions[index - 1]
      ))
    ) {
      throw new Error("Comfort model declarations must follow the global modifier order.");
    }

    const supportsStandard = supportsStandardWorkspace(workspaceCapabilities);
    const supportsExplore = supportsExploreWorkspace(workspaceCapabilities);
    const supportsTimeSeries = supportsTimeSeriesWorkspace(workspaceCapabilities);

    const standardIds = this.standardIds;
    if (!standardIds) {
      throw new Error("Comfort model declarations must explicitly set standard IDs.");
    }
    if (new Set(standardIds).size !== standardIds.length) {
      throw new Error("Comfort model declarations cannot contain duplicate standard IDs.");
    }
    if (supportsStandard && standardIds.length === 0) {
      throw new Error("Standard workspace models must declare at least one standard ID.");
    }
    if (!supportsStandard && standardIds.length > 0) {
      throw new Error("Models without Standard workspace capability cannot declare a standard ID.");
    }

    if (supportsExplore && exploreOutputs.length === 0) {
      throw new Error("Explore workspace requires at least one explore output.");
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
        !this.complianceProfile
        || this.complianceProfile.bands.length === 0
        || this.complianceProfile.legendTitle.trim().length === 0
        || this.complianceProfile.caption.trim().length === 0
      )
    ) {
      throw new Error("Standard workspace requires a non-empty compliance profile.");
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
      throw new Error("Comfort model declarations require a non-empty description.");
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
      throw new Error("Time-series workspace capability requires tables.timeSeries.");
    }

    if (supportsTimeSeries && !this.simulationOutput) {
      throw new Error("Time-series workspace capability requires simulation charts.");
    }

    if (this.simulationOutput && !supportsTimeSeries) {
      throw new Error("Simulation charts require Time-series workspace capability.");
    }

    if (this.simulationOutput && this.simulationOutput.charts.length === 0) {
      throw new Error("Simulation output requires at least one chart.");
    }

    const outputCharts = this.resolveOutputCharts();
    if (outputCharts.entries.length === 0) {
      throw new Error("Comfort model declarations require at least one output chart.");
    }

    const instanceIds = outputCharts.entries.map(({ instanceId }) => instanceId);
    if (new Set(instanceIds).size !== instanceIds.length) {
      throw new Error("Comfort model declarations cannot contain duplicate chart instance IDs.");
    }

    if (!instanceIds.includes(outputCharts.defaultInstanceId)) {
      throw new Error("The default output chart must belong to the declared chart instances.");
    }

    for (const chart of outputCharts.entries) {
      if (!chart.name.trim() || !chart.emptyMessage.trim()) {
        throw new Error("Chart definitions require a name and empty message.");
      }

      const capabilities = chart.capabilities
        ?? resolveChartCapabilities(chart.kind);
      if (capabilities.locksYAxis && !capabilities.allowsAxisSelection) {
        throw new Error("A locked Y axis requires an axis-selectable chart.");
      }

      const registration = this.registeredOutputCharts.find(
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
          throw new Error("Chart-specific Explore outputs cannot contain duplicates.");
        }
        if (supportedExploreOutputs.some((outputKey) => !outputKeys.includes(outputKey))) {
          throw new Error("Chart-specific Explore outputs must belong to the model declaration.");
        }
      }
      const defaultExploreOutput = registration?.defaultExploreOutput;
      if (
        defaultExploreOutput
        && (
          !outputKeys.includes(defaultExploreOutput)
          || (supportedExploreOutputs
            && !supportedExploreOutputs.includes(defaultExploreOutput))
        )
      ) {
        throw new Error("A chart's default Explore output must be supported by that chart.");
      }
    }

    if (this.defaultOptions === undefined) {
      throw new Error("Comfort model declarations must explicitly set default options.");
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

    const modelQuantities = [...new Set(this.registeredModelQuantities)];
    for (const quantityId of modelQuantities) {
      const meta = getPhysicalQuantityMeta(quantityId);
      if (meta.ownerModelId !== this.id) {
        throw new Error(
          `Model quantity ${quantityId} is not owned by ${this.id}.`,
        );
      }
    }

    const complianceProfile = this.complianceProfile;
    const calculate = this.calculate;
    const chartKindRegistrations = this.registeredOutputCharts.map(
      ({ registration }) => registration,
    );
    const registeredOutputChartsForBuild = this.registeredOutputCharts;
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
              getFeedback: (result: unknown) => complianceProfile.getFeedback(
                result as ResultType,
              ),
            },
          }
        : {}),
      controls: [...this.controls],
      modelQuantities,
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
      outputCharts: {
        defaultInstanceId: outputCharts.defaultInstanceId,
        entries: outputCharts.entries.map((entry) => ({
          ...entry,
          ...(entry.capabilities
            ? { capabilities: { ...entry.capabilities } }
            : {}),
        })),
      },
      chartKindRegistrations: [...chartKindRegistrations] as RuntimeComfortModelDefinition[
        "chartKindRegistrations"
      ],
      defaultOptions: { ...defaultOptions },
      parseOptions: this.parseOptions,
      calculate: (context, visibleInputIds) => calculate(context, visibleInputIds),
      buildTable: (resultsByInput, visibleInputIds, unitSystem) => {
        return buildCompareMatrixTable(
          tables.analysis,
          resultsByInput as Record<InputIdType, ResultType | null>,
          visibleInputIds,
          unitSystem,
        );
      },
      buildChart: (instanceId, chartSource, resultsByInput, profile, context) => {
        const chartEntry = registeredOutputChartsForBuild.find(
          ({ declaration }) => declaration.instanceId === instanceId,
        );
        const showsLegend = chartEntry
          ? resolveChartCapabilities(
            chartEntry.declaration.kind,
            chartEntry.declaration.capabilities,
          ).showsLegend
          : false;
        return resolveChartBuildResult({
          modelId: builtModelId,
          registrations: chartKindRegistrations,
          instanceId,
          chartSource: chartSource as ChartSourceType | null,
          resultsByInput: resultsByInput as Record<InputIdType, ResultType | null>,
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
              charts: this.simulationOutput.charts.map((chart) => ({ ...chart })),
            },
          }
        : {}),
    };
  }
}
