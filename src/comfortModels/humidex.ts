import { humidex } from "jsthermalcomfort";
import { CalculationSource } from "../models/calculationMetadata";
import { ChartId } from "../models/chartOptions";
import type { ModelChartSourceDto } from "../models/comfortDtos";
import { ComfortModel } from "../models/comfortModels";
import { FieldKey } from "../models/fieldKeys";
import { fieldMetaByKey } from "../models/inputFieldsMeta";
import { InputControlId } from "../models/inputControls";
import type { InputId as InputIdType } from "../models/inputSlots";
import type { ModelCalculationContext } from "../models/modelCalculation";
import {
  bandsFromThermalZones,
  ChartMode,
  ModelOutputKey,
  type ModelOutput,
} from "../models/modelCapabilities";
import { ThermalZone } from "../models/thermalZone";
import {
  buildGridModelChart,
  type GridModelChartSpec,
} from "../services/comfort/charts/gridModelCharts";
import { createControlBehavior } from "../services/comfort/controls/controlBehaviors";
import { requireThermalZone } from "../services/comfort/helpers";
import {
  convertModelOutputFromSi,
  formatDisplayValue,
  getModelOutputDisplayMeta,
} from "../services/units";
import {
  buildResultSection,
  ComfortModelBuilder,
  createEmptyResults,
  parseEmptyOptions,
} from "../state/comfortTool/modelConfigs/builder";

const MODEL_LABEL = "Humidex";
const MODEL_DESCRIPTION =
  "Canadian index used to describe how hot the weather feels to the average person, by combining the effects of heat and humidity.";
const TDB_LIMITS = { min: 20, max: 50 };

export const humidexZonesList = [
  new ThermalZone({ label: "Little/None", max: 30, color: "#e2e8f0", textColor: "#475569" }),
  new ThermalZone({ label: "Noticeable", min: 30, max: 35, color: "#fef08a", textColor: "#854d0e" }),
  new ThermalZone({ label: "Evident", min: 35, max: 40, color: "#fde047", textColor: "#a16207" }),
  new ThermalZone({ label: "Intense", min: 40, max: 45, color: "#facc15", textColor: "#a16207" }),
  new ThermalZone({ label: "Dangerous", min: 45, max: 54, color: "#f97316", textColor: "#ea580c" }),
  new ThermalZone({ label: "Stroke Probable", min: 54, color: "#dc2626", textColor: "#b91c1c" }),
];

export interface HumidexRequestDto {
  tdb: number;
  rh: number;
}

export interface HumidexResponseDto {
  humidex: number;
  humidexDiscomfort: string;
  source: CalculationSource;
}

export function calculateHumidex(payload: HumidexRequestDto): HumidexResponseDto {
  const value = humidex(payload.tdb, payload.rh, { round: true }).humidex;
  const humidexDiscomfort = requireThermalZone(
    humidexZonesList,
    value,
    MODEL_LABEL,
  ).label;

  return {
    humidex: value,
    humidexDiscomfort,
    source: CalculationSource.JsThermalComfort,
  };
}

function getAxisValue(payload: HumidexRequestDto, field: FieldKey): number {
  if (field === FieldKey.DryBulbTemperature) return payload.tdb;
  if (field === FieldKey.RelativeHumidity) return payload.rh;
  throw new Error(`Unsupported Humidex chart field: ${field}`);
}

function setAxisValue(
  payload: HumidexRequestDto,
  field: FieldKey,
  valueSi: number,
): void {
  if (field === FieldKey.DryBulbTemperature) {
    payload.tdb = valueSi;
    return;
  }
  if (field === FieldKey.RelativeHumidity) {
    payload.rh = valueSi;
    return;
  }
  throw new Error(`Unsupported Humidex chart field: ${field}`);
}

function toRequest(
  context: ModelCalculationContext,
  inputId: InputIdType,
): HumidexRequestDto {
  const inputs = context.inputsByInput[inputId];
  return {
    tdb: Number(inputs[FieldKey.DryBulbTemperature]),
    rh: Number(inputs[FieldKey.RelativeHumidity]),
  };
}

const humidexOutput: ModelOutput = {
  key: ModelOutputKey.Humidex,
  label: MODEL_LABEL,
  defaultBands: bandsFromThermalZones(humidexZonesList),
};

