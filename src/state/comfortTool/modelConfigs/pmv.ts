/**
 * PMV Comfort Model Configuration
 * 
 * Defines the structural configuration for the PMV (Predicted Mean Vote) 
 * comfort model. Registers model-specific controls, default options, 
 * calculation logic, and chart builders using the ComfortModelBuilder.
 */
import { ChartId, type ChartId as ChartIdType } from "../../../models/chartOptions";
import { inputOrder, type InputId as InputIdType } from "../../../models/inputSlots";
import { ComfortModel } from "../../../models/comfortModels";
import type {
  ComfortZoneRequestDto,
  PmvChartSourceDto,
  PmvChartInputsRequestDto,
  PmvRequestDto,
  PmvResponseDto,
} from "../../../models/comfortDtos";
import { FieldKey } from "../../../models/fieldKeys";
import { InputControlId } from "../../../models/inputControls";
import {
  AirSpeedControlMode,
  AirSpeedInputMode,
  HumidityInputMode,
  OptionKey,
  type OptionKey as OptionKeyType,
  TemperatureMode,
  defaultPmvOptions,
  type PmvModelOptions,
} from "../../../models/inputModes";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../../models/units";
import { CalculationSource, ComfortStandard } from "../../../models/calculationMetadata";
import { type ComfortZonesByInput, getPmvZone } from "../../../services/comfort/helpers";
import {
  buildComparePsychrometricChart,
  buildPmvDynamicChart,
} from "../../../services/comfort/charts/pmvCharts";
import { calculateComfortZone } from "../../../services/comfort/comfortZone";
import { check_standard_compliance } from "jsthermalcomfort/lib/esm/utilities/utilities.js";
import { pmv_ppd_ashrae, PMV_COMFORT_LIMIT } from "../../../services/comfort/pmv";
import {
  normalizePmvOptions,
  synchronizePmvInputState,
} from "../../../services/comfort/syncState";
import {
  createAirSpeedControlBehavior,
  createControlBehavior,
  createHumidityControlBehavior,
  createTemperatureControlBehavior,
} from "../../../services/comfort/controls/controlBehaviors";
import { createSingleInputPatch, type InputControlBehavior } from "../../../services/comfort/controls/types";
import { clothingTypicalEnsembles, metabolicActivityOptions } from "../../../services/comfort/referenceValues";
import { fieldMetaByKey } from "../../../models/inputFieldsMeta";
import { convertFieldValueFromSi, formatDisplayValue } from "../../../services/units";

const pmvChartIds: ChartIdType[] = [ChartId.Psychrometric, ChartId.PmvDynamic];

const clothingPresetOptions = clothingTypicalEnsembles.map((ensemble) => ({
  id: ensemble.id,
  label: ensemble.label,
  value: ensemble.clo,
}));

const metabolicPresetOptions = metabolicActivityOptions.map((activity) => ({
  id: activity.id,
  label: activity.label,
  value: activity.met,
}));

const temperatureModeValues = new Set<string>(Object.values(TemperatureMode));
const airSpeedControlModeValues = new Set<string>(Object.values(AirSpeedControlMode));
const airSpeedInputModeValues = new Set<string>(Object.values(AirSpeedInputMode));
const humidityInputModeValues = new Set<string>(Object.values(HumidityInputMode));

import { ComfortModelBuilder, isRecord, createEmptyResults, buildResultSection } from "./builder";

/**
 * Validates an untyped object layer.
 * It strips away unknown properties and ensures that values map perfectly back to explicitly defined ENUM constants.
 * @param value The unvalidated options object structure.
 * @returns A fully normalized options map, or null if critically invalid.
 */
