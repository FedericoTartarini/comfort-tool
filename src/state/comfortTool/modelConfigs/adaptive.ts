/**
 * Adaptive Comfort Model Configuration
 * 
 * Defines the structural configuration for the Adaptive comfort model 
 * (ASHRAE 55 and EN 16798-1). Registers model-specific controls, calculation 
 * logic, and chart builders using the ComfortModelBuilder.
 */
import { ChartId, type ChartId as ChartIdType } from "../../../models/chartOptions";
import { type InputId as InputIdType } from "../../../models/inputSlots";
import { ComfortModel } from "../../../models/comfortModels";
import type {
  AdaptiveChartInputsRequestDto,
  AdaptiveChartSourceDto,
  AdaptiveResponseDto,
  AdaptiveRequestDto,
} from "../../../models/comfortDtos";
import { FieldKey, type FieldKey as FieldKeyType } from "../../../models/fieldKeys";
import { InputControlId, type PresetInputOption } from "../../../models/inputControls";
import {
  OptionKey,
  type OptionKey as OptionKeyType,
  TemperatureMode,
  defaultAdaptiveOptions,
  AdaptiveStandardMode,
} from "../../../models/inputModes";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../../models/units";
import { fieldMetaByKey } from "../../../models/inputFieldsMeta";
import { convertFieldValueFromSi, convertFieldValueToSi } from "../../../services/units";
import { calculateAdaptive } from "../../../services/comfort/adaptive";
import { buildAdaptiveChart, buildAdaptiveDynamicChart } from "../../../services/comfort/charts/adaptiveCharts";
import {
  buildDefaultPresentation,
  createAirSpeedControlBehavior,
  createControlBehavior,
  createTemperatureControlBehavior,
} from "../../../services/comfort/controls/controlBehaviors";
import { type InputControlBehavior } from "../../../services/comfort/controls/types";
import { ComfortModelBuilder, isRecord, createEmptyResults, buildResultSection } from "./builder";

const adaptiveChartIds: ChartIdType[] = [ChartId.Adaptive, ChartId.AdaptiveDynamic];

function normalizeAdaptiveOptionsSnapshot(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const nextOptions = Object.assign({}, defaultAdaptiveOptions);

  if (value[OptionKey.TemperatureMode] === TemperatureMode.Air) {
    nextOptions[OptionKey.TemperatureMode] = TemperatureMode.Air;
  } else {
    nextOptions[OptionKey.TemperatureMode] = TemperatureMode.Operative;
  }

  return nextOptions;
}

/**
 * Transforms the application state into a request object for the adaptive comfort calculation.
 * @param state The current application state.
 * @param inputId The ID of the input slot.
 * @returns An AdaptiveRequestDto object.
 */
function toAdaptiveRequest(state: any, inputId: InputIdType): AdaptiveRequestDto {
  const inputs = state.inputsByInput[inputId];
  
  const options = normalizeAdaptiveOptionsSnapshot(state.ui.modelOptionsByModel[ComfortModel.AdaptiveAshrae]) || defaultAdaptiveOptions;

  const tdb = Number(inputs[FieldKey.DryBulbTemperature]);
  const tr = options[OptionKey.TemperatureMode] === TemperatureMode.Operative
    ? tdb
    : Number(inputs[FieldKey.MeanRadiantTemperature]);

  return {
    tdb,
    tr,
    trm: Number(inputs[FieldKey.PrevailingMeanOutdoorTemperature]),
    v: Number(inputs[FieldKey.RelativeAirSpeed]),
    units: UnitSystem.SI,
  };
}

/**
 * Transforms the application state into a request object for adaptive chart generation.
 * @param state The current application state.
 * @param visibleInputIds The list of visible input IDs.
 * @returns An AdaptiveChartInputsRequestDto object.
 */
function toAdaptiveChartInputsRequest(
  state: any,
  visibleInputIds: InputIdType[],
): AdaptiveChartInputsRequestDto {
  // Return the adaptive chart inputs request DTO.
  return {
    // Map each visible input ID to its corresponding adaptive request.
    inputs: visibleInputIds.reduce((accumulator, inputId) => {
      accumulator[inputId] = toAdaptiveRequest(state, inputId);
      return accumulator;
    }, {} as AdaptiveChartInputsRequestDto["inputs"]),
  };
}

/**
 * Creates an option change handler for a specific control behavior.
 */
