import { inputOrder, type InputId as InputIdType } from "../../../models/inputSlots";
import type { ResultSectionViewModel, ModelOptionsState, ResultCellViewModel } from "../types";
import type {
  ComfortModelDefinition,
  DynamicAxisDefaults,
  ModelOptionChangeHandler,
} from "./index";
import type { ComfortModel as ComfortModelType } from "../../../models/comfortModels";
import type { FieldKey as FieldKeyType } from "../../../models/fieldKeys";
import type { ModelCharts } from "../../../models/chartOptions";
import type { OptionKey as OptionKeyType } from "../../../models/inputModes";
import {
  modifierOrder,
  type ModifierId as ModifierIdType,
} from "../../../models/inputModifiers";
import type { InputControlDefinition } from "../../../services/comfort/controls/types";
import type { ThermalZone } from "../../../models/thermalZone";
import {
  ChartMode,
  type Band,
  type ChartMode as ChartModeType,
  type ComplianceSpec,
  type ModelOutput,
  type NumericBand,
} from "../../../models/modelCapabilities";
import {
  cloneNumericBands,
  validateNumericBands,
} from "../../../services/comfort/charts/bands";

export type ResultRowDefinition<T> = {
  title: string;
  group?: string;
  formatter: (result: T) => ResultCellViewModel;
};

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

export function buildResultSection<T>(
  title: string,
  resultsByInput: Record<InputIdType, T | null>,
  visibleInputIds: InputIdType[],
  formatter: (result: T) => ResultCellViewModel,
  group?: string,
): ResultSectionViewModel {
  return {
    title,
    group,
    valuesByInput: visibleInputIds.reduce((acc, inputId) => {
      const result = resultsByInput[inputId];
      let formattedValue = null;

      if (result) {
        formattedValue = formatter(result);
      }

      acc[inputId] = formattedValue;
      return acc;
    }, {} as Record<InputIdType, ResultCellViewModel | null>),
  };
}

export function buildResultSectionsFromRows<T>(
  rows: ResultRowDefinition<T>[],
  resultsByInput: Record<InputIdType, T | null>,
  visibleInputIds: InputIdType[],
): ResultSectionViewModel[] {
  return rows.map((row) => (
    buildResultSection(row.title, resultsByInput, visibleInputIds, row.formatter, row.group)
  ));
}

export class ComfortModelBuilder<
  ResultType,
  ChartSourceType,
  ComplianceBand extends Band = NumericBand,
