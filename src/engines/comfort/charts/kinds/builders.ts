import type { ModelChartSource } from "../../../../catalog/chartSource";
import type { PlotlyChartSpec } from "../../../plotlyTypes";
import type {
  ChartBuildResult,
  ChartHoverProbe,
  ChartPlotlyBuild,
} from "../chartBuildResult";
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
import type { ChartEngineRegistration, BoundaryRegionDataSpec } from "./types";
import { isDynamicFieldGridSpec, isPsychrometricDataSpec } from "./types";
import { buildPsychrometricModelChart } from "../psychrometricModelChart";
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

function isChartPlotlyBuild(
  value: PlotlyChartSpec | ChartPlotlyBuild,
): value is ChartPlotlyBuild {
  return "spec" in value;
}

function wrapPlotlyResult(
  type: ChartType,
  plotly: PlotlyChartSpec | null,
  emptyMessage: string,
  hoverProbe?: ChartHoverProbe,
): ChartBuildResult {
  if (!plotly) return emptyResult(emptyMessage);
  return {
    payload: chartPayloadFromSpec(type, plotly),
    legend: null,
    readiness: "ready",
    emptyMessage,
    ...(hoverProbe ? { hoverProbe } : {}),
  };
}

function wrapBuiltChart(
  type: ChartType,
  built: PlotlyChartSpec | ChartPlotlyBuild | null,
  emptyMessage: string,
): ChartBuildResult {
  if (!built) return emptyResult(emptyMessage);
  if (isChartPlotlyBuild(built)) {
    return wrapPlotlyResult(type, built.spec, emptyMessage, built.hoverProbe);
  }
  return wrapPlotlyResult(type, built, emptyMessage);
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
    throw new Error(
      `Dynamic chart ${registration.instanceId} is missing a grid spec.`,
    );
  }

  const gridSpec = spec.resolveGridSpec?.(context);
  if (!gridSpec) {
    throw new Error(
      `Dynamic chart ${registration.instanceId} is missing a grid spec.`,
    );
  }
  const title = spec.title ?? "Dynamic";
  const plotly = buildGridModelChart(
    registration.instanceId,
    chartSource as unknown as ModelChartSource<object>,
    resultsByInput,
    context as ChartBuildContext<NumericBand>,
    {
      ...gridSpec,
      instanceId: registration.instanceId,
      dynamicTitle: title,
      ...(spec.lockedAxes
        ? {
            fixedView: {
              instanceId: registration.instanceId,
              title,
              ...spec.lockedAxes,
            },
          }
        : {}),
    } as GridModelChartSpec<object, TResult>,
  );

  return wrapBuiltChart(ChartType.Dynamic, plotly, registration.emptyMessage);
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
  if (!chartSource) return emptyResult(registration.emptyMessage);
  const { spec } = registration.registration;
  if (!isPsychrometricDataSpec(spec)) {
    throw new Error(
      `Psychrometric chart ${registration.instanceId} is missing a data spec.`,
    );
  }
  return wrapBuiltChart(
    ChartType.Psychrometric,
    buildPsychrometricModelChart(spec, chartSource, resultsByInput, context),
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
  if (!("getOutputValue" in spec)) {
    throw new Error(`UTCI chart ${registration.instanceId} is missing a data spec.`);
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
  if (!chartSource) return emptyResult(registration.emptyMessage);
  const { spec } = registration.registration;
  if (!("evaluate" in spec) || !("axisFields" in spec)) {
    throw new Error(`Adaptive chart ${registration.instanceId} is missing a data spec.`);
  }
  return wrapBuiltChart(
    ChartType.Adaptive,
    buildModelBoundaryRegionChart(
      spec as unknown as BoundaryRegionDataSpec<TResult, object>,
      chartSource,
      resultsByInput,
      context,
    ),
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
    return wrapBuiltChart(
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
