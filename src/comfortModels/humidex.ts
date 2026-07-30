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
import {
  bandsFromThermalZones,
  ChartMode,
  ModelOutputKey,
  type ModelOutput,
} from "../models/modelCapabilities";
import { UnitSystem } from "../models/units";
import type { InputId as InputIdType } from "../models/inputSlots";
import type { CompareInputMap } from "../models/comfortDtos";
import { createControlBehavior } from "../services/comfort/controls/controlBehaviors";
import { roundValue } from "../services/comfort/helpers";
import {
  buildGridModelChart,
  type GridModelChartSpec,
} from "../services/comfort/charts/gridModelCharts";
import {
  convertFieldValueFromSi,
  convertModelOutputFromSi,
  formatDisplayValue,
  getModelOutputDisplayMeta,
} from "../services/units/index";
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

function getHumidexAxisValue(
  payload: HumidexRequestDto,
  field: FieldKey,
): number {
  switch (field) {
    case FieldKey.DryBulbTemperature:
      return payload.tdb;
    case FieldKey.RelativeHumidity:
      return payload.rh;
    default:
      throw new Error(`Unsupported Humidex chart field: ${field}`);
  }
}

function setHumidexAxisValue(
  payload: HumidexRequestDto,
  field: FieldKey,
  valueSi: number,
): void {
  switch (field) {
    case FieldKey.DryBulbTemperature:
      payload.tdb = valueSi;
      return;
    case FieldKey.RelativeHumidity:
      payload.rh = valueSi;
      return;
    default:
      throw new Error(`Unsupported Humidex chart field: ${field}`);
  }
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

const humidexOutput: ModelOutput = {
  key: ModelOutputKey.Humidex,
  label: "Humidex",
  defaultBands: bandsFromThermalZones(humidexZonesList),
};

/**
 * Registers dropdown metadata for the Humidex model.
 */
humidexBuilder
  .setLabel(comfortModelMetaById[ComfortModel.Humidex].label)
  .setDescription(comfortModelMetaById[ComfortModel.Humidex].description)
  .setModes([ChartMode.Explore])
  .setChartableOutputs([humidexOutput]);

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
      baselineInputId: state.ui.chartBaselineInputId,
    },
  };
});

humidexBuilder.setResultBuilder((results, visibleInputIds, unitSystem) => {
  const outputMeta = getModelOutputDisplayMeta(ModelOutputKey.Humidex, unitSystem);
  return [
    buildResultSection(comfortModelMetaById[ComfortModel.Humidex].label, results, visibleInputIds, (result) => {
      if (result.humidex === undefined || result.humidex === null) return { text: "" };
      const displayValue = convertModelOutputFromSi(ModelOutputKey.Humidex, result.humidex, unitSystem);
      const formattedValue = formatDisplayValue(displayValue, outputMeta.decimals);

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
humidexBuilder.setChartBuilder((chartId, chartSource, resultsByInput, unitSystem, fieldChartConfig) => {
  const chartSpec: GridModelChartSpec<HumidexRequestDto, HumidexResponseDto> = {
    dynamicChartId: ChartId.HumidexDynamic,
    dynamicTitle: `${comfortModelMetaById[ComfortModel.Humidex].label} Dynamic Chart`,
    output: humidexOutput,
    zones: humidexZonesList,
    axisRanges: {
      [FieldKey.DryBulbTemperature]: TDB_LIMITS,
    },
    baselinePayloadDefault: {
      tdb: fieldMetaByKey[FieldKey.DryBulbTemperature].defaultValue,
      rh: fieldMetaByKey[FieldKey.RelativeHumidity].defaultValue,
      units: UnitSystem.SI,
    },
    getAxisValue: getHumidexAxisValue,
    setAxisValue: setHumidexAxisValue,
    evaluate: calculateHumidex,
    getOutputValue: (result) => result.humidex,
    staticChart: {
      chartId: ChartId.Humidex,
      title: `${comfortModelMetaById[ComfortModel.Humidex].label} Discomfort`,
      xField: FieldKey.RelativeHumidity,
      yField: FieldKey.DryBulbTemperature,
      xRangeSi: {
        min: fieldMetaByKey[FieldKey.RelativeHumidity].minValue,
        max: fieldMetaByKey[FieldKey.RelativeHumidity].maxValue,
      },
      yRangeSi: TDB_LIMITS,
      hovertemplate: "%{text}<extra></extra>",
      getInputHovertemplate: (label, result) => `${label}<br>${fieldMetaByKey[FieldKey.RelativeHumidity].label}: %{x:.1f}%<br>${fieldMetaByKey[FieldKey.DryBulbTemperature].label}: %{y:.1f}${fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem]}<br><b>Discomfort: ${result?.humidexDiscomfort || ""}</b><br>${comfortModelMetaById[ComfortModel.Humidex].label}: ${roundValue(result?.humidex, 1)}<extra></extra>`,
      getXValue: (payload) => payload.rh,
      getYValue: (payload) => payload.tdb,
      evaluatePoint: (xSi, ySi) => {
        const result = calculateHumidex({
          tdb: ySi,
          rh: xSi,
          units: UnitSystem.SI,
        });
        const zone = humidexZonesList.find((candidate) => candidate.contains(result.humidex));
        const rangeValue = zone ? humidexZonesList.indexOf(zone) : 0;
        const zoneLabel = zone?.label ?? humidexZonesList[0].label;

        const rhDisp = convertFieldValueFromSi(FieldKey.RelativeHumidity, xSi, unitSystem);
        const tdbDisp = convertFieldValueFromSi(FieldKey.DryBulbTemperature, ySi, unitSystem);
        const modelLabel = comfortModelMetaById[ComfortModel.Humidex].label;
        const hovertext = `${fieldMetaByKey[FieldKey.RelativeHumidity].label}: ${roundValue(rhDisp, 1)}%<br>${fieldMetaByKey[FieldKey.DryBulbTemperature].label}: ${roundValue(tdbDisp, 1)}${fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem]}<br><b>Discomfort: ${zoneLabel}</b><br>${modelLabel}: ${roundValue(result.humidex, 1)}`;

        return { rangeValue, category: zoneLabel, hovertext };
      },
    },
  };

  return buildGridModelChart(
    chartId,
    chartSource,
    resultsByInput,
    unitSystem,
    fieldChartConfig,
    chartSpec,
  );
});

/**
 * Registers default chart IDs, dynamic axis fields, and default options for the Humidex model.
 */
humidexBuilder.setDefaultChart(ChartId.Humidex, [ChartId.Humidex, ChartId.HumidexDynamic]);
humidexBuilder.setDynamicAxisFields([FieldKey.DryBulbTemperature, FieldKey.RelativeHumidity]);
humidexBuilder.setDefaultDynamicAxes({
  xAxis: FieldKey.DryBulbTemperature,
  yAxis: FieldKey.RelativeHumidity,
});
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
