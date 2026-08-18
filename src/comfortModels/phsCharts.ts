import { CalculationSource } from "../models/calculationMetadata";
import { ChartId, type ChartId as ChartIdType } from "../models/chartOptions";
import type {
  ModelChartSourceDto,
  PlotHoverValueDto,
  PlotlyChartResponseDto,
} from "../models/comfortDtos";
import { FieldKey, type FieldKey as FieldKeyType } from "../models/fieldKeys";
import type { InputId as InputIdType } from "../models/inputSlots";
import {
  ChartMode,
  ModelOutputKey,
  type ChartBuildContext,
  type ModelOutput,
  type ModelOutputKey as ModelOutputKeyType,
  type NumericBand,
  type NumericFieldChartConfig,
} from "../models/modelCapabilities";
import type { FieldRequestAdapter } from "../services/comfort/requestMapping";
import {
  PHS_COMPLIANCE_HORIZON_MINUTES,
  PHS_RECTAL_TEMPERATURE_LIMIT_C,
  PhsLimitingCriterion,
  phsReferencePerson,
  type PhsEnvironmentSi,
  type PhsResponseDto,
} from "../models/phs";
import {
  convertModelOutputFromSi,
  getModelOutputDisplayMeta,
} from "../services/units";
import {
  buildFieldChart,
  createBandedGridStrategy,
  type FieldChartInputGroup,
} from "../services/comfort/charts/chartEngine";
import type { ChartRange } from "../services/comfort/charts/types";
import { getBaselineInputEntry } from "../services/comfort/helpers";
import { calculatePhs } from "./phsCalculation";
import {
  buildPhsTemperatureHistoryChart,
  findFirstRectalThresholdCrossingMinute,
} from "./phsTimeSeriesCharts";

const GRID_POINTS = 31;

const PHS_AXIS_RANGES: Record<FieldKeyType, ChartRange> = {
  [FieldKey.DryBulbTemperature]: { min: 15, max: 50 },
  [FieldKey.MeanRadiantTemperature]: { min: 0, max: 60 },
  [FieldKey.RelativeAirSpeed]: { min: 0, max: 2 },
  [FieldKey.WindSpeed]: { min: 0, max: 3 },
  [FieldKey.RelativeHumidity]: { min: 0, max: 100 },
  [FieldKey.HumidityRatio]: { min: 0, max: 25 },
  [FieldKey.MetabolicRate]: { min: 0.9, max: 3.9 },
  [FieldKey.ClothingInsulation]: { min: 0.1, max: 1 },
  [FieldKey.ExternalWork]: { min: 0, max: 0 },
  [FieldKey.PrevailingMeanOutdoorTemperature]: { min: 10, max: 33.5 },
  [FieldKey.OperativeTemperature]: { min: 10, max: 40 },
};

export function getPhsOutputValue(
  result: PhsResponseDto,
  outputKey: ModelOutputKeyType,
): number {
  switch (outputKey) {
    case ModelOutputKey.PhsLimitingExposureTime:
      return result.limitingExposureTimeMinutes;
    case ModelOutputKey.PhsRectalTemperature:
      return result.tRe;
    case ModelOutputKey.PhsWaterLoss:
      return result.sweatLossG;
    default:
      throw new Error(`Unsupported PHS output: ${outputKey}`);
  }
}

interface BuildPhsChartOptions {
  chartId: ChartIdType;
  chartSource: ModelChartSourceDto<PhsEnvironmentSi> | null;
  resultsByInput: Partial<Record<InputIdType, PhsResponseDto | null>>;
  context: ChartBuildContext<NumericBand>;
  outputs: readonly ModelOutput[];
  requestAdapter: Pick<
    FieldRequestAdapter<PhsEnvironmentSi>,
    "getAxisValue" | "setAxisValue"
  >;
}

