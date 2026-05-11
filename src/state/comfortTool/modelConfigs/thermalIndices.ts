/**
 * Thermal Indices Model Configurations
 * 
 * Defines the structural configurations for the standalone thermal models:
 * Heat Index, Humidex, and Wind Chill. Registers controls, calculation logic,
 * and chart builders for both standard and dynamic visualizations.
 */
import { ChartId, type ChartId as ChartIdType } from "../../../models/chartOptions";
import { type InputId as InputIdType } from "../../../models/inputSlots";
import { ComfortModel } from "../../../models/comfortModels";
import type { ThermalIndicesChartInputsRequestDto, ThermalIndicesChartSourceDto, ThermalIndicesResponseDto, ThermalIndicesRequestDto } from "../../../models/comfortDtos";
import { FieldKey } from "../../../models/fieldKeys";
import { fieldMetaByKey } from "../../../models/inputFieldsMeta";
import { InputControlId } from "../../../models/inputControls";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../../models/units";
import { createControlBehavior, buildDefaultPresentation } from "../../../services/comfort/controls/controlBehaviors";
import { calculateThermalIndices } from "../../../services/comfort/thermalIndices";
import { convertFieldValueFromSi, formatDisplayValue } from "../../../services/units/index";
import { ComfortModelBuilder, isRecord, createEmptyResults, buildResultSection } from "./builder";
import { buildHeatIndexRangesChart, buildHumidexChart, buildWindChillChart, buildThermalIndicesDynamicChart } from "../../../services/comfort/charts/thermalIndicesCharts";
import {
  HUMIDEX_NOTICEABLE,
  HUMIDEX_EVIDENT,
  HUMIDEX_INTENSE,
  HUMIDEX_DANGEROUS,
  HUMIDEX_STROKE_PROBABLE,
} from "../../../services/comfort/helpers";

// Shared helpers

/**
 * Ensures model options are normalized to an empty object if valid.
 */
function normalizeOptions(value: unknown) {
  if (isRecord(value)) return {};
  return null;
}

/**
 * Formats canonical UI state into a SI request DTO for thermal index calculations.
 */
function toThermalIndicesRequest(state: any, inputId: InputIdType): ThermalIndicesRequestDto {
  const inputs = state.inputsByInput[inputId];
  const v = inputs[FieldKey.WindSpeed] !== undefined 
    ? Number(inputs[FieldKey.WindSpeed]) 
    : Number(inputs[FieldKey.RelativeAirSpeed]);
    
  return {
    tdb: Number(inputs[FieldKey.DryBulbTemperature]),
    rh: Number(inputs[FieldKey.RelativeHumidity]),
    v: isNaN(v) ? 0.1 : v,
    units: "SI" as const,
  };
}

/**
 * Aggregates thermal index requests for all visible inputs to support chart generation.
 */
function toThermalIndicesChartInputsRequest(
  state: any,
  visibleInputIds: InputIdType[],
): ThermalIndicesChartInputsRequestDto {
  return {
    inputs: visibleInputIds.reduce((accumulator, inputId) => {
      accumulator[inputId] = toThermalIndicesRequest(state, inputId);
      return accumulator;
    }, {} as ThermalIndicesChartInputsRequestDto["inputs"]),
  };
}

// ── Heat Index Model ─────────────────────────────────────────────────────────

const heatIndexBuilder = new ComfortModelBuilder<ThermalIndicesResponseDto, ThermalIndicesChartSourceDto>(ComfortModel.HeatIndex);

heatIndexBuilder.addControl({
  id: InputControlId.Temperature,
  behavior: createControlBehavior({
    controlId: InputControlId.Temperature,
    fieldKey: FieldKey.DryBulbTemperature,
  }),
});

heatIndexBuilder.addControl({
  id: InputControlId.Humidity,
  behavior: createControlBehavior({
    controlId: InputControlId.Humidity,
    fieldKey: FieldKey.RelativeHumidity,
  }),
});

heatIndexBuilder.setCalculator((state, visibleInputIds) => {
  const resultsByInput = createEmptyResults<ThermalIndicesResponseDto>();
  visibleInputIds.forEach((inputId) => {
    resultsByInput[inputId] = calculateThermalIndices(toThermalIndicesRequest(state, inputId));
  });
  return {
    resultsByInput,
    chartSource: { 
      chartRequest: toThermalIndicesChartInputsRequest(state, visibleInputIds),
      dynamicXAxis: state.ui.dynamicXAxis,
      dynamicYAxis: state.ui.dynamicYAxis
    },
  };
});

