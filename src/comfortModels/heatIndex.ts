/**
 * @file heatIndex.ts
 * @description Configuration and calculation service for the Heat Index comfort model.
 */

import { heat_index } from "jsthermalcomfort";
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
import { createControlBehavior } from "../services/comfort/controls/controlBehaviors";
import { roundValue } from "../services/comfort/helpers";
import { convertFieldValueToSi, convertFieldValueFromSi, formatDisplayValue } from "../services/units/index";
import { ComfortModelBuilder, isRecord, createEmptyResults, buildResultSection } from "../state/comfortTool/modelConfigs/builder";
import { buildComfortModelChart } from "../services/comfort/charts/sharedCharts";

// ── Thermal Zones Definition ─────────────────────────────────────────────────
export const heatIndexZonesList = [
  new ThermalZone({ label: "Safe", max: 27, color: "#e2e8f0", textColor: "#475569" }),
  new ThermalZone({ label: "Caution", min: 27, max: 32, color: "#fef08a", textColor: "#854d0e" }),
  new ThermalZone({ label: "Extreme Caution", min: 32, max: 39, color: "#fde047", textColor: "#a16207" }),
  new ThermalZone({ label: "Danger", min: 39, max: 51, color: "#f97316", textColor: "#ea580c" }),
  new ThermalZone({ label: "Extreme Danger", min: 51, color: "#dc2626", textColor: "#b91c1c" }),
];
// ── Constants ────────────────────────────────────────────────────────
// Min temperature is set to 20 °C rather than the 26.7 °C (80 °F) Rothfusz caution threshold.
// Since jsthermalcomfort returns NaN below this threshold by default, calculateHeatIndex falls 
// back to the ambient dry bulb temperature to supply safe results down to 20 °C.
const TDB_LIMITS = { min: 20, max: 50 };

// ── Data Transfer Object (DTOs) ────────────────────────────────────────────────────────
export interface HeatIndexRequestDto {
  tdb: number;
  rh: number;
  units: UnitSystem;
}

export interface HeatIndexResponseDto {
  hi: number;
  category: string;
  source: CalculationSource;
}

export interface HeatIndexChartSourceDto {
  chartRequest: CompareInputMap<HeatIndexRequestDto>;
  dynamicXAxis?: FieldKey;
  dynamicYAxis?: FieldKey;
  baselineInputId?: InputIdType;
}

/**
 * Calculates the Heat Index and resolves its associated risk category.
 * @param payload The standardized request inputs.
 * @returns An object containing the calculated Heat Index in SI units and its category.
 */
export function calculateHeatIndex(payload: HeatIndexRequestDto): HeatIndexResponseDto {
  // Compute Heat Index using jsthermalcomfort engine
  const result = heat_index(payload.tdb, payload.rh, { units: payload.units, round: true });

  // The Rothfusz regression is only valid above 27°C (80.6°F), returning NaN below this threshold.
  // As such, in cooler conditions, the apparent temperature will fall back to the ambient dry bulb temperature.
  const rawHiSi = convertFieldValueToSi(FieldKey.DryBulbTemperature, result.hi, payload.units);
  const tdbSi = convertFieldValueToSi(FieldKey.DryBulbTemperature, payload.tdb, payload.units);
  // If the raw Heat Index is NaN, use the dry bulb temperature
  const hiSi = isNaN(rawHiSi) ? tdbSi : rawHiSi;

  const zone = heatIndexZonesList.find((z) => z.contains(hiSi));
  const category = zone ? zone.label : heatIndexZonesList[0].label;

  return {
    hi: hiSi,
    category,
    source: CalculationSource.JsThermalComfort,
  };
}

/**
 * Extracts calculation inputs from UI state for a specific input slot.
 */
function toHeatIndexRequest(state: any, inputId: InputIdType): HeatIndexRequestDto {
  const inputs = state.inputsByInput[inputId];
  return {
    tdb: Number(inputs[FieldKey.DryBulbTemperature]),
    rh: Number(inputs[FieldKey.RelativeHumidity]),
    units: UnitSystem.SI,
  };
}


// ── Model Configuration Builder ──────────────────────────────────────────────

const heatIndexBuilder = new ComfortModelBuilder<HeatIndexResponseDto, HeatIndexChartSourceDto>(ComfortModel.HeatIndex);

/**
* Registers dropdown metadata for the Heat Index model.
*/
heatIndexBuilder
  .setLabel(comfortModelMetaById[ComfortModel.HeatIndex].label)
  .setDescription(comfortModelMetaById[ComfortModel.HeatIndex].description);

