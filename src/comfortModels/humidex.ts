/**
 * @file humidex.ts
 * @description Configuration and calculation service for the Humidex comfort model.
 */

import { humidex } from "jsthermalcomfort";
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
import { buildComfortModelChart } from "../services/comfort/charts/sharedCharts";
import { convertFieldValueFromSi, formatDisplayValue } from "../services/units/index";
import { ComfortModelBuilder, isRecord, createEmptyResults, buildResultSection } from "../state/comfortTool/modelConfigs/builder";

// ── Thermal Zones Definition ─────────────────────────────────────────────────
export const humidexZonesList = [
  new ThermalZone({ label: "Little/None", max: 30, color: "#e2e8f0", textColor: "#475569" }),
  new ThermalZone({ label: "Noticeable", min: 30, max: 35, color: "#fef08a", textColor: "#854d0e" }),
  new ThermalZone({ label: "Evident", min: 35, max: 40, color: "#fde047", textColor: "#a16207" }),
  new ThermalZone({ label: "Intense", min: 40, max: 45, color: "#facc15", textColor: "#a16207" }),
  new ThermalZone({ label: "Dangerous", min: 45, max: 54, color: "#f97316", textColor: "#ea580c" }),
  new ThermalZone({ label: "Stroke Probable", min: 54, color: "#dc2626", textColor: "#b91c1c" }),
];

// ── Constants ────────────────────────────────────────────────────────
const TDB_LIMITS = { min: 20, max: 50 };

// ── Data Transfer Object (DTOs) ────────────────────────────────────────────────────────
export interface HumidexRequestDto {
  tdb: number;
  rh: number;
  units: UnitSystem;
}

export interface HumidexResponseDto {
  humidex: number;
  humidexDiscomfort: string;
  source: CalculationSource;
}

export interface HumidexChartSourceDto {
  chartRequest: CompareInputMap<HumidexRequestDto>;
  dynamicXAxis?: FieldKey;
  dynamicYAxis?: FieldKey;
  baselineInputId?: InputIdType;
}

/**
 * Calculates the Humidex and resolves its associated discomfort category.
 * @param payload The standardized request inputs.
 * @returns An object containing the calculated Humidex and its category.
 */
export function calculateHumidex(payload: HumidexRequestDto): HumidexResponseDto {
  const result = humidex(payload.tdb, payload.rh, { round: true });
  const h = result.humidex;

  const zone = humidexZonesList.find((z) => z.contains(h));
  const humidexDiscomfort = zone ? zone.label : humidexZonesList[0].label;

  return {
    humidex: h,
    humidexDiscomfort,
    source: CalculationSource.JsThermalComfort,
  };
}

/**
 * Extracts calculation inputs from UI state for a specific input slot.
 */
function toHumidexRequest(state: any, inputId: InputIdType): HumidexRequestDto {
  const inputs = state.inputsByInput[inputId];
  return {
    tdb: Number(inputs[FieldKey.DryBulbTemperature]),
    rh: Number(inputs[FieldKey.RelativeHumidity]),
    units: UnitSystem.SI,
  };
}


// ── Model Configuration Builder ──────────────────────────────────────────────

const humidexBuilder = new ComfortModelBuilder<HumidexResponseDto, HumidexChartSourceDto>(ComfortModel.Humidex);

/**
 * Registers dropdown metadata for the Humidex model.
 */
humidexBuilder
  .setLabel(comfortModelMetaById[ComfortModel.Humidex].label)
  .setDescription(comfortModelMetaById[ComfortModel.Humidex].description);

/**
 * Registers UI controls for the Humidex model.
 */
humidexBuilder.addControl({
  id: InputControlId.Temperature,
  behavior: createControlBehavior({
    controlId: InputControlId.Temperature,
    fieldKey: FieldKey.DryBulbTemperature,
    // Humidex is specifically used to describe warm/humid conditions (typically above 20 °C).
    minValue: TDB_LIMITS.min,
    maxValue: TDB_LIMITS.max,
  }),
});

humidexBuilder.addControl({
  id: InputControlId.Humidity,
  behavior: createControlBehavior({
    controlId: InputControlId.Humidity,
    fieldKey: FieldKey.RelativeHumidity,
  }),
});

/**
 * Registers the calculation logic for the Humidex model.
 */
