import { wc, wind_chill_temperature } from "jsthermalcomfort";
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
import {
  buildDefaultPresentation,
  createControlBehavior,
} from "../services/comfort/controls/numericControl";
import { requireThermalZone } from "../services/comfort/helpers";
import {
  calculatePerInput,
  createFieldRequestAdapter,
} from "../services/comfort/requestMapping";
import {
  convertFieldValueFromSi,
  convertMetersPerSecondToKilometersPerHour,
  convertModelOutputFromSi,
  formatDisplayValue,
  getModelOutputDisplayMeta,
} from "../services/units";
import {
  buildResultSection,
  ComfortModelBuilder,
  parseEmptyOptions,
} from "../state/comfortTool/modelConfigs/builder";

const MODEL_LABEL = "Wind Chill";
const MODEL_DESCRIPTION =
  "Index that measures how cold it feels when wind is factored in with the actual air temperature.";
const TDB_LIMITS = { min: -45, max: 0 };
const WIND_LIMITS = { min: 1, max: 20 };

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
        convertMetersPerSecondToKilometersPerHour(payload.v),
      ).wct
    : payload.tdb;
  const wciZone = requireThermalZone(windChillZonesList, wci, MODEL_LABEL).label;

  return {
    wci,
    wciTemp,
    wciZone,
    source: CalculationSource.JsThermalComfort,
  };
}

const requestAdapter = createFieldRequestAdapter<WindChillRequestDto>({
  tdb: FieldKey.DryBulbTemperature,
  v: FieldKey.WindSpeed,
});

const windChillOutput: ModelOutput = {
  key: ModelOutputKey.WindChill,
  label: "Wind Chill Index",
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
  requestAdapter,
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
  .setStandardIds([])
  .setModes([ChartMode.Explore])
  .setChartableOutputs([windChillOutput])
  .setModifiers([])
  .setCharts({
    defaultId: ChartId.WindChillDynamic,
    entries: [{
      id: ChartId.WindChillDynamic,
      name: "Dynamic",
      emptyMessage: "No dynamic chart yet.",
      allowsAxisSelection: true,
      locksYAxis: true,
      showsZoneToggle: false,
      showsLegend: true,
    }],
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

builder.setCalculator((context, visibleInputIds) =>
  calculatePerInput({
    context,
    visibleInputIds,
    mapRequest: requestAdapter.mapRequest,
    calculate: calculateWindChill,
  }));

builder.setResultBuilder((results, visibleInputIds, unitSystem) => {
  const temperatureUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
  const outputMeta = getModelOutputDisplayMeta(ModelOutputKey.WindChill, unitSystem);
  const getColor = (result: WindChillResponseDto) =>
    requireThermalZone(windChillZonesList, result.wci, MODEL_LABEL).textColor;

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

builder.setDynamicAxisFields([FieldKey.DryBulbTemperature, FieldKey.WindSpeed]);
builder.setDefaultDynamicAxes({
  xAxis: FieldKey.DryBulbTemperature,
  yAxis: FieldKey.WindSpeed,
});
builder.setDefaultOptions({});
builder.setOptionParser(parseEmptyOptions);
export const windChillModelConfig = builder.build();
