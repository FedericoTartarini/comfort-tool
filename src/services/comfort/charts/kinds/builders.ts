import type { PlotlyChartResponseDto } from "../../../../models/comfortDtos";
import type { ChartBuildResult } from "../../../../models/output/chartBuildResult";
import type { InputId as InputIdType } from "../../../../models/inputSlots";
import type { ChartBuildContext } from "../../../../models/modelCapabilities";
import { buildGridModelChart } from "../gridModelCharts";
import type { ChartKindRegistration } from "./types";

export function buildDynamicFieldChart<
  TResult,
  ChartSourceType,
  TPayload extends object,
>(
  registration: ChartKindRegistration<TResult, ChartSourceType, TPayload>,
  chartSource: ChartSourceType | null,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
): ChartBuildResult {
  if (registration.registration.kind !== "dynamic-field") {
    throw new Error(`Chart ${registration.instanceId} is not a dynamic-field chart.`);
  }
  if (!chartSource) {
    return {
      plotly: null,
      legend: null,
      readiness: "empty",
      emptyMessage: registration.emptyMessage,
    };
  }

  const gridSpec = registration.registration.spec.resolveGridSpec(context);
  const plotly = buildGridModelChart(
    registration.instanceId,
    chartSource as unknown as import("../../../../models/comfortDtos").ModelChartSourceDto<TPayload>,
    resultsByInput,
    context as import("../../../../models/modelCapabilities").ChartBuildContext<import("../../../../models/modelCapabilities").NumericBand>,
    {
      ...gridSpec,
      instanceId: registration.instanceId,
      dynamicTitle: registration.registration.spec.title,
    },
  );

  return wrapPlotlyResult(plotly, registration);
}

export function buildCustomChart<TResult, ChartSourceType>(
  registration: ChartKindRegistration<TResult, ChartSourceType>,
  chartSource: ChartSourceType | null,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
): ChartBuildResult {
  if (registration.registration.kind !== "custom") {
    throw new Error(`Chart ${registration.instanceId} is not a custom chart.`);
  }
  const plotly = registration.registration.spec.build(
    chartSource,
    resultsByInput,
    context,
  );
  return wrapPlotlyResult(plotly, registration);
}

export function buildBandScalarChart<
  TResult,
  ChartSourceType,
  TPayload extends object,
>(
  registration: ChartKindRegistration<TResult, ChartSourceType, TPayload>,
  chartSource: ChartSourceType | null,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
): ChartBuildResult {
  if (registration.registration.kind !== "band-scalar") {
    throw new Error(`Chart ${registration.instanceId} is not a band-scalar chart.`);
  }
  if (!chartSource) {
    return {
      plotly: null,
      legend: null,
      readiness: "empty",
      emptyMessage: registration.emptyMessage,
    };
  }
  const plotly = registration.registration.spec.build(
    chartSource as unknown as import("../../../../models/comfortDtos").ModelChartSourceDto<TPayload>,
    resultsByInput,
    context,
  );
  return wrapPlotlyResult(plotly, registration);
}

export function buildBoundaryRegionChart<TResult, ChartSourceType>(
  registration: ChartKindRegistration<TResult, ChartSourceType>,
  chartSource: ChartSourceType | null,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
): ChartBuildResult {
  if (registration.registration.kind !== "boundary-region") {
    throw new Error(`Chart ${registration.instanceId} is not a boundary-region chart.`);
  }
  const plotly = registration.registration.spec.build(
    chartSource,
    resultsByInput,
    context,
  );
  return wrapPlotlyResult(plotly, registration);
}

export function buildTimeSeriesLineChart<TResult, ChartSourceType>(
  registration: ChartKindRegistration<TResult, ChartSourceType>,
  chartSource: ChartSourceType | null,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
): ChartBuildResult {
  if (registration.registration.kind !== "time-series-line") {
    throw new Error(`Chart ${registration.instanceId} is not a time-series-line chart.`);
  }
  const plotly = registration.registration.spec.build(
    chartSource,
    resultsByInput,
    context,
  );
  return wrapPlotlyResult(plotly, registration);
}

export function buildParametricLineChart<TResult, ChartSourceType>(
  registration: ChartKindRegistration<TResult, ChartSourceType>,
): ChartBuildResult {
  if (registration.registration.kind !== "parametric-line") {
    throw new Error(`Chart ${registration.instanceId} is not a parametric-line chart.`);
  }
  return {
    plotly: null,
    legend: null,
    readiness: "empty",
    emptyMessage: "Parametric line charts are not implemented yet.",
  };
}

function wrapPlotlyResult<TResult, ChartSourceType, TPayload extends object>(
  plotly: PlotlyChartResponseDto | null,
  registration: ChartKindRegistration<TResult, ChartSourceType, TPayload>,
): ChartBuildResult {
  return {
    plotly,
    legend: null,
    readiness: plotly ? "ready" : "empty",
    emptyMessage: registration.emptyMessage,
  };
}
