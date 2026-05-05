/**
 * UTCI Comfort Model Configuration
 * 
 * Defines the structural configuration for the UTCI (Universal Thermal 
 * Climate Index) model. Registers model-specific controls, calculation logic, 
 * and chart builders using the ComfortModelBuilder.
 */
import { ChartId, type ChartId as ChartIdType } from "../../../models/chartOptions";
import { inputOrder, type InputId as InputIdType } from "../../../models/inputSlots";
import { ComfortModel } from "../../../models/comfortModels";
import type { UtciChartInputsRequestDto, UtciChartSourceDto, UtciResponseDto, UtciRequestDto } from "../../../models/comfortDtos";
import { FieldKey } from "../../../models/fieldKeys";
import { fieldMetaByKey } from "../../../models/inputFieldsMeta";
import { InputControlId } from "../../../models/inputControls";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../../models/units";
import { createControlBehavior, createTemperatureControlBehavior } from "../../../services/comfort/controls/controlBehaviors";
import { buildUtciStressChart, buildUtciDynamicChart } from "../../../services/comfort/charts/utciCharts";
import { calculateUtci } from "../../../services/comfort/utci";
import { convertFieldValueFromSi, formatDisplayValue } from "../../../services/units";
import { getUtciStressTone } from "../../../services/comfort/helpers";
import { OptionKey, TemperatureMode, defaultUtciOptions, type UtciModelOptions } from "../../../models/inputModes";
import { applyOperativeTemperatureControlMode, synchronizeControlInputState } from "../../../services/comfort/syncState";
import { createSingleInputPatch } from "../../../services/comfort/controls/types";

const utciChartIds: ChartIdType[] = [ChartId.Stress, ChartId.UtciDynamic];

import { ComfortModelBuilder, isRecord, createEmptyResults, buildResultSection } from "./builder";

const utciTemperatureModeValues = new Set<string>(Object.values(TemperatureMode));

/**
 * Validates an untyped object layer.
 * Since UTCI exposes no complex advanced user options, normalization cleanly rejects complex objects 
 * and enforces an empty options record `{}`.
 * @param value Unvalidated unknown state shape.
 * @returns An empty valid options map `{}`, or null if not a record.
 */
function normalizeUtciOptions(value: unknown): UtciModelOptions | null {
  // Check if the input value is a valid record.
  if (!isRecord(value)) {
    return null;
  }

  const nextTemperatureMode = value[OptionKey.TemperatureMode];

  // Validate the temperature mode if it exists. Example: "air" or "operative"
  if (nextTemperatureMode !== undefined && !utciTemperatureModeValues.has(String(nextTemperatureMode))) {
    return null;
  }

  // Create a new options object by copying the default UTCI options.
  const options: UtciModelOptions = Object.assign({}, defaultUtciOptions);

  // Apply the validated temperature mode if provided.
  if (nextTemperatureMode !== undefined) {
    options[OptionKey.TemperatureMode] = nextTemperatureMode as TemperatureMode;
  }

  // Return the normalized options object.
  return options;
}

/**
 * Formats the canonical global state into a discrete SI structure required
 * by the core `jsthermalcomfort` mathematical UTCI solver, aligned to a specific InputId slot.
 * @param state Global Reactivity UI Canonical state.
 * @param inputId Active Target Input slot enumerator.
 * @returns Isolated `UtciRequestDto`.
 */
function toUtciRequest(state: any, inputId: InputIdType): UtciRequestDto {
  // Get the input values for the specific input slot.
  const inputs = state.inputsByInput[inputId];
  
  // Normalize the model options for UTCI.
  const options = normalizeUtciOptions(state.ui.modelOptionsByModel[ComfortModel.Utci]) || defaultUtciOptions;

  // If the temperature mode is operative, set the radiant temperature to the same value as air temperature.
  const tdb = Number(inputs[FieldKey.DryBulbTemperature]);
  const tr = options[OptionKey.TemperatureMode] === TemperatureMode.Operative 
    ? tdb 
    : Number(inputs[FieldKey.MeanRadiantTemperature]);

  // Return the UTCI request object.
  return {
    // Air temperature in °C. Example: 25
    tdb,
    // Radiant temperature in °C. Example: 25
    tr,
    // Wind speed in m/s. Example: 1.0
    v: Number(inputs[FieldKey.WindSpeed]),
    // Relative humidity in %. Example: 50
    rh: Number(inputs[FieldKey.RelativeHumidity]),
    // The unit system (always SI for internal requests).
    units: "SI" as const,
  };
}