function normalizePmvOptionsSnapshot(value: unknown) {
  // Check if the input value is a valid record.
  if (!isRecord(value)) {
    return null;
  }

  // Get the individual option values from the input record.
  const nextTemperatureMode = value[OptionKey.TemperatureMode];
  const nextAirSpeedControlMode = value[OptionKey.AirSpeedControlMode];
  const nextAirSpeedInputMode = value[OptionKey.AirSpeedInputMode];
  const nextHumidityInputMode = value[OptionKey.HumidityInputMode];

  // Validate the temperature mode if it exists. Example: "air" or "operative"
  if (nextTemperatureMode !== undefined && !temperatureModeValues.has(String(nextTemperatureMode))) {
    return null;
  }

  // Validate the air speed control mode. Example: "with_local_control"
  if (nextAirSpeedControlMode !== undefined && !airSpeedControlModeValues.has(String(nextAirSpeedControlMode))) {
    return null;
  }

  // Validate the air speed input mode. Example: "relative_air_speed"
  if (nextAirSpeedInputMode !== undefined && !airSpeedInputModeValues.has(String(nextAirSpeedInputMode))) {
    return null;
  }

  // Validate the humidity input mode. Example: "relative_humidity"
  if (nextHumidityInputMode !== undefined && !humidityInputModeValues.has(String(nextHumidityInputMode))) {
    return null;
  }

  // Create a new options object by copying the default PMV options.
  const options: PmvModelOptions = Object.assign({}, defaultPmvOptions);

  // Apply the validated temperature mode if provided.
  if (nextTemperatureMode !== undefined) {
    options[OptionKey.TemperatureMode] = nextTemperatureMode as TemperatureMode;
  }

  // Apply the validated air speed control mode if provided.
  if (nextAirSpeedControlMode !== undefined) {
    options[OptionKey.AirSpeedControlMode] = nextAirSpeedControlMode as AirSpeedControlMode;
  }

  // Apply the validated air speed input mode if provided.
  if (nextAirSpeedInputMode !== undefined) {
    options[OptionKey.AirSpeedInputMode] = nextAirSpeedInputMode as AirSpeedInputMode;
  }

  // Apply the validated humidity input mode if provided.
  if (nextHumidityInputMode !== undefined) {
    options[OptionKey.HumidityInputMode] = nextHumidityInputMode as HumidityInputMode;
  }

  // Return the normalized options object.
  return options;
}

/**
 * Bundles the internal canonical application state into a PmvRequestDto mapped
 * uniquely to a particular UI Input Slot calculation request.
 * @param state The total canonical Model state map.
 * @param inputId The assigned Input Slot target.
 * @returns An isolated PmvRequestDto containing SI physical parameters.
 */
function toPmvRequest(state: any, inputId: InputIdType): PmvRequestDto {
  // Get the input state for the given input ID.
  const inputs = state.inputsByInput[inputId];
  // Normalize the model options for PMV by copying the default PMV options and updating them with the normalized values.
  const options = normalizePmvOptionsSnapshot(state.ui.modelOptionsByModel[ComfortModel.Pmv]) || defaultPmvOptions;
  
  const tdb = Number(inputs[FieldKey.DryBulbTemperature]);
  const tr = options[OptionKey.TemperatureMode] === TemperatureMode.Operative
    ? tdb
    : Number(inputs[FieldKey.MeanRadiantTemperature]);

  return {
    tdb,
    tr,
    vr: Number(inputs[FieldKey.RelativeAirSpeed]),
    rh: Number(inputs[FieldKey.RelativeHumidity]),
    met: Number(inputs[FieldKey.MetabolicRate]),
    clo: Number(inputs[FieldKey.ClothingInsulation]),
    wme: Number(inputs[FieldKey.ExternalWork]),
    occupantHasAirSpeedControl: options[OptionKey.AirSpeedControlMode] === AirSpeedControlMode.WithLocalControl,
    units: UnitSystem.SI,
  };
}

/**
 * Constructs a bounded ComfortZoneRequestDto expanding upon the isolated PMV request constraints
 * in order to iteratively calculate comfort bounds dynamically.
 * @param state The canonical state.
 * @param inputId Target Input Slot.
 * @returns A ComfortZoneRequestDto defining search boundaries.
 */
function toComfortZoneRequest(state: any, inputId: InputIdType): ComfortZoneRequestDto {
  // Get the base PMV request.
  const baseRequest = toPmvRequest(state, inputId);
  
  // Return the comfort zone request by adding range parameters.
  return {
    tdb: baseRequest.tdb,
    tr: baseRequest.tr,
    vr: baseRequest.vr,
    rh: baseRequest.rh,
    met: baseRequest.met,
    clo: baseRequest.clo,
    wme: baseRequest.wme,
    occupantHasAirSpeedControl: baseRequest.occupantHasAirSpeedControl,
    units: baseRequest.units,
    // The minimum relative humidity to scan. Example: 0
    rhMin: 0,
    // The maximum relative humidity to scan. Example: 100
    rhMax: 100,
    // The number of points to sample in the humidity range. Example: 31
    rhPoints: 31,
  };
}

/**
 * Assembles a fully composite request configuring charting pipelines for the PMV Model.
 * Provides the psychrometric dimensions and required relative humidity curves mappings.
 * @param state Application global state.
 * @param visibleInputIds All currently visible Input slots requesting to exist on the chart.
 * @returns Chart inputs container.
 */