function createOptionHandler(behavior: InputControlBehavior, optionKey: OptionKeyType) {
  return (context: any, nextValue: string) => {
    // Check if the behavior has an applyOptionChange function.
    if (behavior.applyOptionChange) {
      // If it does, call it and return the result.
      return behavior.applyOptionChange(context, optionKey, nextValue);
    }
    // Otherwise, return null.
    return null;
  };
}

// Preset options for air speed in ASHRAE mode.
const ashraeAirSpeedPresets: PresetInputOption[] = [
  { id: "0.3", value: 0.3, label: "0.3 m/s (59 fpm)" },
  { id: "0.6", value: 0.6, label: "0.6 m/s (118 fpm)" },
  { id: "0.9", value: 0.9, label: "0.9 m/s (177 fpm)" },
  { id: "1.2", value: 1.2, label: "1.2 m/s (236 fpm)" },
];

// Preset options for air speed in EN mode.
const enAirSpeedPresets: PresetInputOption[] = [
  { id: "0.1", value: 0.1, label: "lower than 0.6 m/s (118 fpm)" },
  { id: "0.6", value: 0.6, label: "0.6 m/s (118 fpm)" },
  { id: "0.9", value: 0.9, label: "0.9 m/s (177 fpm)" },
  { id: "1.2", value: 1.2, label: "1.2 m/s (236 fpm)" },
];

