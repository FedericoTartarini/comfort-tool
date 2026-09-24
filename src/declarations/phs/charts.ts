import { phs } from "jsthermalcomfort";
import type { TimeSeriesLineChartEngineSpec } from "../../engines/comfort/charts/kinds/types";
import type { QuantityState } from "../../catalog/quantities";
import { PhysicalQuantityId, type PhysicalQuantityId as PhysicalQuantityIdType } from "../../catalog/quantities";
import type { ModelChartSource } from "../../catalog/chartSource";
import type { PlotlyChartSpec } from "../../engines/plotlyTypes";
import {
  inputOrder,
  type InputId as InputIdType,
} from "../../catalog/inputSlots";
import { type ChartBuildContext, type ModelOutput, type NumericBand, resolveChartModelInputs } from "../../catalog/modelCapabilities";
import { FieldChartProfileKind } from "../../catalog/fieldChartProfile";

import type { LibraryQuantityMapping } from "../../engines/comfort/requestMapping";
import {
  PHS_COMPLIANCE_HORIZON_MINUTES,
  PhsLimitingCriterion,
  type PhsEnvironmentSi,
  type PhsSimulationResult,
} from "../../catalog/phs";
import type { GridModelChartSpec } from "../../engines/comfort/charts/gridModelCharts";
import { buildCompareInputMarkerTraces } from "../../engines/comfort/charts/inputPoints";
import { convertTemperatureFromSi } from "../../engines/units/temperature";
import { UnitSystem } from "../../catalog/units";
import { calculatePhs, personFromModelInputs, phsValuesFromSimulation } from "./calculation";
import {
  buildPhsTemperatureHistoryChart,
  findFirstRectalThresholdCrossingMinute,
} from "./timeSeriesCharts";

const PHS_GRID_POINTS = 31;

export function getPhsOutputValue(
  result: QuantityState,
  outputKey: PhysicalQuantityIdType,
): number | null {
  const value = result[outputKey];
  return typeof value === "number" ? value : null;
}

export function createPhsDynamicGridSpec(
  outputs: readonly ModelOutput[],
  requestAdapter: Pick<
    LibraryQuantityMapping<PhsEnvironmentSi>,
    "getAxisValue" | "setAxisValue"
  >,
  context: ChartBuildContext<NumericBand>,
): Omit<
  GridModelChartSpec<PhsEnvironmentSi, QuantityState>,
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
    bandLabel:
      context.fieldChartConfig.profileKind === FieldChartProfileKind.Compliance
        ? "8-hour assessment"
        : "Band",
    isPlottable: (result) => (
      typeof result?.[PhysicalQuantityId.LimitingExposureTime] === "number"
    ),
    outsideApplicabilityMessage: "Outside ISO 7933:2023 applicability",
    requestAdapter,
    evaluate: (payload) => phsValuesFromSimulation(
      calculatePhs({
        ...payload,
        durationMinutes: PHS_COMPLIANCE_HORIZON_MINUTES,
        person: personFromModelInputs(resolveChartModelInputs(context)),
      }),
    ),
    getOutputValue: (result, outputKey) => (
      getPhsOutputValue(result, outputKey ?? fallbackOutput.key)
    ),
  };
}

export interface PhsChartSource extends ModelChartSource<PhsEnvironmentSi> {
  extrasByInput: Partial<Record<InputIdType, PhsSimulationResult | null>>;
}

export function buildPhsExposureHistoryChartResult(
  chartSource: PhsChartSource | null,
  context: ChartBuildContext<NumericBand>,
): PlotlyChartSpec | null {
  const extrasByInput = chartSource?.extrasByInput ?? {};
  const baselineResult = extrasByInput[context.baselineInputId];
  if (!baselineResult?.valid || !baselineResult.samples) return null;

  const thresholdC =
    context.fieldChartConfig.profileKind === FieldChartProfileKind.Compliance
      ? phs.RECTAL_TEMPERATURE_LIMIT
      : (context.fieldChartConfig.bands.find(({ max }) => Number.isFinite(max))
          ?.max ?? phs.RECTAL_TEMPERATURE_LIMIT);
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
    const result = extrasByInput[inputId];
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
  QuantityState,
  PhsChartSource
> = {
  build: (chartSource, _valuesByInput, context) =>
    buildPhsExposureHistoryChartResult(
      chartSource as PhsChartSource | null,
      context as ChartBuildContext<NumericBand>,
    ),
};