> {
  private readonly id: ComfortModelType;

  private label?: string;

  private description?: string;

  private modes?: readonly ChartModeType[];

  private chartableOutputs?: readonly ModelOutput[];

  private supportedModifiers?: readonly ModifierIdType[];

  private complianceSpec?: ComplianceSpec<ComplianceBand, ResultType>;

  private readonly controls: InputControlDefinition[] = [];

  private readonly optionHandlersByKey: Partial<
    Record<OptionKeyType, ModelOptionChangeHandler>
  > = {};

  private charts?: ModelCharts;

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

  private buildResultSections?: ComfortModelDefinition<
    ResultType,
    ChartSourceType,
    ComplianceBand
  >["buildResultSections"];

  private buildChartResult?: ComfortModelDefinition<
    ResultType,
    ChartSourceType,
    ComplianceBand
  >["buildChartResult"];

  private dynamicAxisFields?: readonly FieldKeyType[];

  private defaultDynamicAxes?: DynamicAxisDefaults;

  private zones: readonly ThermalZone[] = [];

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

  setModes(modes: readonly ChartModeType[]): this {
    this.modes = modes;
    return this;
  }

  setChartableOutputs(outputs: readonly ModelOutput[]): this {
    this.chartableOutputs = outputs;
    return this;
  }

  setModifiers(modifiers: readonly ModifierIdType[]): this {
    this.supportedModifiers = modifiers;
    return this;
  }

  setComplianceSpec(spec: ComplianceSpec<ComplianceBand, ResultType>): this {
    this.complianceSpec = spec;
    return this;
  }

  addControl(definition: InputControlDefinition): this {
    this.controls.push(definition);
    return this;
  }

  addOptionHandler(optionKey: OptionKeyType, handler: ModelOptionChangeHandler): this {
    this.optionHandlersByKey[optionKey] = handler;
    return this;
  }

  setCharts(charts: ModelCharts): this {
    this.charts = charts;
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

  setResultBuilder(builder: ComfortModelDefinition<
    ResultType,
    ChartSourceType,
    ComplianceBand
  >["buildResultSections"]): this {
    this.buildResultSections = builder;
    return this;
  }

  setChartBuilder(builder: ComfortModelDefinition<
    ResultType,
    ChartSourceType,
    ComplianceBand
  >["buildChartResult"]): this {
    this.buildChartResult = builder;
    return this;
  }

  setDynamicAxisFields(fields: readonly FieldKeyType[]): this {
    this.dynamicAxisFields = fields;
    return this;
  }

  setDefaultDynamicAxes(defaults: DynamicAxisDefaults): this {
    this.defaultDynamicAxes = defaults;
    return this;
  }

  setZones(zones: readonly ThermalZone[]): this {
    this.zones = zones;
    return this;
  }

  build(): ComfortModelDefinition<ResultType, ChartSourceType, ComplianceBand> {
    const modes = this.modes;
    if (!modes || modes.length === 0) {
      throw new Error("Comfort model declarations require at least one mode.");
    }

    if (new Set(modes).size !== modes.length) {
      throw new Error("Comfort model declarations cannot contain duplicate modes.");
    }

    const chartableOutputs = this.chartableOutputs;
    if (!chartableOutputs) {
      throw new Error("Comfort model declarations must explicitly set chartable outputs.");
    }

    const outputKeys = chartableOutputs.map((output) => output.key);
    if (new Set(outputKeys).size !== outputKeys.length) {
      throw new Error("Comfort model declarations cannot contain duplicate output keys.");
    }

    const supportedModifiers = this.supportedModifiers;
    if (!supportedModifiers) {
      throw new Error("Comfort model declarations must explicitly set supported modifiers.");
    }
    if (new Set(supportedModifiers).size !== supportedModifiers.length) {
      throw new Error("Comfort model declarations cannot contain duplicate modifiers.");
    }
    const knownModifierIds = new Set(modifierOrder);
    if (supportedModifiers.some((modifierId) => !knownModifierIds.has(modifierId))) {
      throw new Error("Comfort model declarations cannot contain unknown modifiers.");
    }

    const supportsExplore = modes.includes(ChartMode.Explore);
    const supportsCompliance = modes.includes(ChartMode.Compliance);

    if (supportsExplore && chartableOutputs.length === 0) {
      throw new Error("Explore mode requires at least one chartable output.");
    }

    for (const output of chartableOutputs) {
      const validation = validateNumericBands(output.defaultBands);
      if (!validation.valid) {
        throw new Error(
          `Explore output ${output.key} has invalid default bands: ${validation.issues[0].message}`,
        );
      }
    }

    if (
      supportsCompliance
      && (
        !this.complianceSpec
        || this.complianceSpec.bands.length === 0
        || typeof this.complianceSpec.legendTitle !== "string"
        || this.complianceSpec.legendTitle.trim().length === 0
        || typeof this.complianceSpec.caption !== "string"
        || this.complianceSpec.caption.trim().length === 0
        || typeof this.complianceSpec.getFeedback !== "function"
      )
    ) {
      throw new Error("Compliance mode requires a non-empty compliance specification.");
    }

    if (!supportsCompliance && this.complianceSpec) {
      throw new Error("A model without Compliance mode cannot declare a compliance specification.");
    }

    if (typeof this.label !== "string" || this.label.trim().length === 0) {
      throw new Error("Comfort model declarations require a non-empty label.");
    }

    if (typeof this.description !== "string" || this.description.trim().length === 0) {
      throw new Error("Comfort model declarations require a non-empty description.");
    }

    const charts = this.charts;
    if (!charts || charts.entries.length === 0) {
      throw new Error("Comfort model declarations require at least one chart definition.");
    }

    const chartIds = charts.entries.map(({ id }) => id);
    if (chartIds.some((chartId) => chartId.trim().length === 0)) {
      throw new Error("Comfort model declarations require non-empty chart IDs.");
    }

    if (new Set(chartIds).size !== chartIds.length) {
      throw new Error("Comfort model declarations cannot contain duplicate chart IDs.");
    }

    if (!charts.defaultId || !chartIds.includes(charts.defaultId)) {
      throw new Error("The default chart must belong to the declared chart definitions.");
    }

    for (const chart of charts.entries) {
      if (!chart.name.trim() || !chart.emptyMessage.trim()) {
        throw new Error("Chart definitions require a name and empty message.");
      }
      if (chart.locksYAxis && !chart.allowsAxisSelection) {
        throw new Error("A locked Y axis requires an axis-selectable chart.");
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

    if (!this.buildResultSections) {
      throw new Error("Comfort model declarations must set a result builder.");
    }

    if (!this.buildChartResult) {
      throw new Error("Comfort model declarations must set a chart builder.");
    }

    const dynamicAxisFields = this.dynamicAxisFields;
    const defaultDynamicAxes = this.defaultDynamicAxes;
    if (!dynamicAxisFields || dynamicAxisFields.length < 2 || !defaultDynamicAxes) {
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

    return {
      id: this.id,
      label: this.label,
      description: this.description,
      modes: [...modes],
      chartableOutputs: chartableOutputs.map((output) => ({
        ...output,
        defaultBands: cloneNumericBands(output.defaultBands),
      })),
      supportedModifiers: [...supportedModifiers],
      ...(this.complianceSpec
        ? {
            complianceSpec: {
              ...this.complianceSpec,
              bands: this.complianceSpec.bands.map((band) => ({ ...band })),
            },
          }
        : {}),
      controls: [...this.controls],
      optionHandlersByKey: { ...this.optionHandlersByKey },
      charts: {
        defaultId: charts.defaultId,
        entries: charts.entries.map((chart) => ({ ...chart })),
      },
      defaultOptions: { ...defaultOptions },
      parseOptions: this.parseOptions,
      calculate: this.calculate,
      buildResultSections: this.buildResultSections,
      buildChartResult: this.buildChartResult,
      dynamicAxisFields: [...dynamicAxisFields],
      defaultDynamicAxes: { ...defaultDynamicAxes },
      zones: [...this.zones],
    };
  }
}