function createAdaptiveModelConfig(modelId: ComfortModel, standardMode: AdaptiveStandardMode) {
  // Check if we are in ASHRAE mode.
  const isAshrae = standardMode === AdaptiveStandardMode.Ashrae;
  
  // The control behavior for temperature.
  const temperatureBehavior = createTemperatureControlBehavior(InputControlId.Temperature);

  // The control behavior for air speed in adaptive mode.
  const adaptiveAirSpeedBehavior = createControlBehavior({
    // Set the control ID.
    controlId: InputControlId.AirSpeed,
    // Set the field key.
    fieldKey: FieldKey.RelativeAirSpeed,
    // Set the preset options based on the standard.
    presetOptions: isAshrae ? ashraeAirSpeedPresets : enAirSpeedPresets,
    // Get the presentation for the control.
    getPresentation: (context, meta) => {
      // Get the default presentation.
      const presentation = buildDefaultPresentation(context, meta);
      // Return the presentation with a custom label.
      return {
        label: "Air speed",
        displayUnits: presentation.displayUnits,
        step: presentation.step,
        decimals: presentation.decimals,
        rangeText: presentation.rangeText,
        minValue: presentation.minValue,
        maxValue: presentation.maxValue,
      };
    },
  });

  // Create a new model configuration builder.
  const builder = new ComfortModelBuilder<AdaptiveResponseDto, AdaptiveChartSourceDto>(modelId);

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
      // Hide the control if the temperature mode is not "air".
      hidden: (context) => {
        return context.options[OptionKey.TemperatureMode] !== TemperatureMode.Air;
      },
      getPresentation: (context, meta) => {
        // Get the default presentation.
        const presentation = buildDefaultPresentation(context, meta);
        // Return the presentation with a custom label.
        return {
          label: "Mean radiant temperature",
          displayUnits: presentation.displayUnits,
          step: presentation.step,
          decimals: presentation.decimals,
          rangeText: presentation.rangeText,
          minValue: presentation.minValue,
          maxValue: presentation.maxValue,
        };
      },
    }),
  });

  // Register the prevailing mean outdoor temperature control.
  builder.addControl({
    id: InputControlId.PrevailingMeanOutdoorTemperature,
    behavior: createControlBehavior({
      controlId: InputControlId.PrevailingMeanOutdoorTemperature,
      fieldKey: FieldKey.PrevailingMeanOutdoorTemperature,
      getPresentation: (context, meta) => {
        // Get the default presentation.
        const presentation = buildDefaultPresentation(context, meta);
        
        // The custom label for the outdoor temperature.
        let label = "Prevailing mean outdoor temperature";
        if (!isAshrae) {
          label = "Running mean outdoor temperature";
        }

        // Return the presentation with the custom label.
        return {
          label: label,
          displayUnits: presentation.displayUnits,
          step: presentation.step,
          decimals: presentation.decimals,
          rangeText: presentation.rangeText,
          minValue: presentation.minValue,
          maxValue: presentation.maxValue,
        };
      },
    }),
  });

  // Register the air speed control.
  builder.addControl({
    id: InputControlId.AirSpeed,
    behavior: adaptiveAirSpeedBehavior,
  });

  // Register the temperature mode option handler.
  builder.addOptionHandler(OptionKey.TemperatureMode, (context, nextValue) => {
    // Check if the temperature behavior has an applyOptionChange function.
    if (temperatureBehavior.applyOptionChange) {
      // If it does, call it for the temperature mode.
      return temperatureBehavior.applyOptionChange(context, OptionKey.TemperatureMode, nextValue);
    }
    // Otherwise, return null.
    return null;
  });

  // Build the default options.
  const nextDefaultOptions = Object.assign({}, defaultAdaptiveOptions);
  nextDefaultOptions[OptionKey.TemperatureMode] = TemperatureMode.Operative;
  
  // Set the default options for the model.
  builder.setDefaultOptions(nextDefaultOptions);

  // Set the default chart and all available charts for the model.
  builder.setDefaultChart(ChartId.Adaptive, adaptiveChartIds);

  // Set the option normalizer for the model.
  builder.setOptionNormalizer(normalizeAdaptiveOptionsSnapshot);

  // Set the dynamic axis fields for Adaptive.
  builder.setDynamicAxisFields([
    FieldKey.DryBulbTemperature,
    FieldKey.MeanRadiantTemperature,
    FieldKey.OperativeTemperature,
    FieldKey.RelativeAirSpeed,
    FieldKey.PrevailingMeanOutdoorTemperature,
  ]);

  // Set the calculation engine for the model.
  builder.setCalculator((state, visibleInputIds) => {
    // Build the chart request.
    const chartRequest = toAdaptiveChartInputsRequest(state, visibleInputIds);
    // Create an empty results record.
    const resultsByInput = createEmptyResults<AdaptiveResponseDto>();

    // Calculate the adaptive comfort for each visible input slot.
    visibleInputIds.forEach((inputId) => {
      // Get the adaptive request for the current input slot.
      const request = toAdaptiveRequest(state, inputId);
      // Perform the calculation.
      resultsByInput[inputId] = calculateAdaptive(request, standardMode);
    });

    // Return the calculation outputs.
    return {
      resultsByInput: resultsByInput,
      chartSource: {
        chartRequest: chartRequest,
        resultsByInput: resultsByInput,
        standardMode: standardMode,
        dynamicXAxis: state.ui.dynamicXAxis,
        dynamicYAxis: state.ui.dynamicYAxis,
        baselineInputId: state.ui.chartBaselineInputId,
      },
    };
  });

  // Set the result builder for the model.
  builder.setResultBuilder((results, visibleInputIds, unitSystem, options, selectedChartId) => {
    // The list of result sections.
    const sections = [];

    // Add the compliance section.
    sections.push(
      buildResultSection("Compliance", results, visibleInputIds, (result) => {
        // Check if the result is within a comfortable range based on the standard.
        let isComfortable = false;
        if (isAshrae) {
          // In ASHRAE mode, check the 80% acceptability threshold.
          isComfortable = result.acceptability_80 === true;
        } else {
          // In EN mode, check the Category III threshold.
          isComfortable = result.acceptability_cat_iii === true;
        }

        // The compliance status. Example: true
        const isCompliant = result.isCompliant && isComfortable;

        // The text for the compliance cell. Example: "Compliant"
        let text = "Out of range";
        if (isCompliant) {
          text = "Compliant";
        } else if (result.isCompliant) {
          text = "Non-compliant";
        }

        // Return the result cell view model.
        return {
          text: text,
          tone: isCompliant ? "success" : "danger",
        };
      }),
    );

    // If we are in ASHRAE mode, add the acceptability sections.
    if (isAshrae) {
      sections.push(
        buildResultSection("80% Acceptability", results, visibleInputIds, (result) => {
          // If the status is missing, return N/A.
          if (!result.status_80) {
            return { text: "N/A", tone: "default" };
          }

          // Build the subtext with the comfort range.
          const tempUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
          let subtext = undefined;
          if (result.tmp_cmf_80_low !== undefined && result.tmp_cmf_80_up !== undefined) {
            const low = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.tmp_cmf_80_low, unitSystem);
            const up = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.tmp_cmf_80_up, unitSystem);
            subtext = `${low.toFixed(1)} ~ ${up.toFixed(1)} ${tempUnits}`;
          }

          // Return the result cell view model.
          return {
            text: result.status_80,
            subtext: subtext,
            tone: result.acceptability_80 ? "success" : "danger",
          };
        }),
        buildResultSection("90% Acceptability", results, visibleInputIds, (result) => {
          // If the status is missing, return N/A.
          if (!result.status_90) {
            return { text: "N/A", tone: "default" };
          }

          // Build the subtext with the comfort range.
          const tempUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
          let subtext = undefined;
          if (result.tmp_cmf_90_low !== undefined && result.tmp_cmf_90_up !== undefined) {
            const low = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.tmp_cmf_90_low, unitSystem);
            const up = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.tmp_cmf_90_up, unitSystem);
            subtext = `${low.toFixed(1)} ~ ${up.toFixed(1)} ${tempUnits}`;
          }

          // Return the result cell view model.
          return {
            text: result.status_90,
            subtext: subtext,
            tone: result.acceptability_90 ? "success" : "danger",
          };
        }),
      );
    } else {
      // Otherwise, add the European category sections.
      sections.push(
        buildResultSection("Category I", results, visibleInputIds, (result) => {
          if (!result.status_cat_i) return { text: "N/A", tone: "default" };
          const tempUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
          let subtext = undefined;
          if (result.tmp_cmf_cat_i_low !== undefined && result.tmp_cmf_cat_i_up !== undefined) {
            const low = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.tmp_cmf_cat_i_low, unitSystem);
            const up = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.tmp_cmf_cat_i_up, unitSystem);
            subtext = `${low.toFixed(1)} ~ ${up.toFixed(1)} ${tempUnits}`;
          }
          return {
            text: result.status_cat_i,
            subtext: subtext,
            tone: result.acceptability_cat_i ? "success" : "danger",
          };
        }),
        buildResultSection("Category II", results, visibleInputIds, (result) => {
          if (!result.status_cat_ii) return { text: "N/A", tone: "default" };
          const tempUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
          let subtext = undefined;
          if (result.tmp_cmf_cat_ii_low !== undefined && result.tmp_cmf_cat_ii_up !== undefined) {
            const low = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.tmp_cmf_cat_ii_low, unitSystem);
            const up = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.tmp_cmf_cat_ii_up, unitSystem);
            subtext = `${low.toFixed(1)} ~ ${up.toFixed(1)} ${tempUnits}`;
          }
          return {
            text: result.status_cat_ii,
            subtext: subtext,
            tone: result.acceptability_cat_ii ? "success" : "danger",
          };
        }),
        buildResultSection("Category III", results, visibleInputIds, (result) => {
          if (!result.status_cat_iii) return { text: "N/A", tone: "default" };
          const tempUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
          let subtext = undefined;
          if (result.tmp_cmf_cat_iii_low !== undefined && result.tmp_cmf_cat_iii_up !== undefined) {
            const low = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.tmp_cmf_cat_iii_low, unitSystem);
            const up = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.tmp_cmf_cat_iii_up, unitSystem);
            subtext = `${low.toFixed(1)} ~ ${up.toFixed(1)} ${tempUnits}`;
          }
          return {
            text: result.status_cat_iii,
            subtext: subtext,
            tone: result.acceptability_cat_iii ? "success" : "danger",
          };
        }),
      );
    }

    return sections;
  });

  builder.setChartBuilder((chartId, chartSource, resultsByInput, unitSystem) => {
    if (!chartSource || !adaptiveChartIds.includes(chartId)) {
      return null;
    }
    
    if (chartId === ChartId.AdaptiveDynamic) {
      return buildAdaptiveDynamicChart(
        chartSource.chartRequest,
        standardMode,
        unitSystem,
        chartSource.dynamicXAxis as FieldKeyType,
        chartSource.dynamicYAxis as FieldKeyType,
        chartSource.baselineInputId,
      );
    }
    
    return buildAdaptiveChart(chartSource.chartRequest, standardMode, unitSystem, chartSource.baselineInputId);
  });

  return builder.build();
}

export const adaptiveAshraeModelConfig = createAdaptiveModelConfig(ComfortModel.AdaptiveAshrae, AdaptiveStandardMode.Ashrae);
export const adaptiveEnModelConfig = createAdaptiveModelConfig(ComfortModel.AdaptiveEn, AdaptiveStandardMode.En);
