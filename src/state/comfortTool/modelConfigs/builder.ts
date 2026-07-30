import { inputOrder, type InputId as InputIdType } from "../../../models/inputSlots";
import type { ResultSectionViewModel, ModelOptionsState, ResultCellViewModel } from "../types";
import type {
  ComfortModelDefinition,
  DynamicAxisDefaults,
  ModelOptionChangeHandler,
} from "./index";
import type { ComfortModel as ComfortModelType } from "../../../models/comfortModels";
import type { FieldKey as FieldKeyType } from "../../../models/fieldKeys";
import type { ChartId as ChartIdType } from "../../../models/chartOptions";
import type { OptionKey as OptionKeyType } from "../../../models/inputModes";
import type { InputControlDefinition } from "../../../services/comfort/controls/types";
import type { ThermalZone } from "../../../models/thermalZone";
import {
  ChartMode,
  type Band,
  type ChartMode as ChartModeType,
  type ComplianceSpec,
  type ModelOutput,
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

/**
 * Utility to verify if a value is a non-null object (and not an array).
 * Primarily used during option normalization to guard against invalid state injections.
 * @param value The value to check.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Creates an empty record indexed by all available InputId slots.
 * This is the standard starting point for assembling model calculation results.
 * @returns A record mapping every InputId to null.
 */
export function createEmptyResults<T>(): Record<InputIdType, T | null> {
  return inputOrder.reduce((acc, inputId) => {
    acc[inputId] = null;
    return acc;
  }, {} as Record<InputIdType, T | null>);
}

/**
 * Assembles a view model for a results table section (e.g., "Compliance" or "PMV").
 * Maps raw model results into formatted display cells.
 *
 * @param title The display heading for this result section.
 * @param resultsByInput The record of raw calculation results for all slots.
 * @param visibleInputIds The subset of slots that should be included in the view model.
 * @param formatter A callback to transform a raw result into a displayable cell.
 * @returns A ResultSectionViewModel ready for the UI.
 */
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

/**
 * A fluent builder for defining Comfort Model configurations.
 * This pattern ensures that model-specific logic (PMV, Adaptive, UTCI) is decoupled from the
 * general state management and UI reactivity layers.
 *
 * @template ResultType The data type returned by the calculation engine.
 * @template ChartSourceType The data type required to build the chart visualizations.
 * @template ComplianceBand The band type declared by the model's Compliance mode.
 */
export class ComfortModelBuilder<
  ResultType,
  ChartSourceType,
  ComplianceBand extends Band = Band,
> {
  private readonly id: ComfortModelType;

  private label?: string;

  private description?: string;

  private modes?: ChartModeType[];

  private chartableOutputs?: ModelOutput[];

  private complianceSpec?: ComplianceSpec<ComplianceBand>;

  private readonly controls: InputControlDefinition[] = [];

  private readonly optionHandlersByKey: Partial<
    Record<OptionKeyType, ModelOptionChangeHandler>
  > = {};

  private chartIds?: ChartIdType[];

  private defaultChartId?: ChartIdType;

  private defaultOptions?: Partial<Record<OptionKeyType, string>>;

  private normalizeOptions?: ComfortModelDefinition<
    ResultType,
    ChartSourceType,
    ComplianceBand
  >["normalizeOptions"];

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

  private dynamicAxisFields?: FieldKeyType[];

  private defaultDynamicAxes?: DynamicAxisDefaults;

  private zones: ThermalZone[] = [];

  private legendChartIds: ChartIdType[] = [];

  private legendTitle = "";

  private lockYAxisChartIds: ChartIdType[] = [];

  /**
   * Initializes the builder for a specific Comfort Model identity.
   * @param id The canonical identifier for the model (e.g., 'pmv', 'utci').
   */
  constructor(id: ComfortModelType) {
    this.id = id;
  }

  /**
   * Sets the display label for the comfort model in the model selection menu.
   * @param label Display label string.
   */
  setLabel(label: string): this {
    this.label = label;
    return this;
  }

  /**
   * Sets the detailed description for the comfort model in the model selection menu.
   * @param description Description string.
   */
  setDescription(description: string): this {
    this.description = description;
    return this;
  }

  setModes(modes: readonly ChartModeType[]): this {
    this.modes = [...modes];
    return this;
  }

  /**
   * Declares the outputs that Explore mode can display on a chart.
   * An explicit empty array is valid for compliance-only models.
   */
  setChartableOutputs(outputs: readonly ModelOutput[]): this {
    this.chartableOutputs = outputs.map((output) => ({
      ...output,
      defaultBands: cloneNumericBands(output.defaultBands),
    }));
    return this;
  }

  setComplianceSpec(spec: ComplianceSpec<ComplianceBand>): this {
    this.complianceSpec = {
      ...spec,
      bands: spec.bands.map((band) => ({ ...band })),
    };
    return this;
  }

  /**
   * Registers a UI control (input field, slider, etc.) with the model.
   * @param definition The definition binding a Control ID to its reactive behavior.
   */
  addControl(definition: InputControlDefinition): this {
    this.controls.push(definition);
    return this;
  }

  /**
   * Assigns a custom change handler for a specific model-level option (e.g., 'Relative Humidity Mode').
   * @param optionKey The unique key of the option.
   * @param handler The handler logic to execute when the option changes.
   */
  addOptionHandler(optionKey: OptionKeyType, handler: ModelOptionChangeHandler): this {
    this.optionHandlersByKey[optionKey] = handler;
    return this;
  }

  /**
   * Configures the available charts and the default view for this model.
   * @param chartId The ID of the chart to display by default.
   * @param allChartIds A list of all legal chart IDs accessible in this model.
   */
  setDefaultChart(chartId: ChartIdType, allChartIds: readonly ChartIdType[]): this {
    this.defaultChartId = chartId;
    this.chartIds = [...allChartIds];
    return this;
  }

  /**
   * Sets the initial default values for model-level options.
   * @param options A partial record of keys and their default string values.
   */
  setDefaultOptions(options: Partial<Record<OptionKeyType, string>>): this {
    this.defaultOptions = { ...options };
    return this;
  }

  /**
   * Assigns a validation/stripping function to ensure options coming from the outside (e.g. URL/Local Storage)
   * match the model's expected schema.
   * @param normalizer The normalization function.
   */
  setOptionNormalizer(normalizer: (value: unknown) => ModelOptionsState | null): this {
    this.normalizeOptions = normalizer;
    return this;
  }

  /**
   * Sets the core calculation engine for the model.
   * @param calculator Logic that transforms input state into result DTOs and chart source data.
   */
  setCalculator(calculator: ComfortModelDefinition<
    ResultType,
    ChartSourceType,
    ComplianceBand
  >["calculate"]): this {
    this.calculate = calculator;
    return this;
  }

  /**
   * Registers the logic for transforming calculation results into UI-friendly result sections.
   * @param builder Function that returns an array of result section view models.
   */
  setResultBuilder(builder: ComfortModelDefinition<
    ResultType,
    ChartSourceType,
    ComplianceBand
  >["buildResultSections"]): this {
    this.buildResultSections = builder;
    return this;
  }

  /**
   * Registers the logic for transforming chart source data into final Plotly traces and layouts.
   * @param builder Function that creates a PlotlyChartResponseDto.
   */
  setChartBuilder(builder: ComfortModelDefinition<
    ResultType,
    ChartSourceType,
    ComplianceBand
  >["buildChartResult"]): this {
    this.buildChartResult = builder;
    return this;
  }

  /**
   * Defines the field keys available for dynamic axis selection in charts.
   * @param fields Array of FieldKey values.
   */
  setDynamicAxisFields(fields: readonly FieldKeyType[]): this {
    this.dynamicAxisFields = [...fields];
    return this;
  }

  /** Defines the semantic default pair used when entering this model. */
  setDefaultDynamicAxes(defaults: DynamicAxisDefaults): this {
    this.defaultDynamicAxes = { ...defaults };
    return this;
  }

  /**
   * Defines the boundary zones associated with this model.
   * @param zones Array of ThermalZone instances.
   */
  setZones(zones: readonly ThermalZone[]): this {
    this.zones = [...zones];
    return this;
  }

  /**
   * Defines the chart IDs for which this model shows a zone legend.
   * @param chartIds Array of ChartId values.
   */
  setLegendChartIds(chartIds: readonly ChartIdType[]): this {
    this.legendChartIds = [...chartIds];
    return this;
  }

  /**
   * Sets the display title for the legend.
   * @param title Title string.
   */
  setLegendTitle(title: string): this {
    this.legendTitle = title;
    return this;
  }

  /**
   * Defines the chart IDs that lock the dynamic Y-axis.
   * @param chartIds Array of ChartId values.
   */
  setLockYAxisChartIds(chartIds: readonly ChartIdType[]): this {
    this.lockYAxisChartIds = [...chartIds];
    return this;
  }

  /**
   * Validates the configuration and returns a complete configuration snapshot.
   */
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

    if (supportsCompliance && (!this.complianceSpec || this.complianceSpec.bands.length === 0)) {
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

    const chartIds = this.chartIds;
    if (!chartIds || chartIds.length === 0) {
      throw new Error("Comfort model declarations require at least one chart ID.");
    }

    if (chartIds.some((chartId) => chartId.trim().length === 0)) {
      throw new Error("Comfort model declarations require non-empty chart IDs.");
    }

    if (new Set(chartIds).size !== chartIds.length) {
      throw new Error("Comfort model declarations cannot contain duplicate chart IDs.");
    }

    if (!this.defaultChartId || !chartIds.includes(this.defaultChartId)) {
      throw new Error("The default chart must belong to the declared chart IDs.");
    }

    if (this.defaultOptions === undefined) {
      throw new Error("Comfort model declarations must explicitly set default options.");
    }

    if (!this.normalizeOptions) {
      throw new Error("Comfort model declarations must set an option normalizer.");
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
      chartIds: [...chartIds],
      defaultChartId: this.defaultChartId,
      defaultOptions: { ...this.defaultOptions },
      normalizeOptions: this.normalizeOptions,
      calculate: this.calculate,
      buildResultSections: this.buildResultSections,
      buildChartResult: this.buildChartResult,
      dynamicAxisFields: [...dynamicAxisFields],
      defaultDynamicAxes: { ...defaultDynamicAxes },
      zones: [...this.zones],
      legendChartIds: [...this.legendChartIds],
      legendTitle: this.legendTitle,
      lockYAxisChartIds: [...this.lockYAxisChartIds],
    };
  }
}