/**
 * Derives UTCI inputs needed to correctly render the backend Chart components.
 * This bundles requests for all simultaneously visible inputs at once.
 * @param state Global state context.
 * @param visibleInputIds All actively rendered inputs to query.
 * @returns Chart Input bundle payload container.
 */
function toUtciChartInputsRequest(
  state: any,
  visibleInputIds: InputIdType[],
): UtciChartInputsRequestDto {
  // Return the UTCI chart inputs request.
  return {
    // Map each visible input ID to its corresponding UTCI request.
    inputs: visibleInputIds.reduce((accumulator, inputId) => {
      accumulator[inputId] = toUtciRequest(state, inputId);
      return accumulator;
    }, {} as UtciChartInputsRequestDto["inputs"]),
  };
}

/**
 * Assembles tabular data blocks detailing UTCI and text Stress categories based
 * on previously ran model resolution.
 * @param results Compiled Model Results for active inputs.
 * @param visibleInputIds Ordered ID references determining render sequences.
 * @param unitSystem Preferred User format metric (SI vs IP).
 * @returns Abstract section mappings.
 */
function buildUtciResultSections(
  results: Record<InputIdType, UtciResponseDto | null>,
  visibleInputIds: InputIdType[],
  unitSystem: UnitSystemType,
  options: any,
  selectedChartId: ChartIdType,
) {
  // Get the temperature units for display. Example: "°C"
  const temperatureUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
  
  // The list of result table sections.
  const sections = [];

  // Add the UTCI (Universal Thermal Climate Index) value section.
  sections.push(
    buildResultSection("UTCI", results, visibleInputIds, (result) => {
      // Convert the SI value to the user's preferred unit system.
      const displayValue = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.utci, unitSystem);
      // Format the value as a string with the correct number of decimals.
      const formattedValue = formatDisplayValue(
        displayValue,
        fieldMetaByKey[FieldKey.DryBulbTemperature].decimals,
      );
      
      // Return the result cell view model.
      return {
        text: `${formattedValue} ${temperatureUnits}`,
        tone: "default",
      };
    }),
  );

  // Add the stress category description. Example: "No thermal stress"
  sections.push(
    buildResultSection("Stress Category", results, visibleInputIds, (result) => {
      return {
        text: result.stressCategory,
        tone: getUtciStressTone(result.stressCategory),
      };
    }),
  );

  // Return the completed array of sections.
  return sections;
}

/**
 * Executes rendering assignments for the UTCI specific Plotly diagrams
 * based on the selected Model Chart ID (Stress/AirTemperature).
 * @param chartId User selected View/Chart ID.
 * @param chartSource The mapped properties containing bounds.
 * @param resultsByInput Pre-compiled scalar solutions tracking outputs per input.
 * @param unitSystem Local UI SI/IP metric schema.
 * @returns A composite configuration structure for Plotly.
 */
function buildUtciChartResult(
  chartId: ChartIdType,
  chartSource: UtciChartSourceDto | null,
  resultsByInput: Record<InputIdType, UtciResponseDto | null>,
  unitSystem: UnitSystemType,
) {
  // If there is no chart source data, return null.
  if (!chartSource) {
    return null;
  }

  // Handle the Stress chart type.
  if (chartId === ChartId.Stress) {
    return buildUtciStressChart(chartSource.chartRequest, resultsByInput, unitSystem, chartSource.baselineInputId);
  }

  // Handle the Dynamic UTCI chart type.
  if (chartId === ChartId.UtciDynamic) {
    return buildUtciDynamicChart(chartSource.chartRequest, resultsByInput, unitSystem, chartSource.dynamicXAxis, chartSource.dynamicYAxis, chartSource.baselineInputId);
  }

  // Return null if the chart ID is not supported.
  return null;
}

/**
 * UTCI Implementation Standard ComfortModelBuilder.
 * Wires the 4 core behavior fields strictly without extraneous advanced options.
 * This builder is directly injected into the Reactivity model layer (`createComfortToolState.svelte.ts`) to bootstrap the tool's UTCI context.
 */
const builder = new ComfortModelBuilder<UtciResponseDto, UtciChartSourceDto>(ComfortModel.Utci);