function toPmvChartInputsRequest(
  state: any,
  visibleInputIds: InputIdType[],
): PmvChartInputsRequestDto {
  // Return the PMV chart inputs request.
  return {
    // Map each visible input ID to its comfort zone request.
    inputs: visibleInputIds.reduce((accumulator, inputId) => {
      accumulator[inputId] = toComfortZoneRequest(state, inputId);
      return accumulator;
    }, {} as PmvChartInputsRequestDto["inputs"]),
    // The visual range for the temperature axis on the chart.
    chartRange: {
      tdbMin: 10,
      tdbMax: 40,
      tdbPoints: 121,
      humidityRatioMin: 0,
      humidityRatioMax: 0.03,
    },
    // The relative humidity levels to draw as reference curves. Example: [50, 100]
    rhCurves: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
  };
}

/**
 * Builds the visual tabular result sections for the PMV module display outputs.
 * Parses compliant parameters into colored strings.
 * @param results A record of all computed results indexed by InputId.
 * @param visibleInputIds Renderable Input identities.
 * @param _unitSystem (Ignored) Current standard unit system block.
 * @returns Array representing mapped table output sections.
 */
function buildPmvResultSections(
  results: Record<InputIdType, PmvResponseDto | null>,
  visibleInputIds: InputIdType[],
  unitSystem: UnitSystemType,
  options: any,
  selectedChartId: ChartIdType,
) {
  // Normalize the model options for PMV.
  const normalizedOptions = normalizePmvOptions(options);

  // The list of result table sections.
  const sections = [];

  // Add the compliance status section.
  sections.push(
    buildResultSection("Compliance", results, visibleInputIds, (result) => {
      return {
        text: result.isCompliant ? "Compliant" : "Out of range",
        tone: result.isCompliant ? "success" : "danger",
      };
    }),
  );

  // Add the "Relative air speed" section if the air speed input mode is "Measured air speed".
  if (normalizedOptions[OptionKey.AirSpeedInputMode] === AirSpeedInputMode.Measured) {
    const airSpeedUnits = fieldMetaByKey[FieldKey.RelativeAirSpeed].displayUnits[unitSystem];
    sections.push(
      buildResultSection("Relative air speed", results, visibleInputIds, (result) => {
        // Convert the SI value to the user's preferred unit system.
        const displayValue = convertFieldValueFromSi(FieldKey.RelativeAirSpeed, result.vr, unitSystem);
        // Format the value as a string with the correct number of decimals.
        const formattedValue = formatDisplayValue(
          displayValue,
          fieldMetaByKey[FieldKey.RelativeAirSpeed].decimals,
        );

        return {
          text: `${formattedValue} ${airSpeedUnits}`,
          tone: "default",
        };
      }),
    );
  }

  // Add the raw PMV value section. Example: "-0.50"
  sections.push(
    buildResultSection("PMV", results, visibleInputIds, (result) => {
      return {
        text: result.pmv.toFixed(2),
        tone: "default",
      };
    }),
  );
  
  // Add the "Zone" section. Example: "Neutral"
  sections.push(
    buildResultSection("Zone", results, visibleInputIds, (result) => {
      return getPmvZone(result.pmv);
    }),
  );

  // Add the PPD (Predicted Percentage of Dissatisfied) section. Example: "10.0%"
  sections.push(
    buildResultSection("PPD", results, visibleInputIds, (result) => {
      return {
        text: `${result.ppd.toFixed(1)}%`,
        tone: "default",
      };
    }),
  );

  // Add the calculated acceptability percentage. Example: "90.0%"
  sections.push(
    buildResultSection("Acceptability", results, visibleInputIds, (result) => {
      return {
        text: `${(100 - result.ppd).toFixed(1)}%`,
        tone: "default",
      };
    }),
  );

  // Return the completed array of sections.
  return sections;
}

/**
 * Delegates active Chart renderings specifically for PMV models.
 * Returns either a Psychrometric UI trace or Relative Humidity chart UI trace setup.
 * @param chartId Requested Chart ID schema.
 * @param chartSource Valid source inputs configuration.
 * @param unitSystem Client unit rendering strategy.
 * @returns Configured Plotly traces and layouts, or null.
 */
