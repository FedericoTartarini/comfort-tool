/**
 * @file windChill.ts
 * @description Configuration and calculation service for the Wind Chill comfort model.
 */

import { CalculationSource } from "../models/calculationMetadata";
import { ComfortModel, comfortModelMetaById } from "../models/comfortModels";
import { ChartId } from "../models/chartOptions";
import { FieldKey } from "../models/fieldKeys";
import { fieldMetaByKey } from "../models/inputFieldsMeta";
import { InputControlId } from "../models/inputControls";
import { ThermalZone } from "../models/thermalZone";
import {
  bandsFromThermalZones,
  ChartMode,
  ModelOutputKey,
  type ModelOutput,
} from "../models/modelCapabilities";
import { UnitSystem } from "../models/units";
import type { InputId as InputIdType } from "../models/inputSlots";
import type { CompareInputMap } from "../models/comfortDtos";
import { buildDefaultPresentation, createControlBehavior, createTemperatureControlBehavior } from "../services/comfort/controls/controlBehaviors";
import { buildComfortModelChart } from "../services/comfort/charts/sharedCharts";
import { wc, wind_chill_temperature } from "jsthermalcomfort";
import {
  convertFieldValueFromSi,
  convertModelOutputFromSi,
  formatDisplayValue,
  getModelOutputDisplayMeta,
} from "../services/units/index";
import { ComfortModelBuilder, isRecord, createEmptyResults, buildResultSection } from "../state/comfortTool/modelConfigs/builder";

// ── Thermal Zones Definition ──────────────────────────

export const windChillZonesList = [
  new ThermalZone({ label: "Safe", max: 1400, color: "#e0f2fe", textColor: "#0369a1" }),
  new ThermalZone({ label: "30 mins to frostbite", min: 1400, max: 1600, color: "#64b5f5", textColor: "#1d4ed8" }),
  new ThermalZone({ label: "10 mins to frostbite", min: 1600, max: 2300, color: "#5c6bc0", textColor: "#3730a3" }),
  new ThermalZone({ label: "2 mins to frostbite", min: 2300, color: "#8e24aa", textColor: "#6b21a8" }),
];

// ── Constants ────────────────────────────────────────────────────────
// Temperature is restricted between -45 °C and 0 °C because wind chill index is only defined 
// for cold-stress / freezing conditions (at or below 0 °C / 32 °F).
const TDB_LIMITS = { min: -45, max: 0 };
// Wind speed is constrained between 1 m/s and 20 m/s because wind-induced heat loss dominates over natural convection 
// above 1 m/s, while speeds exceeding 20 m/s represent extreme storm winds and see diminishing increases in cooling rate.
const WIND_LIMITS = { min: 1, max: 20 };

// Fallback baseline values for dynamic chart generation.
// Restricted to freezing temperatures (tdb <= 0 °C) because the global default (25 °C) lies outside the domain of the Wind Chill model.
const DEFAULT_BASELINE = { tdb: -10, v: 5 };

// Converts Wind Chill Temperature (WCT) from km/h to m/s (required for passing to JsThermalComfort library).
const WCT_CONVERSION_FACTOR = 3.6;

// ── Data Transfer Object (DTOs) ────────────────────────────────────────────────────────
export interface WindChillRequestDto {
  tdb: number;
  v: number;
  units: UnitSystem;
}

export interface WindChillResponseDto {
  wci: number;
  wciTemp: number;
  wciZone: string;
  source: CalculationSource;
}

export interface WindChillChartSourceDto {
  chartRequest: CompareInputMap<WindChillRequestDto>;
  baselineInputId?: InputIdType;
}

/**
 * Calculates the Wind Chill Index, equivalent temperature, and resolves its frostbite zone.
 * @param payload The standardized request inputs.
 * @returns An object containing the calculated Wind Chill values and risk zone.
 */
