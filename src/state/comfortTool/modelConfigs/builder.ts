import { inputOrder, type InputId as InputIdType } from "../../../models/inputSlots";
import type { ResultSectionViewModel, ResultTone, ModelOptionsState } from "../types";
import type { ComfortModelDefinition, ModelOptionChangeHandler } from "./index";
import type { ComfortModel as ComfortModelType } from "../../../models/comfortModels";
import type { FieldKey as FieldKeyType } from "../../../models/fieldKeys";
import type { ChartId as ChartIdType } from "../../../models/chartOptions";
import type { OptionKey as OptionKeyType } from "../../../models/inputModes";
import type { InputControlDefinition } from "../../../services/comfort/controls/types";

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
 * Maps raw model results into formatted display strings and semantic "tones" (success, danger, etc.).
 *
 * @param title The display heading for this result section.
 * @param resultsByInput The record of raw calculation results for all slots.
 * @param visibleInputIds The subset of slots that should be included in the view model.
 * @param formatter A callback to transform a raw result into a displayable text and tone.
 * @returns A ResultSectionViewModel ready for the UI.
 */
export function buildResultSection<T>(
  title: string,
  resultsByInput: Record<InputIdType, T | null>,
  visibleInputIds: InputIdType[],
  formatter: (result: T) => { text: string; tone: ResultTone },
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
    }, {} as Record<InputIdType, { text: string; tone: ResultTone } | null>),
  };
}

/**
 * A fluent builder for defining Comfort Model configurations.
 * This pattern ensures that model-specific logic (PMV, Adaptive, UTCI) is decoupled from the
 * general state management and UI reactivity layers.
 *
 * @template ResultType The data type returned by the calculation engine.
 * @template ChartSourceType The data type required to build the chart visualizations.
 */
export class ComfortModelBuilder<ResultType, ChartSourceType> {
  private config: Partial<ComfortModelDefinition<ResultType, ChartSourceType>> = {
    controls: [],
    optionHandlersByKey: {},
  };

  /**
   * Initializes the builder for a specific Comfort Model identity.
   * @param id The canonical identifier for the model (e.g., 'pmv', 'utci').
   */
  constructor(id: ComfortModelType) {
    this.config.id = id;
  }

  /**
   * Registers a UI control (input field, slider, etc.) with the model.
   * @param definition The definition binding a Control ID to its reactive behavior.
   */
  addControl(definition: InputControlDefinition): this {
    this.config.controls!.push(definition);
    return this;
  }

  /**
   * Assigns a custom change handler for a specific model-level option (e.g., 'Relative Humidity Mode').
   * @param optionKey The unique key of the option.
   * @param handler The handler logic to execute when the option changes.
   */
  addOptionHandler(optionKey: OptionKeyType, handler: ModelOptionChangeHandler): this {
    this.config.optionHandlersByKey![optionKey] = handler;
    return this;
  }

  /**
   * Configures the available charts and the default view for this model.
   * @param chartId The ID of the chart to display by default.
   * @param allChartIds A list of all legal chart IDs accessible in this model.
   */
  setDefaultChart(chartId: ChartIdType, allChartIds: ChartIdType[]): this {
    this.config.defaultChartId = chartId;
    this.config.chartIds = allChartIds;
    return this;
  }

  /**
   * Sets the initial default values for model-level options.
   * @param options A partial record of keys and their default string values.
   */
  setDefaultOptions(options: Partial<Record<OptionKeyType, string>>): this {
    this.config.defaultOptions = options;
    return this;
  }

  /**
   * Assigns a validation/stripping function to ensure options coming from the outside (e.g. URL/Local Storage)
   * match the model's expected schema.
   * @param normalizer The normalization function.
   */
  setOptionNormalizer(normalizer: (value: unknown) => ModelOptionsState | null): this {
    this.config.normalizeOptions = normalizer;
    return this;
  }

  /**
   * Sets the core calculation engine for the model.
   * @param calculator Logic that transforms input state into result DTOs and chart source data.
   */
  setCalculator(calculator: ComfortModelDefinition<ResultType, ChartSourceType>["calculate"]): this {
    this.config.calculate = calculator;
    return this;
  }

  /**
   * Registers the logic for transforming calculation results into UI-friendly result sections.
   * @param builder Function that returns an array of result section view models.
   */
  setResultBuilder(builder: ComfortModelDefinition<ResultType, ChartSourceType>["buildResultSections"]): this {
    this.config.buildResultSections = builder;
    return this;
  }

  /**
   * Registers the logic for transforming chart source data into final Plotly traces and layouts.
   * @param builder Function that creates a PlotlyChartResponseDto.
   */
  setChartBuilder(builder: ComfortModelDefinition<ResultType, ChartSourceType>["buildChartResult"]): this {
    this.config.buildChartResult = builder;
    return this;
  }

  /**
   * Defines the field keys available for dynamic axis selection in charts.
   * @param fields Array of FieldKey values.
   */
  setDynamicAxisFields(fields: FieldKeyType[]): this {
    this.config.dynamicAxisFields = fields;
    return this;
  }

  /**
   * Seals the configuration and returns a complete, immutable ComfortModelDefinition.
   */
  build(): ComfortModelDefinition<ResultType, ChartSourceType> {
    return this.config as ComfortModelDefinition<ResultType, ChartSourceType>;
  }
}