humidexBuilder.setCalculator((state, visibleInputIds) => {
  const resultsByInput = createEmptyResults<HumidexResponseDto>();
  const chartInputs: CompareInputMap<HumidexRequestDto> = {};

  visibleInputIds.forEach((inputId) => {
    const request = toHumidexRequest(state, inputId);
    resultsByInput[inputId] = calculateHumidex(request);
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

humidexBuilder.setResultBuilder((results, visibleInputIds) => {
  return [
    buildResultSection(comfortModelMetaById[ComfortModel.Humidex].label, results, visibleInputIds, (result) => {
      if (result.humidex === undefined || result.humidex === null) return { text: "" };
      const formattedValue = formatDisplayValue(result.humidex, 1);

      const zone = humidexZonesList.find((z) => z.contains(result.humidex));
      const color = zone ? zone.textColor : "";

      return {
        text: `${formattedValue}`,
        subtext: result.humidexDiscomfort,
        color,
      };
    }),
  ];
});

/**
 * Registers the chart building logic for the Humidex model.
 */
humidexBuilder.setChartBuilder((chartId, chartSource, resultsByInput, unitSystem) => {
  return buildComfortModelChart(chartId, chartSource, resultsByInput, unitSystem, {
    dynamicChartId: ChartId.HumidexDynamic,
    dynamicTitle: `${comfortModelMetaById[ComfortModel.Humidex].label} Dynamic Chart`,
    zones: humidexZonesList,
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

      const res = humidex(calcPayload.tdb, calcPayload.rh, { round: true });
      const h = res.humidex;

      const zone = humidexZonesList.find((z) => z.contains(h));
      const rangeValue = zone ? humidexZonesList.indexOf(zone) : 0;
      const zoneLabel = zone ? zone.label : humidexZonesList[0].label;

      const xMeta = fieldMetaByKey[dynamicXAxis as FieldKey];
      const yMeta = fieldMetaByKey[dynamicYAxis as FieldKey];
      const xVal = convertFieldValueFromSi(dynamicXAxis as FieldKey, xSi, unitSystem);
      const yVal = convertFieldValueFromSi(dynamicYAxis as FieldKey, ySi, unitSystem);

      const xUnitStr = dynamicXAxis === FieldKey.RelativeHumidity ? "%" : ` ${xMeta?.displayUnits[unitSystem]}`;
      const yUnitStr = dynamicYAxis === FieldKey.RelativeHumidity ? "%" : ` ${yMeta?.displayUnits[unitSystem]}`;
      const modelLabel = comfortModelMetaById[ComfortModel.Humidex].label;

      const hovertext = `${xMeta?.label}: ${roundValue(xVal, 1)}${xUnitStr}<br>${yMeta?.label}: ${roundValue(yVal, 1)}${yUnitStr}<br><b>Discomfort: ${zoneLabel}</b><br>${modelLabel}: ${roundValue(h, 1)}`;

      return { rangeValue, category: zoneLabel, hovertext };
    },
    getHovertemplateScatterDynamic: (label, cached) => {
      if (!chartSource) return "";
      return `${label}<br>${fieldMetaByKey[chartSource.dynamicXAxis as FieldKey]?.label}: %{x:.1f}<br>${fieldMetaByKey[chartSource.dynamicYAxis as FieldKey]?.label}: %{y:.1f}<br><b>Discomfort: ${cached?.humidexDiscomfort || ""}</b><br>${comfortModelMetaById[ComfortModel.Humidex].label}: ${roundValue(cached?.humidex, 1)}<extra></extra>`;
    },
    hovertemplateContourDynamic: "%{text}<extra></extra>",
    staticConfig: {
      title: `${comfortModelMetaById[ComfortModel.Humidex].label} Discomfort`,
      xKey: FieldKey.RelativeHumidity,
      yKey: FieldKey.DryBulbTemperature,
      xRangeSi: {
        min: fieldMetaByKey[FieldKey.RelativeHumidity].minValue,
        max: fieldMetaByKey[FieldKey.RelativeHumidity].maxValue,
      },
      yRangeSi: TDB_LIMITS,
      hovertemplateContour: "%{text}<extra></extra>",
      getHovertemplateScatter: (label, cached) => `${label}<br>${fieldMetaByKey[FieldKey.RelativeHumidity].label}: %{x:.1f}%<br>${fieldMetaByKey[FieldKey.DryBulbTemperature].label}: %{y:.1f}${fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem]}<br><b>Discomfort: ${cached?.humidexDiscomfort || ""}</b><br>${comfortModelMetaById[ComfortModel.Humidex].label}: ${roundValue(cached?.humidex, 1)}<extra></extra>`,
      getScatterXSi: (p) => p.rh,
      getScatterYSi: (p) => p.tdb,
      calculateStaticPoint: (xSi, ySi) => {
        const result = humidex(ySi, xSi, { round: true });
        const h = result.humidex;
        const zone = humidexZonesList.find((z) => z.contains(h));
        const rangeValue = zone ? humidexZonesList.indexOf(zone) : 0;
        const zoneLabel = zone ? zone.label : humidexZonesList[0].label;

        const rhDisp = convertFieldValueFromSi(FieldKey.RelativeHumidity, xSi, unitSystem);
        const tdbDisp = convertFieldValueFromSi(FieldKey.DryBulbTemperature, ySi, unitSystem);
        const modelLabel = comfortModelMetaById[ComfortModel.Humidex].label;

        const hovertext = `${fieldMetaByKey[FieldKey.RelativeHumidity].label}: ${roundValue(rhDisp, 1)}%<br>${fieldMetaByKey[FieldKey.DryBulbTemperature].label}: ${roundValue(tdbDisp, 1)}${fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem]}<br><b>Discomfort: ${zoneLabel}</b><br>${modelLabel}: ${roundValue(h, 1)}`;

        return { rangeValue, category: zoneLabel, hovertext };
      }
    }
  });
});

/**
 * Registers default chart IDs, dynamic axis fields, and default options for the Humidex model.
 */
humidexBuilder.setDefaultChart(ChartId.Humidex, [ChartId.Humidex, ChartId.HumidexDynamic]);
humidexBuilder.setDynamicAxisFields([FieldKey.DryBulbTemperature, FieldKey.RelativeHumidity]);
humidexBuilder.setDefaultOptions({});
humidexBuilder.setOptionNormalizer((value) => isRecord(value) ? value : {});
humidexBuilder.setZones(humidexZonesList);
humidexBuilder.setLegendChartIds([ChartId.Humidex, ChartId.HumidexDynamic]);
humidexBuilder.setLegendTitle("Humidex");
humidexBuilder.setLockYAxisChartIds([ChartId.HumidexDynamic]);

/**
 * Builds the final Humidex model configuration.
 */
export const humidexModelConfig = humidexBuilder.build();