function buildPmvChartResult(
  chartId: ChartIdType,
  chartSource: PmvChartSourceDto | null,
  unitSystem: UnitSystemType,
) {
  // If there is no chart source data, return null.
  if (!chartSource) {
    return null;
  }

  // Handle the Psychrometric chart type.
  if (chartId === ChartId.Psychrometric) {
    return buildComparePsychrometricChart(
      chartSource.chartRequest, 
      chartSource.comfortZonesByInput, 
      unitSystem,
      chartSource
    );
  }

  // Handle the Dynamic PMV chart type.
  if (chartId === ChartId.PmvDynamic && chartSource.dynamicXAxis && chartSource.dynamicYAxis) {
    return buildPmvDynamicChart(
      chartSource.chartRequest,
      chartSource.dynamicXAxis as any,
      chartSource.dynamicYAxis as any,
      unitSystem,
      chartSource
    );
  }

  // Return null if the chart ID is not supported.
  return null;
}

/**
 * Binds an InputControlBehavior to update a dynamic `OptionKey`.
 * @param behavior The canonical Input control pipeline behavior.
 * @param optionKey The Option string mapping enum value.
 * @returns Intersected state function mutator.
 */
function createOptionHandler(
  behavior: InputControlBehavior,
  optionKey: OptionKeyType,
) {
  return (context: any, nextValue: string) => {
    // Check if the behavior has an applyOptionChange function.
    if (behavior.applyOptionChange) {
      // Call it and return the state patch.
      return behavior.applyOptionChange(context, optionKey, nextValue);
    }
    // Otherwise return null.
    return null;
  };
}

const temperatureBehavior = createTemperatureControlBehavior(InputControlId.Temperature);
const airSpeedBehavior = createAirSpeedControlBehavior(InputControlId.AirSpeed);
const humidityBehavior = createHumidityControlBehavior(InputControlId.Humidity);

/**
 * The ComfortModelBuilder used for PMV model.
 * Connects required behavior controls (Temperature, AirSpeed, etc.) and provides option maps.
 * This builder is directly consumed inside the createComfortToolState.svelte to form the application's overall PMV behavior model.
 */