export function calculateWindChill(payload: WindChillRequestDto): WindChillResponseDto {
  const tdbSi = payload.tdb;
  const vSi = payload.v;

  const wci = wc(tdbSi, vSi).wci;

  // Calculate equivalent Wind Chill Temperature
  // Only applied if wind speed is greater than 1.33 m/s and temperature is less than or equal to 10 Celsius
  let wciTemp: number | undefined = undefined;
  if (vSi > 1.33 && tdbSi <= 10) {
    wciTemp = wind_chill_temperature(tdbSi, vSi * WCT_CONVERSION_FACTOR).wct;
  } else {
    wciTemp = tdbSi;
  }

  const zone = windChillZonesList.find((z) => z.contains(wci));
  const wciZone = zone ? zone.label : windChillZonesList[0].label;

  return {
    wci,
    wciTemp,
    wciZone,
    source: CalculationSource.JsThermalComfort,
  };
}

/**
 * Extracts calculation inputs from UI state for a specific input slot.
 */
function toWindChillRequest(state: any, inputId: InputIdType): WindChillRequestDto {
  const inputs = state.inputsByInput[inputId];
  const v = Number(inputs[FieldKey.WindSpeed]);

  return {
    tdb: Number(inputs[FieldKey.DryBulbTemperature]),
    v: isNaN(v) ? WIND_LIMITS.min : v,
    units: UnitSystem.SI,
  };
}

// ── Model Configuration Builder ──────────────────────────────────────────────

const windChillBuilder = new ComfortModelBuilder<WindChillResponseDto, WindChillChartSourceDto>(ComfortModel.WindChill);

const windChillOutput: ModelOutput = {
  key: ModelOutputKey.WindChill,
  label: "Wind Chill Index",
  unit: "W/m²",
  defaultBands: bandsFromThermalZones(windChillZonesList),
};

/**
 * Registers dropdown metadata for the Wind Chill model.
 */
windChillBuilder
  .setLabel(comfortModelMetaById[ComfortModel.WindChill].label)
  .setDescription(comfortModelMetaById[ComfortModel.WindChill].description)
  .setModes([ChartMode.Explore])
  .setChartableOutputs([windChillOutput]);

/**
 * Registers UI controls for the Wind Chill model.
 */
windChillBuilder.addControl({
  id: InputControlId.Temperature,
  behavior: createTemperatureControlBehavior(InputControlId.Temperature, {
    minValue: TDB_LIMITS.min,
    maxValue: TDB_LIMITS.max,
  }),
});

windChillBuilder.addControl({
  id: InputControlId.WindSpeed,
  behavior: createControlBehavior({
    controlId: InputControlId.WindSpeed,
    fieldKey: FieldKey.WindSpeed,
    minValue: WIND_LIMITS.min,
    maxValue: WIND_LIMITS.max,
    getPresentation: (context, meta) => {
      const presentation = buildDefaultPresentation(context, meta, {
        minValue: WIND_LIMITS.min,
        maxValue: WIND_LIMITS.max,
      });
      presentation.step = 1;
      presentation.decimals = 0;
      return presentation;
    },
  }),
});

/**
 * Registers the calculation logic for the Wind Chill model.
 */
windChillBuilder.setCalculator((state, visibleInputIds) => {
  const resultsByInput = createEmptyResults<WindChillResponseDto>();
  const chartInputs: CompareInputMap<WindChillRequestDto> = {};

  visibleInputIds.forEach((inputId) => {
    const request = toWindChillRequest(state, inputId);
    resultsByInput[inputId] = calculateWindChill(request);
    chartInputs[inputId] = request;
  });

  return {
    resultsByInput,
    chartSource: {
      chartRequest: chartInputs,
      baselineInputId: state.ui.chartBaselineInputId,
    },
  };
});

windChillBuilder.setResultBuilder((results, visibleInputIds, unitSystem) => {
  const temperatureUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
  return [
    buildResultSection(`${comfortModelMetaById[ComfortModel.WindChill].label} Index`, results, visibleInputIds, (result) => {
      if (result.wci === undefined) return { text: "" };

      const outputMeta = getModelOutputDisplayMeta(ModelOutputKey.WindChill, unitSystem);
      const displayValue = convertModelOutputFromSi(ModelOutputKey.WindChill, result.wci, unitSystem);
      const formattedValue = formatDisplayValue(displayValue, outputMeta.decimals);

      const zone = windChillZonesList.find((z) => z.contains(result.wci));
      const color = zone ? zone.textColor : "";

      return {
        text: `${formattedValue} ${outputMeta.displayUnits}`,
        subtext: result.wciZone,
        color,
      };
    }),
    buildResultSection(`${comfortModelMetaById[ComfortModel.WindChill].label} Temperature`, results, visibleInputIds, (result) => {
      if (result.wciTemp === undefined) return { text: "" };
      const displayValue = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.wciTemp, unitSystem);
      const formattedValue = formatDisplayValue(displayValue, 1);

      const zone = windChillZonesList.find((z) => z.contains(result.wci));
      const color = zone ? zone.textColor : "";

      return {
        text: `${formattedValue} ${temperatureUnits}`,
        color,
      };
    }),
  ];
});

