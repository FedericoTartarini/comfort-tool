import { inputOrder, type InputId as InputIdType } from "../../../models/inputSlots";
import type { ResultSectionViewModel, ModelOptionsState, ResultCellViewModel } from "../types";
import type {
  ComfortModelDefinition,
  DynamicAxisPairValidator,
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
 */
export class ComfortModelBuilder<ResultType, ChartSourceType> {
  private didSetChartableOutputs = false;

  private config: Partial<ComfortModelDefinition<ResultType, ChartSourceType>> = {
    controls: [],
    optionHandlersByKey: {},
    zones: [],
    legendChartIds: [],
    legendTitle: "",
    lockYAxisChartIds: [],
  };

  /**
   * Initializes the builder for a specific Comfort Model identity.
   * @param id The canonical identifier for the model (e.g., 'pmv', 'utci').
   */
  constructor(id: ComfortModelType) {
    this.config.id = id;
  }

  /**
   * Sets the display label for the comfort model in the model selection menu.
   * @param label Display label string.
   */
  setLabel(label: string): this {
    this.config.label = label;
    return this;
  }

  /**
   * Sets the detailed description for the comfort model in the model selection menu.
   * @param description Description string.
   */
  setDescription(description: string): this {
    this.config.description = description;
    return this;
  }

  setModes(modes: readonly ChartModeType[]): this {
    this.config.modes = [...modes];
    return this;
  }

  /**
   * Declares the outputs that Explore mode can display on a chart.
   * An explicit empty array is valid for compliance-only models.
   */
  setChartableOutputs(outputs: readonly ModelOutput[]): this {
    this.didSetChartableOutputs = true;
    this.config.chartableOutputs = outputs.map((output) => ({
      ...output,
      defaultBands: cloneNumericBands(output.defaultBands),
    }));
    return this;
  }

  setComplianceSpec(spec: ComplianceSpec): this {
    this.config.complianceSpec = {
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
   * Defines model-specific compatibility for otherwise supported dynamic axes.
   */
  setDynamicAxisPairValidator(validator: DynamicAxisPairValidator): this {
    this.config.dynamicAxisPairValidator = validator;
    return this;
  }

  /**
   * Defines the boundary zones associated with this model.
   * @param zones Array of ThermalZone instances.
   */
  setZones(zones: ThermalZone[]): this {
    this.config.zones = zones;
    return this;
  }

  /**
   * Defines the chart IDs for which this model shows a zone legend.
   * @param chartIds Array of ChartId values.
   */
  setLegendChartIds(chartIds: ChartIdType[]): this {
    this.config.legendChartIds = chartIds;
    return this;
  }

  /**
   * Sets the display title for the legend.
   * @param title Title string.
   */
  setLegendTitle(title: string): this {
    this.config.legendTitle = title;
    return this;
  }

  /**
   * Defines the chart IDs that lock the dynamic Y-axis.
   * @param chartIds Array of ChartId values.
   */
  setLockYAxisChartIds(chartIds: ChartIdType[]): this {
    this.config.lockYAxisChartIds = chartIds;
    return this;
  }

  /**
   * Defines a custom synchronization hook for the model.
   * @param synchronizer Function that returns a behavior patch.
   */
  setSynchronizer(synchronizer: ComfortModelDefinition<ResultType, ChartSourceType>["synchronize"]): this {
    this.config.synchronize = synchronizer;
    return this;
  }

  /**
   * Seals the configuration and returns a complete, immutable ComfortModelDefinition.
   */
  build(): ComfortModelDefinition<ResultType, ChartSourceType> {
    const modes = this.config.modes;
    if (!modes || modes.length === 0) {
      throw new Error("Comfort model declarations require at least one mode.");
    }

    if (new Set(modes).size !== modes.length) {
      throw new Error("Comfort model declarations cannot contain duplicate modes.");
    }

    if (!this.didSetChartableOutputs || !this.config.chartableOutputs) {
      throw new Error("Comfort model declarations must explicitly set chartable outputs.");
    }

    const outputKeys = this.config.chartableOutputs.map((output) => output.key);
    if (new Set(outputKeys).size !== outputKeys.length) {
      throw new Error("Comfort model declarations cannot contain duplicate output keys.");
    }

    const supportsExplore = modes.includes(ChartMode.Explore);
    const supportsCompliance = modes.includes(ChartMode.Compliance);

    if (supportsExplore && this.config.chartableOutputs.length === 0) {
      throw new Error("Explore mode requires at least one chartable output.");
    }

    for (const output of this.config.chartableOutputs) {
      const validation = validateNumericBands(output.defaultBands);
      if (!validation.valid) {
        throw new Error(
          `Explore output ${output.key} has invalid default bands: ${validation.issues[0].message}`,
        );
      }
    }

    if (supportsCompliance && (!this.config.complianceSpec || this.config.complianceSpec.bands.length === 0)) {
      throw new Error("Compliance mode requires a non-empty compliance specification.");
    }

    if (!supportsCompliance && this.config.complianceSpec) {
      throw new Error("A model without Compliance mode cannot declare a compliance specification.");
    }

    return this.config as ComfortModelDefinition<ResultType, ChartSourceType>;
  }
}
