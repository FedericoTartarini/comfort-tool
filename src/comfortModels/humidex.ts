import { humidex } from "jsthermalcomfort";
import { CalculationSource } from "../models/calculationMetadata";
import { ChartId } from "../models/chartOptions";
import type { ModelChartSourceDto } from "../models/comfortDtos";
import { ComfortModel } from "../models/comfortModels";
import { FieldKey } from "../models/fieldKeys";
import { fieldMetaByKey } from "../models/inputFieldsMeta";
import { InputControlId } from "../models/inputControls";
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
import { createControlBehavior } from "../services/comfort/controls/numericControl";
import { requireThermalZone } from "../services/comfort/helpers";
import {
  calculatePerInput,
  createFieldRequestAdapter,
} from "../services/comfort/requestMapping";
import {
  convertModelOutputFromSi,
  formatDisplayValue,
  getModelOutputDisplayMeta,
} from "../services/units";
import {
  buildResultSection,
  ComfortModelBuilder,
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

const requestAdapter = createFieldRequestAdapter<HumidexRequestDto>({
  tdb: FieldKey.DryBulbTemperature,
  rh: FieldKey.RelativeHumidity,
});

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
  requestAdapter,
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
  .setModifiers([])
  .setCharts({
    defaultId: ChartId.HumidexDynamic,
    entries: [
      {
        id: ChartId.Humidex,
        name: "Psychrometric",
        emptyMessage: "No psychrometric chart yet.",
        allowsAxisSelection: false,
        locksYAxis: false,
        showsZoneToggle: false,
        showsLegend: true,
      },
      {
        id: ChartId.HumidexDynamic,
        name: "Dynamic",
        emptyMessage: "No dynamic chart yet.",
        allowsAxisSelection: true,
        locksYAxis: true,
        showsZoneToggle: false,
        showsLegend: true,
      },
    ],
  });

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

builder.setCalculator((context, visibleInputIds) =>
  calculatePerInput({
    context,
    visibleInputIds,
    mapRequest: requestAdapter.mapRequest,
    calculate: calculateHumidex,
  }));

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
export const humidexModelConfig = builder.build();