/**
* Registers UI controls for the Heat Index model.
*/
heatIndexBuilder.addControl({
  id: InputControlId.Temperature,
  behavior: createControlBehavior({
    controlId: InputControlId.Temperature,
    fieldKey: FieldKey.DryBulbTemperature,
    // The Rothfusz regression for Heat Index is typically valid for temperatures above 26.7 °C (80 °F).
    minValue: TDB_LIMITS.min,
    maxValue: TDB_LIMITS.max,
  }),
});

heatIndexBuilder.addControl({
  id: InputControlId.Humidity,
  behavior: createControlBehavior({
    controlId: InputControlId.Humidity,
    fieldKey: FieldKey.RelativeHumidity,
  }),
});



/**
 * Registers the calculation logic for the Heat Index model.
 */
heatIndexBuilder.setCalculator((state, visibleInputIds) => {
  const resultsByInput = createEmptyResults<HeatIndexResponseDto>();
  const chartInputs: CompareInputMap<HeatIndexRequestDto> = {};

  visibleInputIds.forEach((inputId) => {
    const request = toHeatIndexRequest(state, inputId);
    resultsByInput[inputId] = calculateHeatIndex(request);
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

heatIndexBuilder.setResultBuilder((results, visibleInputIds, unitSystem) => {
  const temperatureUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
  return [
    buildResultSection(comfortModelMetaById[ComfortModel.HeatIndex].label, results, visibleInputIds, (result) => {
      const displayValue = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.hi, unitSystem);
      const formattedValue = formatDisplayValue(displayValue, fieldMetaByKey[FieldKey.DryBulbTemperature].decimals);

      const zone = heatIndexZonesList.find((z) => z.contains(result.hi));
      const color = zone ? zone.textColor : "";

      return {
        text: `${formattedValue} ${temperatureUnits}`,
        subtext: result.category,
        color,
      };
    }),
  ];
});

/**
 * Registers the chart building logic for the Heat Index model.
 */
heatIndexBuilder.setChartBuilder((chartId, chartSource, resultsByInput, unitSystem) => {
  return buildComfortModelChart(chartId, chartSource, resultsByInput, unitSystem, {
    dynamicChartId: ChartId.HeatIndexDynamic,
    dynamicTitle: `${comfortModelMetaById[ComfortModel.HeatIndex].label} Dynamic Chart`,
    zones: heatIndexZonesList,
    customRanges: {
      [FieldKey.DryBulbTemperature]: TDB_LIMITS,
    },
    baselinePayloadDefault: {
      tdb: fieldMetaByKey[FieldKey.DryBulbTemperature].defaultValue,
      rh: fieldMetaByKey[FieldKey.RelativeHumidity].defaultValue,
    },
    calculateDynamicPoint: (xSi, ySi, dynamicXAxis, dynamicYAxis, baselinePayload) => {
      const calcPayload: any = { ...baselinePayload, units: UnitSystem.SI };
      calcPayload[dynamicXAxis] = xSi;
      calcPayload[dynamicYAxis] = ySi;

      const res = heat_index(calcPayload.tdb, calcPayload.rh, { round: true, units: UnitSystem.SI });
      const rawHiSi = convertFieldValueToSi(FieldKey.DryBulbTemperature, res.hi, UnitSystem.SI);
      const tdbSi = calcPayload.tdb;
      const hiSi = isNaN(rawHiSi) ? tdbSi : rawHiSi;

      const zone = heatIndexZonesList.find((z) => z.contains(hiSi));
      const rangeValue = zone ? heatIndexZonesList.indexOf(zone) : 0;
      const zoneLabel = zone ? zone.label : heatIndexZonesList[0].label;

      const xMeta = fieldMetaByKey[dynamicXAxis as FieldKey];
      const yMeta = fieldMetaByKey[dynamicYAxis as FieldKey];
      const xVal = convertFieldValueFromSi(dynamicXAxis as FieldKey, xSi, unitSystem);
      const yVal = convertFieldValueFromSi(dynamicYAxis as FieldKey, ySi, unitSystem);
      const hiDisp = convertFieldValueFromSi(FieldKey.DryBulbTemperature, hiSi, unitSystem);

      const xUnitStr = dynamicXAxis === FieldKey.RelativeHumidity ? "%" : ` ${xMeta?.displayUnits[unitSystem]}`;
      const yUnitStr = dynamicYAxis === FieldKey.RelativeHumidity ? "%" : ` ${yMeta?.displayUnits[unitSystem]}`;
      const hiUnitStr = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
      const modelLabel = comfortModelMetaById[ComfortModel.HeatIndex].label;

      const hovertext = `${xMeta?.label}: ${roundValue(xVal, 1)}${xUnitStr}<br>${yMeta?.label}: ${roundValue(yVal, 1)}${yUnitStr}<br><b>Category: ${zoneLabel}</b><br>${modelLabel}: ${roundValue(hiDisp, 1)}${hiUnitStr}`;

      return { rangeValue, category: zoneLabel, hovertext };
    },
    getHovertemplateScatterDynamic: (label, cached) => {
      if (!chartSource) return "";
      const modelLabel = comfortModelMetaById[ComfortModel.HeatIndex].label;
      return `${label}<br>${fieldMetaByKey[chartSource.dynamicXAxis as FieldKey]?.label}: %{x:.1f}<br>${fieldMetaByKey[chartSource.dynamicYAxis as FieldKey]?.label}: %{y:.1f}<br><b>Category: ${cached?.category || ""}</b><br>${modelLabel}: ${roundValue(convertFieldValueFromSi(FieldKey.DryBulbTemperature, cached?.hi, unitSystem), 1)}${fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem]}<extra></extra>`;
    },
    hovertemplateContourDynamic: "%{text}<extra></extra>",
    staticConfig: {
      title: `${comfortModelMetaById[ComfortModel.HeatIndex].label} Ranges`,
      xKey: FieldKey.RelativeHumidity,
      yKey: FieldKey.DryBulbTemperature,
      xRangeSi: {
        min: fieldMetaByKey[FieldKey.RelativeHumidity].minValue,
        max: fieldMetaByKey[FieldKey.RelativeHumidity].maxValue,
      },
      yRangeSi: TDB_LIMITS,
      hovertemplateContour: "%{text}<extra></extra>",
      getHovertemplateScatter: (label, cached) => {
        const modelLabel = comfortModelMetaById[ComfortModel.HeatIndex].label;
        return `${label}<br>${fieldMetaByKey[FieldKey.RelativeHumidity].label}: %{x:.1f}%<br>${fieldMetaByKey[FieldKey.DryBulbTemperature].label}: %{y:.1f}${fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem]}<br><b>Category: ${cached?.category || ""}</b><br>${modelLabel}: ${roundValue(convertFieldValueFromSi(FieldKey.DryBulbTemperature, cached?.hi, unitSystem), 1)}${fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem]}<extra></extra>`;
      },
      getScatterXSi: (p) => p.rh,
      getScatterYSi: (p) => p.tdb,
      calculateStaticPoint: (xSi, ySi) => {
        const result = heat_index(ySi, xSi, { round: true, units: UnitSystem.SI });
        const rawHiSi = convertFieldValueToSi(FieldKey.DryBulbTemperature, result.hi, UnitSystem.SI);
        const tdbSi = ySi;
        const hiSi = isNaN(rawHiSi) ? tdbSi : rawHiSi;

        const zone = heatIndexZonesList.find((z) => z.contains(hiSi));
        const rangeValue = zone ? heatIndexZonesList.indexOf(zone) : 0;
        const zoneLabel = zone ? zone.label : heatIndexZonesList[0].label;

        const rhDisp = convertFieldValueFromSi(FieldKey.RelativeHumidity, xSi, unitSystem);
        const tdbDisp = convertFieldValueFromSi(FieldKey.DryBulbTemperature, ySi, unitSystem);
        const hiDisp = convertFieldValueFromSi(FieldKey.DryBulbTemperature, hiSi, unitSystem);

        const rhLabel = fieldMetaByKey[FieldKey.RelativeHumidity].label;
        const tdbLabel = fieldMetaByKey[FieldKey.DryBulbTemperature].label;
        const tdbUnit = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
        const modelLabel = comfortModelMetaById[ComfortModel.HeatIndex].label;

        const hovertext = `${rhLabel}: ${roundValue(rhDisp, 1)}%<br>${tdbLabel}: ${roundValue(tdbDisp, 1)}${tdbUnit}<br><b>Category: ${zoneLabel}</b><br>${modelLabel}: ${roundValue(hiDisp, 1)}${tdbUnit}`;

        return { rangeValue, category: zoneLabel, hovertext };
      }
    }
  });
});

/**
 * Registers default chart IDs, dynamic axis fields, and default options for the Heat Index model.
 */
heatIndexBuilder.setDefaultChart(ChartId.HeatIndexRanges, [ChartId.HeatIndexRanges, ChartId.HeatIndexDynamic]);
heatIndexBuilder.setDynamicAxisFields([FieldKey.DryBulbTemperature, FieldKey.RelativeHumidity]);
heatIndexBuilder.setDefaultOptions({});
heatIndexBuilder.setOptionNormalizer((value) => isRecord(value) ? value : {});
heatIndexBuilder.setZones(heatIndexZonesList);
heatIndexBuilder.setLegendChartIds([ChartId.HeatIndexRanges, ChartId.HeatIndexDynamic]);
heatIndexBuilder.setLegendTitle("Heat Index");
heatIndexBuilder.setLockYAxisChartIds([ChartId.HeatIndexDynamic]);

/**
 * Builds the final Heat Index model configuration.
 */
export const heatIndexModelConfig = heatIndexBuilder.build();
