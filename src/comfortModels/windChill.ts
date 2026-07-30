import { wc, wind_chill_temperature } from "jsthermalcomfort";
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
import {
  buildDefaultPresentation,
  createControlBehavior,
  createTemperatureControlBehavior,
} from "../services/comfort/controls/controlBehaviors";
import {
  convertFieldValueFromSi,
  convertModelOutputFromSi,
  formatDisplayValue,
  getModelOutputDisplayMeta,
} from "../services/units";
import {
  buildResultSection,
  ComfortModelBuilder,
  createEmptyResults,
  isRecord,
} from "../state/comfortTool/modelConfigs/builder";

const MODEL_LABEL = "Wind Chill";
const MODEL_DESCRIPTION =
  "Index that measures how cold it feels when wind is factored in with the actual air temperature.";
const TDB_LIMITS = { min: -45, max: 0 };
const WIND_LIMITS = { min: 1, max: 20 };
const METRES_PER_SECOND_TO_KILOMETRES_PER_HOUR = 3.6;

export const windChillZonesList = [
  new ThermalZone({ label: "Safe", max: 1400, color: "#e0f2fe", textColor: "#0369a1" }),
  new ThermalZone({ label: "30 mins to frostbite", min: 1400, max: 1600, color: "#64b5f5", textColor: "#1d4ed8" }),
  new ThermalZone({ label: "10 mins to frostbite", min: 1600, max: 2300, color: "#5c6bc0", textColor: "#3730a3" }),
  new ThermalZone({ label: "2 mins to frostbite", min: 2300, color: "#8e24aa", textColor: "#6b21a8" }),
];

export interface WindChillRequestDto {
  tdb: number;
  v: number;
}

export interface WindChillResponseDto {
  wci: number;
  wciTemp: number;
  wciZone: string;
  source: CalculationSource;
}

export function calculateWindChill(payload: WindChillRequestDto): WindChillResponseDto {
  const wci = wc(payload.tdb, payload.v).wci;
  const wciTemp = payload.v > 1.33 && payload.tdb <= 10
    ? wind_chill_temperature(
        payload.tdb,
        payload.v * METRES_PER_SECOND_TO_KILOMETRES_PER_HOUR,
      ).wct
    : payload.tdb;
  const wciZone = windChillZonesList.find((zone) => zone.contains(wci))?.label
    ?? windChillZonesList[0].label;

  return {
    wci,
    wciTemp,
    wciZone,
    source: CalculationSource.JsThermalComfort,
  };
}

function getAxisValue(payload: WindChillRequestDto, field: FieldKey): number {
  if (field === FieldKey.DryBulbTemperature) return payload.tdb;
  if (field === FieldKey.WindSpeed) return payload.v;
  throw new Error(`Unsupported Wind Chill chart field: ${field}`);
}

function setAxisValue(
  payload: WindChillRequestDto,
  field: FieldKey,
  valueSi: number,
): void {
  if (field === FieldKey.DryBulbTemperature) {
    payload.tdb = valueSi;
    return;
  }
  if (field === FieldKey.WindSpeed) {
    payload.v = valueSi;
    return;
  }
  throw new Error(`Unsupported Wind Chill chart field: ${field}`);
}

function toRequest(
  context: ModelCalculationContext,
  inputId: InputIdType,
): WindChillRequestDto {
  const inputs = context.inputsByInput[inputId];
  const windSpeed = Number(inputs[FieldKey.WindSpeed]);
  return {
    tdb: Number(inputs[FieldKey.DryBulbTemperature]),
    v: Number.isNaN(windSpeed) ? WIND_LIMITS.min : windSpeed,
  };
}

const windChillOutput: ModelOutput = {
  key: ModelOutputKey.WindChill,
  label: "Wind Chill Index",
  unit: "W/m²",
  defaultBands: bandsFromThermalZones(windChillZonesList),
};

const windChillChartSpec: GridModelChartSpec<
  WindChillRequestDto,
  WindChillResponseDto