heatIndexBuilder.setResultBuilder((results, visibleInputIds, unitSystem) => {
  const temperatureUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
  return [
    buildResultSection("Heat Index", results, visibleInputIds, (result) => {
      const displayValue = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.hi, unitSystem);
      const formattedValue = formatDisplayValue(displayValue, fieldMetaByKey[FieldKey.DryBulbTemperature].decimals);

      let tone: any = "default";
      if (result.category === "Extreme Danger") tone = "hiExtremeDanger";
      else if (result.category === "Danger") tone = "hiDanger";
      else if (result.category === "Extreme Caution") tone = "hiExtremeCaution";
      else if (result.category === "Caution") tone = "hiCaution";

      return {
        text: `${formattedValue} ${temperatureUnits}`,
        subtext: result.category,
        tone,
      };
    }),
  ];
});

heatIndexBuilder.setChartBuilder((chartId, chartSource, resultsByInput, unitSystem) => {
  if (!chartSource) return null;
  if (chartId === ChartId.HeatIndexDynamic) {
    return buildThermalIndicesDynamicChart(
      ComfortModel.HeatIndex,
      chartSource.chartRequest,
      resultsByInput,
      unitSystem,
      chartSource.dynamicXAxis,
      chartSource.dynamicYAxis
    );
  }
  return buildHeatIndexRangesChart(chartSource.chartRequest, resultsByInput, unitSystem);
});

heatIndexBuilder.setDefaultChart(ChartId.HeatIndexRanges, [ChartId.HeatIndexRanges, ChartId.HeatIndexDynamic]);
heatIndexBuilder.setDynamicAxisFields([FieldKey.DryBulbTemperature, FieldKey.RelativeHumidity]);
heatIndexBuilder.setDefaultOptions({});
heatIndexBuilder.setOptionNormalizer(normalizeOptions);

export const heatIndexModelConfig = heatIndexBuilder.build();

// ── Humidex Model ───────────────────────────────────────────────────────────

const humidexBuilder = new ComfortModelBuilder<ThermalIndicesResponseDto, ThermalIndicesChartSourceDto>(ComfortModel.Humidex);

humidexBuilder.addControl({
  id: InputControlId.Temperature,
  behavior: createControlBehavior({
    controlId: InputControlId.Temperature,
    fieldKey: FieldKey.DryBulbTemperature,
  }),
});

humidexBuilder.addControl({
  id: InputControlId.Humidity,
  behavior: createControlBehavior({
    controlId: InputControlId.Humidity,
    fieldKey: FieldKey.RelativeHumidity,
  }),
});

humidexBuilder.setCalculator((state, visibleInputIds) => {
  const resultsByInput = createEmptyResults<ThermalIndicesResponseDto>();
  visibleInputIds.forEach((inputId) => {
    resultsByInput[inputId] = calculateThermalIndices(toThermalIndicesRequest(state, inputId));
  });
  return {
    resultsByInput,
    chartSource: { 
      chartRequest: toThermalIndicesChartInputsRequest(state, visibleInputIds),
      dynamicXAxis: state.ui.dynamicXAxis,
      dynamicYAxis: state.ui.dynamicYAxis
    },
  };
});

humidexBuilder.setResultBuilder((results, visibleInputIds) => {
  return [
    buildResultSection("Humidex", results, visibleInputIds, (result) => {
      if (!result.humidex) return null;
      const formattedValue = formatDisplayValue(result.humidex, 1);

      let tone: any = "default";
      const h = result.humidex;
      if (h >= HUMIDEX_STROKE_PROBABLE) tone = "hiExtremeDanger";
      else if (h >= HUMIDEX_DANGEROUS) tone = "hiDanger";
      else if (h >= HUMIDEX_INTENSE) tone = "hiExtremeCaution";
      else if (h >= HUMIDEX_EVIDENT) tone = "hiCaution";
      else if (h >= HUMIDEX_NOTICEABLE) tone = "hiNoticeable";

      return {
        text: `${formattedValue}`,
        subtext: result.humidexDiscomfort,
        tone,
      };
    }),
  ];
});

humidexBuilder.setChartBuilder((chartId, chartSource, resultsByInput, unitSystem) => {
  if (!chartSource) return null;
  if (chartId === ChartId.HumidexDynamic) {
    return buildThermalIndicesDynamicChart(
      ComfortModel.Humidex,
      chartSource.chartRequest,
      resultsByInput,
      unitSystem,
      chartSource.dynamicXAxis,
      chartSource.dynamicYAxis
    );
  }
  return buildHumidexChart(chartSource.chartRequest, resultsByInput, unitSystem);
});

humidexBuilder.setDefaultChart(ChartId.Humidex, [ChartId.Humidex, ChartId.HumidexDynamic]);
humidexBuilder.setDynamicAxisFields([FieldKey.DryBulbTemperature, FieldKey.RelativeHumidity]);
humidexBuilder.setDefaultOptions({});
humidexBuilder.setOptionNormalizer(normalizeOptions);

export const humidexModelConfig = humidexBuilder.build();

// ── Wind Chill Model ─────────────────────────────────────────────────────────

