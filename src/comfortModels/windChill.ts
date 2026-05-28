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
import { UnitSystem } from "../models/units";
import type { InputId as InputIdType } from "../models/inputSlots";
import type { CompareInputMap } from "../models/comfortDtos";
import { buildDefaultPresentation, createControlBehavior, createTemperatureControlBehavior } from "../services/comfort/controls/controlBehaviors";
import { roundValue } from "../services/comfort/helpers";
import { buildComfortModelChart } from "../services/comfort/charts/sharedCharts";
import { wc, wind_chill_temperature } from "jsthermalcomfort";
import { convertFieldValueFromSi, formatDisplayValue } from "../services/units/index";
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

// Dynamic units and conversion factor for the Wind Chill Index (convective cooling rate).
const WCI_UNITS = {
  [UnitSystem.SI]: "W/m²",
  [UnitSystem.IP]: "BTU/(h·ft²)",
};
// Converts thermal heat flux (WCI) from SI (W/m²) to IP (BTU/(h·ft²)) units.
// Specifically, 1 W/m² = 0.316998 BTU/(h·ft²).
const WCI_CONVERSION_FACTOR = 0.316998;

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
  dynamicXAxis?: FieldKey;
  dynamicYAxis?: FieldKey;
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

/**
 * Registers dropdown metadata for the Wind Chill model.
 */
windChillBuilder
  .setLabel(comfortModelMetaById[ComfortModel.WindChill].label)
  .setDescription(comfortModelMetaById[ComfortModel.WindChill].description);

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
      dynamicXAxis: state.ui.dynamicXAxis,
      dynamicYAxis: state.ui.dynamicYAxis,
      baselineInputId: state.ui.chartBaselineInputId,
    },
  };
});

windChillBuilder.setResultBuilder((results, visibleInputIds, unitSystem) => {
  const temperatureUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
  return [
    buildResultSection(`${comfortModelMetaById[ComfortModel.WindChill].label} Index`, results, visibleInputIds, (result) => {
      if (result.wci === undefined) return { text: "" };

      const displayValue = unitSystem === UnitSystem.SI ? result.wci : result.wci * WCI_CONVERSION_FACTOR;
      const formattedValue = formatDisplayValue(displayValue, 0);
      const wciUnit = WCI_UNITS[unitSystem];

      const zone = windChillZonesList.find((z) => z.contains(result.wci));
      const color = zone ? zone.textColor : "";

      return {
        text: `${formattedValue} ${wciUnit}`,
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
windChillBuilder.setChartBuilder((chartId, chartSource, resultsByInput, unitSystem) => {
  return buildComfortModelChart(chartId, chartSource, resultsByInput, unitSystem, {
    dynamicChartId: ChartId.WindChillDynamic,
    dynamicTitle: `${comfortModelMetaById[ComfortModel.WindChill].label} Dynamic Chart`,
    zones: windChillZonesList,
    customRanges: {
      [FieldKey.DryBulbTemperature]: TDB_LIMITS,
      [FieldKey.RelativeAirSpeed]: WIND_LIMITS,
      [FieldKey.WindSpeed]: WIND_LIMITS,
    },
    baselinePayloadDefault: DEFAULT_BASELINE,
    calculateDynamicPoint: (xSi, ySi, dynamicXAxis, dynamicYAxis, baselinePayload) => {
      const calcPayload: any = { ...baselinePayload, units: UnitSystem.SI };
      calcPayload[dynamicXAxis] = xSi;
      calcPayload[dynamicYAxis] = ySi;

      const wci = wc(calcPayload.tdb, calcPayload.v).wci;

      // Only applied if wind speed is greater than 1.33 m/s and temperature is less than or equal to 10 Celsius
      let wciTemp: number;
      if (calcPayload.v > 1.33 && calcPayload.tdb <= 10) {
        wciTemp = wind_chill_temperature(calcPayload.tdb, calcPayload.v * WCT_CONVERSION_FACTOR).wct;
      } else {
        wciTemp = calcPayload.tdb;
      }

      const zone = windChillZonesList.find((z) => z.contains(wci));
      const rangeValue = zone ? windChillZonesList.indexOf(zone) : 0;
      const zoneLabel = zone ? zone.label : windChillZonesList[0].label;

      const wciVal = unitSystem === UnitSystem.SI ? wci : wci * WCI_CONVERSION_FACTOR;
      const wciUnit = WCI_UNITS[unitSystem];
      const modelLabel = comfortModelMetaById[ComfortModel.WindChill].label;

      const xMeta = fieldMetaByKey[dynamicXAxis as FieldKey];
      const yMeta = fieldMetaByKey[dynamicYAxis as FieldKey];
      const xVal = convertFieldValueFromSi(dynamicXAxis as FieldKey, xSi, unitSystem);
      const yVal = convertFieldValueFromSi(dynamicYAxis as FieldKey, ySi, unitSystem);
      const wctDisp = convertFieldValueFromSi(FieldKey.DryBulbTemperature, wciTemp, unitSystem);

      const hovertext = `${xMeta?.label}: ${roundValue(xVal, 1)} ${xMeta?.displayUnits[unitSystem]}<br>${yMeta?.label}: ${roundValue(yVal, 1)} ${yMeta?.displayUnits[unitSystem]}<br><b>Frostbite Risk: ${zoneLabel}</b><br>${modelLabel} Index: ${roundValue(wciVal, 0)} ${wciUnit}<br>${modelLabel} Temperature: ${roundValue(wctDisp, 1)} ${fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem]}`;

      return { rangeValue, category: zoneLabel, hovertext };
    },
    getHovertemplateScatterDynamic: (label, cached) => {
      if (!chartSource) return "";
      const wciVal = unitSystem === UnitSystem.SI
        ? cached?.wci
        : (cached?.wci !== undefined ? cached.wci * WCI_CONVERSION_FACTOR : undefined);
      const wciUnit = WCI_UNITS[unitSystem];
      const modelLabel = comfortModelMetaById[ComfortModel.WindChill].label;
      return `${label}<br>${fieldMetaByKey[chartSource.dynamicXAxis as FieldKey]?.label}: %{x:.2f}<br>${fieldMetaByKey[chartSource.dynamicYAxis as FieldKey]?.label}: %{y:.2f}<br><b>Frostbite Risk: ${cached?.wciZone || ""}</b><br>${modelLabel} Index: ${wciVal !== undefined ? roundValue(wciVal, 0) : ""} ${wciUnit}<br>${modelLabel} Temperature: ${roundValue(convertFieldValueFromSi(FieldKey.DryBulbTemperature, cached?.wciTemp, unitSystem), 1)}${fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem]}<extra></extra>`;
    },
    hovertemplateContourDynamic: "%{text}<extra></extra>",
  });
});

/**
 * Registers default chart IDs, dynamic axis fields, and default options for the Wind Chill model.
 */
windChillBuilder.setDefaultChart(ChartId.WindChillDynamic, [ChartId.WindChillDynamic]);
windChillBuilder.setDynamicAxisFields([FieldKey.DryBulbTemperature, FieldKey.WindSpeed]);
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