const humidexChartSpec: GridModelChartSpec<HumidexRequestDto, HumidexResponseDto> = {
  dynamicChartId: ChartId.HumidexDynamic,
  dynamicTitle: `${MODEL_LABEL} Dynamic Chart`,
  output: humidexOutput,
  axisRanges: {
    [FieldKey.DryBulbTemperature]: TDB_LIMITS,
  },
  getAxisValue,
  setAxisValue,
  evaluate: calculateHumidex,
  getOutputValue: (result) => result.humidex,
  fixedView: {
    chartId: ChartId.Humidex,
    title: `${MODEL_LABEL} Discomfort`,
    xField: FieldKey.RelativeHumidity,
    yField: FieldKey.DryBulbTemperature,
    xRangeSi: {
      min: fieldMetaByKey[FieldKey.RelativeHumidity].minValue,
      max: fieldMetaByKey[FieldKey.RelativeHumidity].maxValue,
    },
    yRangeSi: TDB_LIMITS,
  },
};

const builder = new ComfortModelBuilder<
  HumidexResponseDto,
  ModelChartSourceDto<HumidexRequestDto>
>(
  ComfortModel.Humidex,
);

builder
  .setLabel(MODEL_LABEL)
  .setDescription(MODEL_DESCRIPTION)
  .setModes([ChartMode.Explore])
  .setChartableOutputs([humidexOutput])
  .setModifiers([]);

builder.addControl({
  id: InputControlId.Temperature,
  behavior: createControlBehavior({
    controlId: InputControlId.Temperature,
    fieldKey: FieldKey.DryBulbTemperature,
    minValue: TDB_LIMITS.min,
    maxValue: TDB_LIMITS.max,
  }),
});
builder.addControl({
  id: InputControlId.Humidity,
  behavior: createControlBehavior({
    controlId: InputControlId.Humidity,
    fieldKey: FieldKey.RelativeHumidity,
  }),
});

builder.setCalculator((context, visibleInputIds) => {
  const resultsByInput = createEmptyResults<HumidexResponseDto>();
  const inputs: ModelChartSourceDto<HumidexRequestDto>["inputs"] = {};

  for (const inputId of visibleInputIds) {
    const request = toRequest(context, inputId);
    resultsByInput[inputId] = calculateHumidex(request);
    inputs[inputId] = request;
  }

  return { resultsByInput, chartSource: { inputs } };
});

builder.setResultBuilder((results, visibleInputIds, unitSystem) => {
  const outputMeta = getModelOutputDisplayMeta(ModelOutputKey.Humidex, unitSystem);
  return [
    buildResultSection(MODEL_LABEL, results, visibleInputIds, (result) => {
      const value = convertModelOutputFromSi(ModelOutputKey.Humidex, result.humidex, unitSystem);
      const color = requireThermalZone(
        humidexZonesList,
        result.humidex,
        MODEL_LABEL,
      ).textColor;
      return {
        text: formatDisplayValue(value, outputMeta.decimals),
        subtext: result.humidexDiscomfort,
        color,
      };
    }),
  ];
});

builder.setChartBuilder((chartId, chartSource, resultsByInput, context) =>
  buildGridModelChart(
    chartId,
    chartSource,
    resultsByInput,
    context,
    humidexChartSpec,
  ));

builder.setDefaultChart(ChartId.HumidexDynamic, [
  ChartId.Humidex,
  ChartId.HumidexDynamic,
]);
builder.setDynamicAxisFields([
  FieldKey.DryBulbTemperature,
  FieldKey.RelativeHumidity,
]);
builder.setDefaultDynamicAxes({
  xAxis: FieldKey.DryBulbTemperature,
  yAxis: FieldKey.RelativeHumidity,
});
builder.setDefaultOptions({});
builder.setOptionParser(parseEmptyOptions);
builder.setZones(humidexZonesList);
builder.setLegendChartIds([ChartId.Humidex, ChartId.HumidexDynamic]);
builder.setLegendTitle(MODEL_LABEL);
builder.setLockYAxisChartIds([ChartId.HumidexDynamic]);

export const humidexModelConfig = builder.build();