> = {
  dynamicChartId: ChartId.WindChillDynamic,
  dynamicTitle: `${MODEL_LABEL} Dynamic Chart`,
  output: windChillOutput,
  bandLabel: "Frostbite Risk",
  dynamicHoverExtension: {
    getTemplateSuffix: (unitSystem) => {
      const units = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
      return `<br>${MODEL_LABEL} Temperature: %{customdata[1]:.1f} ${units}`;
    },
    getMetadata: (result, unitSystem) => [
      result == null
        ? ""
        : convertFieldValueFromSi(
            FieldKey.DryBulbTemperature,
            result.wciTemp,
            unitSystem,
          ),
    ],
  },
  axisRanges: {
    [FieldKey.DryBulbTemperature]: TDB_LIMITS,
    [FieldKey.WindSpeed]: WIND_LIMITS,
  },
  getAxisValue,
  setAxisValue,
  evaluate: calculateWindChill,
  getOutputValue: (result) => result.wci,
};

const builder = new ComfortModelBuilder<
  WindChillResponseDto,
  ModelChartSourceDto<WindChillRequestDto>
>(
  ComfortModel.WindChill,
);

builder
  .setLabel(MODEL_LABEL)
  .setDescription(MODEL_DESCRIPTION)
  .setModes([ChartMode.Explore])
  .setChartableOutputs([windChillOutput]);

builder.addControl({
  id: InputControlId.Temperature,
  behavior: createTemperatureControlBehavior(InputControlId.Temperature, {
    minValue: TDB_LIMITS.min,
    maxValue: TDB_LIMITS.max,
  }),
});
builder.addControl({
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

builder.setCalculator((context, visibleInputIds) => {
  const resultsByInput = createEmptyResults<WindChillResponseDto>();
  const inputs: ModelChartSourceDto<WindChillRequestDto>["inputs"] = {};

  for (const inputId of visibleInputIds) {
    const request = toRequest(context, inputId);
    resultsByInput[inputId] = calculateWindChill(request);
    inputs[inputId] = request;
  }

  return { resultsByInput, chartSource: { inputs } };
});

builder.setResultBuilder((results, visibleInputIds, unitSystem) => {
  const temperatureUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
  const outputMeta = getModelOutputDisplayMeta(ModelOutputKey.WindChill, unitSystem);
  const getColor = (result: WindChillResponseDto) =>
    windChillZonesList.find((zone) => zone.contains(result.wci))?.textColor;

  return [
    buildResultSection(`${MODEL_LABEL} Index`, results, visibleInputIds, (result) => {
      const value = convertModelOutputFromSi(ModelOutputKey.WindChill, result.wci, unitSystem);
      return {
        text: `${formatDisplayValue(value, outputMeta.decimals)} ${outputMeta.displayUnits}`,
        subtext: result.wciZone,
        color: getColor(result),
      };
    }),
    buildResultSection(`${MODEL_LABEL} Temperature`, results, visibleInputIds, (result) => {
      const value = convertFieldValueFromSi(
        FieldKey.DryBulbTemperature,
        result.wciTemp,
        unitSystem,
      );
      return {
        text: `${formatDisplayValue(value, 1)} ${temperatureUnits}`,
        color: getColor(result),
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
    windChillChartSpec,
  ));

builder.setDefaultChart(ChartId.WindChillDynamic, [ChartId.WindChillDynamic]);
builder.setDynamicAxisFields([FieldKey.DryBulbTemperature, FieldKey.WindSpeed]);
builder.setDefaultDynamicAxes({
  xAxis: FieldKey.DryBulbTemperature,
  yAxis: FieldKey.WindSpeed,
});
builder.setDefaultOptions({});
builder.setOptionNormalizer((value) => isRecord(value) ? value : {});
builder.setZones(windChillZonesList);
builder.setLegendChartIds([ChartId.WindChillDynamic]);
builder.setLegendTitle(MODEL_LABEL);
builder.setLockYAxisChartIds([ChartId.WindChillDynamic]);

export const windChillModelConfig = builder.build();