const temperatureBehavior = createTemperatureControlBehavior(InputControlId.Temperature);

// Register the temperature control.
builder.addControl({
  id: InputControlId.Temperature,
  behavior: temperatureBehavior,
});

// Register the radiant temperature control.
builder.addControl({
  id: InputControlId.RadiantTemperature,
  behavior: createControlBehavior({
    controlId: InputControlId.RadiantTemperature,
    fieldKey: FieldKey.MeanRadiantTemperature,
    // MRT is hidden if we are in Operative Temperature mode.
    hidden: (context) => {
      const options = normalizeUtciOptions(context.options) || defaultUtciOptions;
      return options[OptionKey.TemperatureMode] === TemperatureMode.Operative;
    },
  }),
});

// Register the wind speed control.
builder.addControl({
  id: InputControlId.WindSpeed,
  behavior: createControlBehavior({
    controlId: InputControlId.WindSpeed,
    fieldKey: FieldKey.WindSpeed,
  }),
});

// Register the relative humidity control.
builder.addControl({
  id: InputControlId.Humidity,
  behavior: createControlBehavior({
    controlId: InputControlId.Humidity,
    fieldKey: FieldKey.RelativeHumidity,
  }),
});

// Add option handlers for UTCI.
builder.addOptionHandler(OptionKey.TemperatureMode, (context, nextValue) => {
  if (!utciTemperatureModeValues.has(nextValue)) return null;

  const nextOptions = Object.assign({}, context.options);
  nextOptions[OptionKey.TemperatureMode] = nextValue;

  return buildCanonicalInputSyncPatch(
    inputOrder,
    { [OptionKey.TemperatureMode]: nextValue },
    (inputId) => {
      if (nextValue === TemperatureMode.Operative) {
        return applyOperativeTemperatureControlMode(
          context.inputsByInput[inputId],
          nextOptions,
          context.derivedByInput[inputId]
        );
      }
      return synchronizeControlInputState(
        context.inputsByInput[inputId],
        nextOptions,
        context.derivedByInput[inputId]
      );
    }
  );
});

function buildCanonicalInputSyncPatch(
  targetInputIds: InputIdType[],
  optionsPatch: Partial<Record<OptionKey, string>>,
  updater: (inputId: InputIdType) => { inputState: any }
) {
  const inputsPatch = {} as any;
  targetInputIds.forEach((inputId) => {
    inputsPatch[inputId] = updater(inputId).inputState;
  });
  return { inputsPatch, optionsPatch };
}

// Set the available charts and the default chart.
builder.setDefaultChart(ChartId.Stress, utciChartIds);

// Set the dynamic axis fields for UTCI.
builder.setDynamicAxisFields([
  FieldKey.DryBulbTemperature,
  FieldKey.MeanRadiantTemperature,
  FieldKey.OperativeTemperature,
  FieldKey.WindSpeed,
  FieldKey.RelativeHumidity,
]);

// Set the default options.
builder.setDefaultOptions(Object.assign({}, defaultUtciOptions));

// Set the option normalizer.
builder.setOptionNormalizer(normalizeUtciOptions);

// Set the calculation engine for the model.
builder.setCalculator((state, visibleInputIds) => {
  // Create an empty results map.
  const resultsByInput = createEmptyResults<UtciResponseDto>();
  
  // Calculate the UTCI value for each visible input slot.
  visibleInputIds.forEach((inputId) => {
    // Perform the calculation using the request DTO.
    resultsByInput[inputId] = calculateUtci(toUtciRequest(state, inputId));
  });

  // Generate the chart request data.
  const chartRequest = toUtciChartInputsRequest(state, visibleInputIds);

  // Return the calculation outputs.
  return {
    resultsByInput: resultsByInput,
    chartSource: {
      chartRequest: chartRequest,
      dynamicXAxis: state.ui.dynamicXAxis,
      dynamicYAxis: state.ui.dynamicYAxis,
      baselineInputId: state.ui.chartBaselineInputId,
    },
  };
});

// Set the result builder for the model.
builder.setResultBuilder(buildUtciResultSections);

// Set the chart builder for the model.
builder.setChartBuilder((chartId, chartSource, resultsByInput, unitSystem) => {
  return buildUtciChartResult(chartId, chartSource, resultsByInput, unitSystem);
});

// Build and export the final model configuration.
export const utciModelConfig = builder.build();