export function buildPhsChart({
  chartId,
  chartSource,
  resultsByInput,
  context,
  outputs,
  requestAdapter,
}: BuildPhsChartOptions): PlotlyChartResponseDto | null {
  if (chartId === ChartId.PhsExposureHistory) {
    const baselineResult = resultsByInput[context.baselineInputId];
    if (!baselineResult?.valid || !baselineResult.samples) return null;

    const thresholdC = context.fieldChartConfig.mode === ChartMode.Compliance
      ? PHS_RECTAL_TEMPERATURE_LIMIT_C
      : context.fieldChartConfig.bands.find(({ max }) => Number.isFinite(max))?.max
        ?? PHS_RECTAL_TEMPERATURE_LIMIT_C;
    const markerMinute = context.fieldChartConfig.mode === ChartMode.Compliance
      ? baselineResult.limitingMinute
      : findFirstRectalThresholdCrossingMinute(
          baselineResult.samples,
          thresholdC,
        );
    const markerLabel = context.fieldChartConfig.mode === ChartMode.Compliance
      ? baselineResult.limitingCriterion === PhsLimitingCriterion.WaterLoss
        ? "First water-loss limit"
        : "First rectal-temperature limit"
      : "First editable-threshold crossing";

    return buildPhsTemperatureHistoryChart(baselineResult, context.unitSystem, {
      title: "PHS exposure history",
      thresholdC,
      thresholdLabel: context.fieldChartConfig.mode === ChartMode.Compliance
        ? "Maximum rectal temperature"
        : "Editable rectal-temperature threshold",
      markerMinute,
      markerLabel,
    });
  }

  if (chartId !== ChartId.PhsDynamic || !chartSource) return null;

  const config: NumericFieldChartConfig = context.fieldChartConfig;
  const output = outputs.find(({ key }) => key === config.zOutput);
  if (!output) {
    throw new Error(`Missing PHS chart output ${config.zOutput}.`);
  }
  const baselinePayload = getBaselineInputEntry(
    chartSource.inputs,
    context.baselineInputId,
  ).payload;
  const outputMeta = getModelOutputDisplayMeta(output.key, context.unitSystem);
  const outputUnits = outputMeta.displayUnits ? ` ${outputMeta.displayUnits}` : "";
  const resultValue = (result: PhsResponseDto | null | undefined) => (
    result?.valid ? getPhsOutputValue(result, output.key) : undefined
  );

  return buildFieldChart({
    unitSystem: context.unitSystem,
    xAxis: {
      field: config.xField,
      rangeSi: PHS_AXIS_RANGES[config.xField],
      points: GRID_POINTS,
    },
    yAxis: {
      field: config.yField,
      rangeSi: PHS_AXIS_RANGES[config.yField],
      points: GRID_POINTS,
    },
    strategy: createBandedGridStrategy({
      config,
      output,
      bandLabel: context.fieldChartConfig.mode === ChartMode.Compliance
        ? "8-hour assessment"
        : "Band",
      evaluateOutput: (xSi, ySi) => {
        const payload = { ...baselinePayload };
        requestAdapter.setAxisValue(payload, config.xField, xSi);
        requestAdapter.setAxisValue(payload, config.yField, ySi);
        const result = calculatePhs({
          ...payload,
          durationMinutes: PHS_COMPLIANCE_HORIZON_MINUTES,
          person: phsReferencePerson,
        });
        return result.valid ? getPhsOutputValue(result, output.key) : null;
      },
    }),
    inputGroups: ({ xAxis, yAxis }) => [{
      inputsMap: chartSource.inputs,
      resultsByInput,
      getXSi: (payload) => requestAdapter.getAxisValue(payload, config.xField),
      getYSi: (payload) => requestAdapter.getAxisValue(payload, config.yField),
      getHovertemplate: ({ inputLabel, result }) => (
        result?.valid
          ? `${inputLabel}<br>${xAxis.label}: %{x:.${xAxis.decimals ?? 2}f} ${xAxis.units}<br>${yAxis.label}: %{y:.${yAxis.decimals ?? 2}f} ${yAxis.units}<br>${output.label}: %{customdata[0]:.${outputMeta.decimals}f}${outputUnits}<extra></extra>`
          : `${inputLabel}<br><b>Outside ISO 7933:2023 applicability</b><extra></extra>`
      ),
      hoverMetadata: ({ result }) => {
        const value = resultValue(result);
        return [
          value === undefined
            ? ""
            : convertModelOutputFromSi(output.key, value, context.unitSystem),
        ] satisfies readonly PlotHoverValueDto[];
      },
    } satisfies FieldChartInputGroup<PhsEnvironmentSi, PhsResponseDto>],
    layout: {
      title: `PHS Dynamic Chart — ${output.label}`,
      paperBgColor: "rgba(0,0,0,0)",
      plotBgColor: "rgba(0,0,0,0)",
      margin: { l: 60, r: 24, t: 60, b: 60 },
    },
    source: CalculationSource.JsThermalComfort,
  });
}
