import type { TimeSeriesLineChartEngineSpec } from "../../services/comfort/charts/kinds/types";
import type { ModelChartSource } from "../../models/chartSource";
import type { PlotlyChartSpec } from "../../services/plotlyTypes";
import {
  PhysicalQuantityId,
  type ChartAxisQuantityId,
} from "../../models/quantities";
import {
  inputOrder,
  type InputId as InputIdType,
} from "../../models/inputSlots";
import {
  ModelOutputKey,
  type ChartBuildContext,
  type ModelOutput,
  type ModelOutputKey as ModelOutputKeyType,
  type NumericBand,
  resolveChartModelInputs,
} from "../../models/modelCapabilities";
import { FieldChartProfileKind } from "../../models/output/fieldChartProfile";

import type { FieldRequestAdapter } from "../../services/comfort/requestMapping";
import {
  PHS_COMPLIANCE_HORIZON_MINUTES,
  PHS_RECTAL_TEMPERATURE_LIMIT_C,
  PhsLimitingCriterion,
  type PhsEnvironmentSi,
  type PhsResponse,
} from "../../models/phs";
import type { GridModelChartSpec } from "../../services/comfort/charts/gridModelCharts";
import type { ChartRange } from "../../services/comfort/charts/types";
import { buildCompareInputMarkerTraces } from "../../services/comfort/charts/inputPoints";
import { convertTemperatureFromSi } from "../../services/units/temperature";
import { UnitSystem } from "../../models/units";
import { calculatePhs, personFromModelInputs } from "./calculation";
import {
  buildPhsTemperatureHistoryChart,
  findFirstRectalThresholdCrossingMinute,
} from "./timeSeriesCharts";

const PHS_GRID_POINTS = 31;

export const PHS_AXIS_RANGES: Record<ChartAxisQuantityId, ChartRange> = {
  [PhysicalQuantityId.DryBulbTemperature]: { min: 15, max: 50 },
  [PhysicalQuantityId.MeanRadiantTemperature]: { min: 0, max: 60 },
  [PhysicalQuantityId.RelativeAirSpeed]: { min: 0, max: 2 },
  [PhysicalQuantityId.WindSpeed]: { min: 0, max: 3 },
  [PhysicalQuantityId.RelativeHumidity]: { min: 0, max: 100 },
  [PhysicalQuantityId.HumidityRatio]: { min: 0, max: 0.025 },
  [PhysicalQuantityId.MetabolicRate]: { min: 0.9, max: 3.9 },
  [PhysicalQuantityId.ClothingInsulation]: { min: 0.1, max: 1 },
  [PhysicalQuantityId.ExternalWork]: { min: 0, max: 0 },
  [PhysicalQuantityId.PrevailingMeanOutdoorTemperature]: { min: 10, max: 33.5 },
  [PhysicalQuantityId.OperativeTemperature]: { min: 10, max: 40 },
};

export function getPhsOutputValue(
  result: PhsResponse,
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

export function createPhsDynamicGridSpec(
  outputs: readonly ModelOutput[],
  requestAdapter: Pick<
    FieldRequestAdapter<PhsEnvironmentSi>,
    "getAxisValue" | "setAxisValue"
  >,
  context: ChartBuildContext<NumericBand>,
): Omit<
  GridModelChartSpec<PhsEnvironmentSi, PhsResponse>,
  "instanceId" | "dynamicTitle"
> {
  const fallbackOutput = outputs[0];
  if (!fallbackOutput) {
    throw new Error("PHS chart outputs are required.");
  }

  return {
    output: fallbackOutput,
    exploreOutputs: outputs,
    gridPoints: PHS_GRID_POINTS,
    axisRanges: PHS_AXIS_RANGES,
    bandLabel:
      context.fieldChartConfig.profileKind === FieldChartProfileKind.Compliance
        ? "8-hour assessment"
        : "Band",
    isPlottable: (result) => result?.valid ?? false,
    outsideApplicabilityMessage: "Outside ISO 7933:2023 applicability",
    requestAdapter,
    evaluate: (payload) =>
      calculatePhs({
        ...payload,
        durationMinutes: PHS_COMPLIANCE_HORIZON_MINUTES,
        person: personFromModelInputs(resolveChartModelInputs(context)),
      }),
    getOutputValue: (result, outputKey) =>
      result.valid ? getPhsOutputValue(result, outputKey) : null,
  };
}

export function buildPhsExposureHistoryChartResult(
  resultsByInput: Partial<Record<InputIdType, PhsResponse | null>>,
  context: ChartBuildContext<NumericBand>,
): PlotlyChartSpec | null {
  const baselineResult = resultsByInput[context.baselineInputId];
  if (!baselineResult?.valid || !baselineResult.samples) return null;

  const thresholdC =
    context.fieldChartConfig.profileKind === FieldChartProfileKind.Compliance
      ? PHS_RECTAL_TEMPERATURE_LIMIT_C
      : (context.fieldChartConfig.bands.find(({ max }) => Number.isFinite(max))
          ?.max ?? PHS_RECTAL_TEMPERATURE_LIMIT_C);
  const markerMinute =
    context.fieldChartConfig.profileKind === FieldChartProfileKind.Compliance
      ? baselineResult.limitingMinute
      : findFirstRectalThresholdCrossingMinute(
          baselineResult.samples,
          thresholdC,
        );
  const markerLabel =
    context.fieldChartConfig.profileKind === FieldChartProfileKind.Compliance
      ? baselineResult.limitingCriterion === PhsLimitingCriterion.WaterLoss
        ? "First water-loss limit"
        : "First rectal-temperature limit"
      : "First editable-threshold crossing";

  const chart = buildPhsTemperatureHistoryChart(
    baselineResult,
    context.unitSystem,
    {
      title: "PHS exposure history",
      thresholdC,
      thresholdLabel:
        context.fieldChartConfig.profileKind ===
        FieldChartProfileKind.Compliance
          ? "Maximum rectal temperature"
          : "Editable rectal-temperature threshold",
      markerMinute,
      markerLabel,
    },
  );
  const comparePointsByInput: Partial<
    Record<InputIdType, { x: number; y: number }>
  > = {};
  for (const inputId of inputOrder) {
    const result = resultsByInput[inputId];
    const samples = result?.samples;
    const sample = samples?.[samples.length - 1];
    if (
      result == null ||
      sample === undefined ||
      !Number.isFinite(sample.hours) ||
      !Number.isFinite(sample.tRe)
    ) {
      continue;
    }
    comparePointsByInput[inputId] = {
      x: sample.hours,
      y:
        context.unitSystem === UnitSystem.IP
          ? convertTemperatureFromSi(sample.tRe)
          : sample.tRe,
    };
  }
  return {
    ...chart,
    traces: [
      ...chart.traces,
      ...buildCompareInputMarkerTraces(comparePointsByInput),
    ],
  };
}

export const phsExposureHistoryChartSpec: TimeSeriesLineChartEngineSpec<
  PhsResponse,
  ModelChartSource<PhsEnvironmentSi>
> = {
  build: (_chartSource, resultsByInput, context) =>
    buildPhsExposureHistoryChartResult(
      resultsByInput,
      context as ChartBuildContext<NumericBand>,
    ),
};