/**
 * Registers the chart building logic for the Wind Chill model.
 */
windChillBuilder.setChartBuilder((chartId, chartSource, resultsByInput, unitSystem, fieldChartConfig) => {
  const temperatureUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];

  return buildComfortModelChart(
    chartId,
    chartSource,
    resultsByInput,
    unitSystem,
    fieldChartConfig?.mode === ChartMode.Explore ? fieldChartConfig : null,
    {
      dynamicChartId: ChartId.WindChillDynamic,
      dynamicTitle: `${comfortModelMetaById[ComfortModel.WindChill].label} Dynamic Chart`,
      output: windChillOutput,
      zones: windChillZonesList,
      bandLabel: "Frostbite Risk",
      dynamicHoverExtension: {
        templateSuffix: `<br>${comfortModelMetaById[ComfortModel.WindChill].label} Temperature: %{customdata[1]:.1f} ${temperatureUnits}`,
        getInputMetadata: (cached) => [
          cached?.wciTemp === undefined
            ? ""
            : convertFieldValueFromSi(
                FieldKey.DryBulbTemperature,
                cached.wciTemp,
                unitSystem,
              ),
        ],
      },
      customRanges: {
        [FieldKey.DryBulbTemperature]: TDB_LIMITS,
        [FieldKey.RelativeAirSpeed]: WIND_LIMITS,
        [FieldKey.WindSpeed]: WIND_LIMITS,
      },
      baselinePayloadDefault: DEFAULT_BASELINE,
      calculateDynamicOutput: (xSi, ySi, dynamicXAxis, dynamicYAxis, baselinePayload, zOutput) => {
        if (zOutput !== ModelOutputKey.WindChill) {
          throw new Error(`Unsupported Wind Chill chart output: ${zOutput}`);
        }
        const calcPayload: any = { ...baselinePayload, units: UnitSystem.SI };
        calcPayload[dynamicXAxis] = xSi;
        calcPayload[dynamicYAxis] = ySi;
        const result = calculateWindChill(calcPayload);

        return {
          valueSi: result.wci,
          additionalHoverMetadata: [
            convertFieldValueFromSi(
              FieldKey.DryBulbTemperature,
              result.wciTemp,
              unitSystem,
            ),
          ],
        };
      },
      getResultOutputValue: (cached, zOutput) => (
        zOutput === ModelOutputKey.WindChill ? cached?.wci : undefined
      ),
    },
  );
});

/**
 * Registers default chart IDs, dynamic axis fields, and default options for the Wind Chill model.
 */
windChillBuilder.setDefaultChart(ChartId.WindChillDynamic, [ChartId.WindChillDynamic]);
windChillBuilder.setDynamicAxisFields([FieldKey.DryBulbTemperature, FieldKey.WindSpeed]);
windChillBuilder.setDefaultDynamicAxes({
  xAxis: FieldKey.DryBulbTemperature,
  yAxis: FieldKey.WindSpeed,
});
windChillBuilder.setDefaultOptions({});
windChillBuilder.setOptionNormalizer((value) => isRecord(value) ? value : {});
windChillBuilder.setZones(windChillZonesList);
windChillBuilder.setLegendChartIds([ChartId.WindChillDynamic]);
windChillBuilder.setLegendTitle("Wind Chill");
windChillBuilder.setLockYAxisChartIds([ChartId.WindChillDynamic]);

/**
 * Builds the final Wind Chill model configuration.
 */
export const windChillModelConfig = windChillBuilder.build();
