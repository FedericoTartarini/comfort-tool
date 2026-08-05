import { heat_index } from "jsthermalcomfort";
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
import { UnitSystem } from "../models/units";
import {
  buildGridModelChart,
  type GridModelChartSpec,
} from "../services/comfort/charts/gridModelCharts";
import { createControlBehavior } from "../services/comfort/controls/controlBehaviors";
import { requireThermalZone } from "../services/comfort/helpers";
import {
  calculatePerInput,
  createFieldRequestMapper,
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

const MODEL_LABEL = "Heat Index";
const MODEL_DESCRIPTION =
  "Combines air temperature and relative humidity to determine the human-perceived equivalent temperature.";
const TDB_LIMITS = { min: 20, max: 50 };
const HEAT_INDEX_APPLICABILITY_THRESHOLD_SI = 27;

export const heatIndexZonesList = [
  new ThermalZone({ label: "Safe", max: 27, color: "#e2e8f0", textColor: "#475569" }),
  new ThermalZone({ label: "Caution", min: 27, max: 32, color: "#fef08a", textColor: "#854d0e" }),
  new ThermalZone({ label: "Extreme Caution", min: 32, max: 39, color: "#fde047", textColor: "#a16207" }),
  new ThermalZone({ label: "Danger", min: 39, max: 51, color: "#f97316", textColor: "#ea580c" }),
  new ThermalZone({ label: "Extreme Danger", min: 51, color: "#dc2626", textColor: "#b91c1c" }),
];

export interface HeatIndexRequestDto {
  tdb: number;
  rh: number;
}

export interface HeatIndexResponseDto {
  hi: number;
  category: string;
  source: CalculationSource;
}

export function calculateHeatIndex(payload: HeatIndexRequestDto): HeatIndexResponseDto {
  const result = heat_index(payload.tdb, payload.rh, {
    units: UnitSystem.SI,
    round: true,
  });
  // The library returns NaN below the Rothfusz regression threshold. The ambient
  // dry-bulb temperature is the meaningful apparent temperature in that range.
  const hi = Number.isFinite(result.hi)
    ? result.hi
    : payload.tdb < HEAT_INDEX_APPLICABILITY_THRESHOLD_SI
      ? payload.tdb
      : result.hi;
  const category = requireThermalZone(heatIndexZonesList, hi, MODEL_LABEL).label;

  return { hi, category, source: CalculationSource.JsThermalComfort };
}

function getAxisValue(payload: HeatIndexRequestDto, field: FieldKey): number {
  if (field === FieldKey.DryBulbTemperature) return payload.tdb;
  if (field === FieldKey.RelativeHumidity) return payload.rh;
  throw new Error(`Unsupported Heat Index chart field: ${field}`);
}

function setAxisValue(
  payload: HeatIndexRequestDto,
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
  throw new Error(`Unsupported Heat Index chart field: ${field}`);
}

const toRequest = createFieldRequestMapper<HeatIndexRequestDto>({
  tdb: FieldKey.DryBulbTemperature,
  rh: FieldKey.RelativeHumidity,
});

const heatIndexOutput: ModelOutput = {
  key: ModelOutputKey.HeatIndex,
  label: MODEL_LABEL,
  defaultBands: bandsFromThermalZones(heatIndexZonesList),
};

const heatIndexChartSpec: GridModelChartSpec<
  HeatIndexRequestDto,
  HeatIndexResponseDto
> = {
  dynamicChartId: ChartId.HeatIndexDynamic,
  dynamicTitle: `${MODEL_LABEL} Dynamic Chart`,
  output: heatIndexOutput,
  axisRanges: {
    [FieldKey.DryBulbTemperature]: TDB_LIMITS,
  },
  getAxisValue,
  setAxisValue,
  evaluate: calculateHeatIndex,
  getOutputValue: (result) => result.hi,
  fixedView: {
    chartId: ChartId.HeatIndexRanges,
    title: `${MODEL_LABEL} Ranges`,
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
  HeatIndexResponseDto,
  ModelChartSourceDto<HeatIndexRequestDto>
>(ComfortModel.HeatIndex);

builder
  .setLabel(MODEL_LABEL)
  .setDescription(MODEL_DESCRIPTION)
  .setModes([ChartMode.Explore])
  .setChartableOutputs([heatIndexOutput])
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

builder.setCalculator((context, visibleInputIds) =>
  calculatePerInput({
    context,
    visibleInputIds,
    mapRequest: toRequest,
    calculate: calculateHeatIndex,
  }));

builder.setResultBuilder((results, visibleInputIds, unitSystem) => {
  const outputMeta = getModelOutputDisplayMeta(ModelOutputKey.HeatIndex, unitSystem);
  return [
    buildResultSection(MODEL_LABEL, results, visibleInputIds, (result) => {
      const value = convertModelOutputFromSi(ModelOutputKey.HeatIndex, result.hi, unitSystem);
      const color = requireThermalZone(
        heatIndexZonesList,
        result.hi,
        MODEL_LABEL,
      ).textColor;
      return {
        text: `${formatDisplayValue(value, outputMeta.decimals)} ${outputMeta.displayUnits}`,
        subtext: result.category,
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
    heatIndexChartSpec,
  ));

builder.setDefaultChart(ChartId.HeatIndexDynamic, [
  ChartId.HeatIndexRanges,
  ChartId.HeatIndexDynamic,
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
builder.setZones(heatIndexZonesList);
builder.setLegendChartIds([
  ChartId.HeatIndexRanges,
  ChartId.HeatIndexDynamic,
]);
builder.setLegendTitle(MODEL_LABEL);
builder.setLockYAxisChartIds([ChartId.HeatIndexDynamic]);

export const heatIndexModelConfig = builder.build();
