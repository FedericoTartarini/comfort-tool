import type { ModelChartSource } from "../../../../catalog/chartSource";
import type { PlotlyChartSpec } from "../../../plotlyTypes";
import type { ChartBuildResult } from "../chartBuildResult";
import { ChartType } from "../../../../catalog/chartTypes";
import type { InputId as InputIdType } from "../../../../catalog/inputSlots";
import {
  type ChartBuildContext,
  type NumericBand,
} from "../../../../catalog/modelCapabilities";
import {
  buildGridModelChart,
  type GridModelChartSpec,
} from "../gridModelCharts";
import type { ChartEngineRegistration } from "./types";
import { isDynamicFieldGridSpec } from "./types";
import {
  buildModelBandScalarChart,
  buildModelBoundaryRegionChart,
  buildModelTimeSeriesLineChart,
} from "./modelDataCharts";
import { buildModelParametricLineChart } from "./parametricLine";
import { chartPayloadFromSpec } from "../toChartPayload";

function emptyResult(emptyMessage: string): ChartBuildResult {
  return {
    payload: null,
    legend: null,
    readiness: "empty",
    emptyMessage,
  };
}

function wrapPlotlyResult(
  type: ChartType,
  plotly: PlotlyChartSpec | null,
  emptyMessage: string,
): ChartBuildResult {
  if (!plotly) return emptyResult(emptyMessage);
  return {
    payload: chartPayloadFromSpec(type, plotly),
    legend: null,
    readiness: "ready",
    emptyMessage,
  };
}

export function buildDynamicFieldChart<TResult, ChartSourceType>(
  registration: ChartEngineRegistration<TResult, ChartSourceType>,
  chartSource: ChartSourceType | null,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
): ChartBuildResult {
  if (registration.registration.type !== ChartType.Dynamic) {
    throw new Error(
      `Chart ${registration.instanceId} is not a dynamic chart.`,
    );
  }
  if (!chartSource) return emptyResult(registration.emptyMessage);

  const { spec } = registration.registration;
  if (!isDynamicFieldGridSpec<TResult>(spec)) {
    return wrapPlotlyResult(
      ChartType.Dynamic,
      spec.build(chartSource, resultsByInput, context),
      registration.emptyMessage,
    );
  }

  const gridSpec = spec.resolveGridSpec(context);
  const plotly = buildGridModelChart(
    registration.instanceId,
    chartSource as unknown as ModelChartSource<object>,
    resultsByInput,
    context as ChartBuildContext<NumericBand>,
    {
      ...gridSpec,
      instanceId: registration.instanceId,
      dynamicTitle: spec.title,
      ...(spec.lockedAxes
        ? {
            fixedView: {
              instanceId: registration.instanceId,
              title: spec.title,
              ...spec.lockedAxes,
            },
          }
        : {}),
    } as GridModelChartSpec<object, TResult>,
  );

  return wrapPlotlyResult(ChartType.Dynamic, plotly, registration.emptyMessage);
}

export function buildPsychrometricChart<TResult, ChartSourceType>(
  registration: ChartEngineRegistration<TResult, ChartSourceType>,
  chartSource: ChartSourceType | null,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
): ChartBuildResult {
  if (registration.registration.type !== ChartType.Psychrometric) {
    throw new Error(`Chart ${registration.instanceId} is not a psychrometric chart.`);
  }
  return wrapPlotlyResult(
    ChartType.Psychrometric,
    registration.registration.spec.build(chartSource, resultsByInput, context),
    registration.emptyMessage,
  );
}

export function buildUtciChart<TResult, ChartSourceType>(
  registration: ChartEngineRegistration<TResult, ChartSourceType>,
  chartSource: ChartSourceType | null,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
): ChartBuildResult {
  if (registration.registration.type !== ChartType.Utci) {
    throw new Error(`Chart ${registration.instanceId} is not a UTCI chart.`);
  }
  const { spec } = registration.registration;
  if ("build" in spec) {
    if (!chartSource) return emptyResult(registration.emptyMessage);
    return wrapPlotlyResult(
      ChartType.Utci,
      spec.build(chartSource, resultsByInput, context),
      registration.emptyMessage,
    );
  }
  return wrapPlotlyResult(
    ChartType.Utci,
    buildModelBandScalarChart(spec, chartSource, resultsByInput, context),
    registration.emptyMessage,
  );
}

export function buildAdaptiveChartKind<TResult, ChartSourceType>(
  registration: ChartEngineRegistration<TResult, ChartSourceType>,
  chartSource: ChartSourceType | null,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
): ChartBuildResult {
  if (registration.registration.type !== ChartType.Adaptive) {
    throw new Error(`Chart ${registration.instanceId} is not an adaptive chart.`);
  }
  const { spec } = registration.registration;
  if ("build" in spec) {
    return wrapPlotlyResult(
      ChartType.Adaptive,
      spec.build(chartSource, resultsByInput, context),
      registration.emptyMessage,
    );
  }
  return wrapPlotlyResult(
    ChartType.Adaptive,
    buildModelBoundaryRegionChart(spec, context),
    registration.emptyMessage,
  );
}

export function buildBodyTemperatureChart<TResult, ChartSourceType>(
  registration: ChartEngineRegistration<TResult, ChartSourceType>,
  chartSource: ChartSourceType | null,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
): ChartBuildResult {
  const type = registration.registration.type;
  if (type !== ChartType.BodyTemperature && type !== ChartType.WaterLoss) {
    throw new Error(`Chart ${registration.instanceId} is not a time-series chart.`);
  }
  const { spec } = registration.registration;
  if ("build" in spec) {
    return wrapPlotlyResult(
      type,
      spec.build(chartSource, resultsByInput, context),
      registration.emptyMessage,
    );
  }
  return wrapPlotlyResult(
    type,
    buildModelTimeSeriesLineChart(spec, resultsByInput, context),
    registration.emptyMessage,
  );
}

export function buildParametricChart<TResult, ChartSourceType>(
  registration: ChartEngineRegistration<TResult, ChartSourceType>,
  chartSource: ChartSourceType | null,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
): ChartBuildResult {
  const type = registration.registration.type;
  if (type !== ChartType.HeatLoss && type !== ChartType.Set) {
    throw new Error(`Chart ${registration.instanceId} is not a series chart.`);
  }
  return wrapPlotlyResult(
    type,
    buildModelParametricLineChart(
      registration.registration.spec,
      chartSource,
      resultsByInput,
      context,
    ),
    registration.emptyMessage,
  );
}