export const pmvModelConfig = new ComfortModelBuilder<PmvResponseDto, PmvChartSourceDto>(ComfortModel.Pmv)
  // Add Temperature input control.
  .addControl({
    id: InputControlId.Temperature,
    behavior: temperatureBehavior,
  })
  // Add Radiant Temperature input control.
  .addControl({
    id: InputControlId.RadiantTemperature,
    behavior: createControlBehavior({
      controlId: InputControlId.RadiantTemperature,
      fieldKey: FieldKey.MeanRadiantTemperature,
      // The Radiant Temperature input is hidden if we are in Operative Temperature mode.
      hidden: (context) => {
        const options = normalizePmvOptions(context.options);
        return options[OptionKey.TemperatureMode] === TemperatureMode.Operative;
      },
    }),
  })
  // Add Air Speed input control.
  .addControl({
    id: InputControlId.AirSpeed,
    behavior: airSpeedBehavior,
  })
  // Add Humidity input control.
  .addControl({
    id: InputControlId.Humidity,
    behavior: humidityBehavior,
  })
  // Add Metabolic Rate input control.
  .addControl({
    id: InputControlId.MetabolicRate,
    // Behavior applies the input change to the state.
    behavior: createControlBehavior({
      // The ID must match the InputIdType enum value.
      controlId: InputControlId.MetabolicRate,
      fieldKey: FieldKey.MetabolicRate,
      // Provide preset option values for the input control.
      presetOptions: metabolicPresetOptions,
      // Custom logic for applying metabolic rate changes, ensuring synchronization with other fields.
      applyInput: (context, inputId, nextValue) => {
        // Clone the existing input state and update the metabolic rate field.
        const nextInputState = Object.assign({}, context.inputsByInput[inputId]);
        nextInputState[FieldKey.MetabolicRate] = nextValue;

        // Synchronize the input state (e.g., updating calculated fields if needed).
        const synchronizedState = synchronizePmvInputState(
          // Pass the new input state to the synchronizer.
          nextInputState,
          // Pass the current options.
          context.options,
          // Pass the derived values for the input control.
          context.derivedByInput[inputId],
        );
        
        // Return a patch for the specific input slot.
        return createSingleInputPatch(inputId, synchronizedState.inputState);
      },
    }),
  })
  // Add Clothing Insulation input control.
  .addControl({
    id: InputControlId.ClothingInsulation,
    behavior: createControlBehavior({
      // The ID must match the InputIdType enum value.
      controlId: InputControlId.ClothingInsulation,
      fieldKey: FieldKey.ClothingInsulation,
      // Provide preset option values for the input control.
      presetOptions: clothingPresetOptions,
      // Provide the number of decimal places to use for the input control.
      presetDecimals: 2,
      // Show the clothing builder for the input control.
      showClothingBuilder: true,
    }),
  })
  // Add option handlers for input modes for PMV. 
  .addOptionHandler(OptionKey.TemperatureMode, createOptionHandler(temperatureBehavior, OptionKey.TemperatureMode))
  .addOptionHandler(OptionKey.AirSpeedControlMode, createOptionHandler(airSpeedBehavior, OptionKey.AirSpeedControlMode))
  .addOptionHandler(OptionKey.AirSpeedInputMode, createOptionHandler(airSpeedBehavior, OptionKey.AirSpeedInputMode))
  .addOptionHandler(OptionKey.HumidityInputMode, createOptionHandler(humidityBehavior, OptionKey.HumidityInputMode))
  // Set the default chart for PMV.
  .setDefaultChart(ChartId.Psychrometric, pmvChartIds)
  // Set the default options for PMV.
  .setDefaultOptions(Object.assign({}, defaultPmvOptions))
  // Set the option normalizer for PMV.
  .setOptionNormalizer(normalizePmvOptionsSnapshot)
  .setDynamicAxisFields([
    FieldKey.DryBulbTemperature,
    FieldKey.MeanRadiantTemperature,
    FieldKey.OperativeTemperature,
    FieldKey.RelativeAirSpeed,
    FieldKey.RelativeHumidity,
    FieldKey.MetabolicRate,
    FieldKey.ClothingInsulation,
  ])
  // Set the calculator for PMV.
  .setCalculator((state, visibleInputIds) => {
    // Generate the request DTO for the chart.
    const compareChartRequest = toPmvChartInputsRequest(state, visibleInputIds);
    
    // Create an empty results map.
    const resultsByInput = createEmptyResults<PmvResponseDto>();
    
    // Calculate comfort zones (the visual polygons on the chart) for each visible input.
    const comfortZonesByInput = visibleInputIds.reduce((accumulator, inputId) => {
      // Calculate the comfort zone for the current visible input.
      accumulator[inputId] = calculateComfortZone(toComfortZoneRequest(state, inputId));
      return accumulator;
    }, {} as ComfortZonesByInput);

    // Perform the main PMV calculation for each visible input slot.
    visibleInputIds.forEach((inputId) => {
      const request = toPmvRequest(state, inputId);
      const result = pmv_ppd_ashrae(
        request.tdb,
        request.tr,
        request.vr,
        request.rh,
        request.met,
        request.clo,
        request.wme,
        {
          units: request.units,
          limit_inputs: false,
          airspeed_control: request.occupantHasAirSpeedControl,
        },
      );
      const complianceWarnings = check_standard_compliance("ASHRAE", {
        tdb: request.tdb,
        tr: request.tr,
        v: request.vr,
        met: request.met,
        clo: request.clo,
        airspeed_control: request.occupantHasAirSpeedControl,
      });

      resultsByInput[inputId] = {
        pmv: result.pmv,
        ppd: result.ppd,
        vr: request.vr,
        isCompliant: complianceWarnings.length === 0
          && Math.abs(result.pmv) <= PMV_COMFORT_LIMIT,
        standard: ComfortStandard.Ashrae55PmvPpd,
        source: CalculationSource.JsThermalComfort,
      };
    });

    // Return the combined results and chart source data.
    return {
      // Map PMV calculation results to their input slots.
      resultsByInput: resultsByInput,
      // Combine the compare chart request and comfort zones into a single chart source.
      chartSource: {
        // The compare chart request.
        chartRequest: compareChartRequest,
        // The comfort zones for each visible input.
        comfortZonesByInput: comfortZonesByInput,
        dynamicXAxis: state.ui.dynamicXAxis,
        dynamicYAxis: state.ui.dynamicYAxis,
        baselineInputId: state.ui.chartBaselineInputId,
      },
    };
  })
  // Set the result builder for PMV.
  .setResultBuilder(buildPmvResultSections)
  // Set the chart builder for PMV.
  .setChartBuilder((chartId, chartSource, _resultsByInput, unitSystem) => {
    // Return the calculated chart trace configuration.
    return buildPmvChartResult(chartId, chartSource, unitSystem);
  })
  // Build the ComfortModel instance.
  .build();