const windChillBuilder = new ComfortModelBuilder<ThermalIndicesResponseDto, ThermalIndicesChartSourceDto>(ComfortModel.WindChill);

windChillBuilder.addControl({
  id: InputControlId.Temperature,
  behavior: createControlBehavior({
    controlId: InputControlId.Temperature,
    fieldKey: FieldKey.DryBulbTemperature,
    getPresentation: (context, meta) => {
      const presentation = buildDefaultPresentation(context, meta);
      const minSi = -45;
      const maxSi = 0;
      presentation.minValue = convertFieldValueFromSi(FieldKey.DryBulbTemperature, minSi, context.unitSystem);
      presentation.maxValue = convertFieldValueFromSi(FieldKey.DryBulbTemperature, maxSi, context.unitSystem);
      const minFmt = formatDisplayValue(presentation.minValue, presentation.decimals);
      const maxFmt = formatDisplayValue(presentation.maxValue, presentation.decimals);
      presentation.rangeText = `From ${minFmt} to ${maxFmt}`;
      return presentation;
    },
  }),
});

windChillBuilder.addControl({
  id: InputControlId.WindSpeed,
  behavior: createControlBehavior({
    controlId: InputControlId.WindSpeed,
    fieldKey: FieldKey.WindSpeed,
    getPresentation: (context, meta) => {
      const presentation = buildDefaultPresentation(context, meta);
      const minSi = 1;
      const maxSi = 20;
      presentation.minValue = convertFieldValueFromSi(FieldKey.WindSpeed, minSi, context.unitSystem);
      presentation.maxValue = convertFieldValueFromSi(FieldKey.WindSpeed, maxSi, context.unitSystem);
      presentation.step = 1;
      presentation.decimals = 0;
      const minFmt = formatDisplayValue(presentation.minValue, presentation.decimals);
      const maxFmt = formatDisplayValue(presentation.maxValue, presentation.decimals);
      presentation.rangeText = `From ${minFmt} to ${maxFmt}`;
      return presentation;
    },
  }),
});

windChillBuilder.setCalculator((state, visibleInputIds) => {
  const resultsByInput = createEmptyResults<ThermalIndicesResponseDto>();
  visibleInputIds.forEach((inputId) => {
    resultsByInput[inputId] = calculateThermalIndices(toThermalIndicesRequest(state, inputId));
  });
  return {
    resultsByInput,
    chartSource: { 
      chartRequest: toThermalIndicesChartInputsRequest(state, visibleInputIds),
      dynamicXAxis: state.ui.dynamicXAxis,
      dynamicYAxis: state.ui.dynamicYAxis
    },
  };
});

windChillBuilder.setResultBuilder((results, visibleInputIds, unitSystem) => {
  const temperatureUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
  return [
    buildResultSection("Wind Chill Index", results, visibleInputIds, (result) => {
      if (result.wci === undefined) return null;
      const formattedValue = formatDisplayValue(result.wci, 0);

      let tone: any = "default";
      if (result.wciZone === "2 mins to frostbite") tone = "wc2min";
      else if (result.wciZone === "10 mins to frostbite") tone = "wc10min";
      else if (result.wciZone === "30 mins to frostbite") tone = "wc30min";

      return {
        text: `${formattedValue} W/m²`,
        subtext: result.wciZone,
        tone,
      };
    }),
    buildResultSection("Wind Chill Temperature", results, visibleInputIds, (result) => {
      if (result.wciTemp === undefined) return null;
      const displayValue = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.wciTemp, unitSystem);
      const formattedValue = formatDisplayValue(displayValue, 1);

      let tone: any = "default";
      if (result.wciZone === "2 mins to frostbite") tone = "wc2min";
      else if (result.wciZone === "10 mins to frostbite") tone = "wc10min";
      else if (result.wciZone === "30 mins to frostbite") tone = "wc30min";

      return {
        text: `${formattedValue} ${temperatureUnits}`,
        tone,
      };
    }),
  ];
});

windChillBuilder.setChartBuilder((chartId, chartSource, resultsByInput, unitSystem) => {
  if (!chartSource) return null;
  if (chartId === ChartId.WindChillDynamic) {
    return buildThermalIndicesDynamicChart(
      ComfortModel.WindChill,
      chartSource.chartRequest,
      resultsByInput,
      unitSystem,
      chartSource.dynamicXAxis,
      chartSource.dynamicYAxis
    );
  }
  return buildWindChillChart(chartSource.chartRequest, resultsByInput, unitSystem);
});

windChillBuilder.setDefaultChart(ChartId.WindChill, [ChartId.WindChill, ChartId.WindChillDynamic]);
windChillBuilder.setDynamicAxisFields([FieldKey.DryBulbTemperature, FieldKey.WindSpeed]);
windChillBuilder.setDefaultOptions({});
windChillBuilder.setOptionNormalizer(normalizeOptions);

export const windChillModelConfig = windChillBuilder.build();
