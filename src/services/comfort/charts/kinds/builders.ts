import type { ModelChartSource } from "../../../../models/chartSource";
import type { PlotlyChartSpec } from "../../../plotlyTypes";
import type { ChartBuildResult } from "../chartBuildResult";
import { ChartEngine } from "../../../../models/output/chartKinds";
import type { InputId as InputIdType } from "../../../../models/inputSlots";
import type {
  ChartBuildContext,
  NumericBand,
} from "../../../../models/modelCapabilities";
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

export function buildDynamicFieldChart<TResult, ChartSourceType>(
  registration: ChartEngineRegistration<TResult, ChartSourceType>,
  chartSource: ChartSourceType | null,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
): ChartBuildResult {
  if (registration.registration.engine !== ChartEngine.DynamicField) {
    throw new Error(
      `Chart ${registration.instanceId} is not a dynamic-field chart.`,
    );
  }
  if (!chartSource) {
    return {
      plotly: null,
      legend: null,
      readiness: "empty",
      emptyMessage: registration.emptyMessage,
    };
  }

  const { spec } = registration.registration;
  if (!isDynamicFieldGridSpec<TResult>(spec)) {
    const plotly = spec.build(chartSource, resultsByInput, context);
    return wrapPlotlyResult(plotly, registration);
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

  return wrapPlotlyResult(plotly, registration);
}

export function buildCustomChart<TResult, ChartSourceType>(
  registration: ChartEngineRegistration<TResult, ChartSourceType>,
  chartSource: ChartSourceType | null,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
): ChartBuildResult {
  if (registration.registration.engine !== ChartEngine.Custom) {
    throw new Error(`Chart ${registration.instanceId} is not a custom chart.`);
  }
  const plotly = registration.registration.spec.build(
    chartSource,
    resultsByInput,
    context,
  );
  return wrapPlotlyResult(plotly, registration);
}

export function buildBandScalarChart<TResult, ChartSourceType>(
  registration: ChartEngineRegistration<TResult, ChartSourceType>,
  chartSource: ChartSourceType | null,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
): ChartBuildResult {
  if (registration.registration.engine !== ChartEngine.BandScalar) {
    throw new Error(
      `Chart ${registration.instanceId} is not a band-scalar chart.`,
    );
  }
  const { spec } = registration.registration;
  if ("build" in spec) {
    if (!chartSource) {
      return {
        plotly: null,
        legend: null,
        readiness: "empty",
        emptyMessage: registration.emptyMessage,
      };
    }
    const plotly = spec.build(chartSource, resultsByInput, context);
    return wrapPlotlyResult(plotly, registration);
  }
  return wrapPlotlyResult(
    buildModelBandScalarChart(spec, chartSource, resultsByInput, context),
    registration,
  );
}

export function buildBoundaryRegionChart<TResult, ChartSourceType>(
  registration: ChartEngineRegistration<TResult, ChartSourceType>,
  chartSource: ChartSourceType | null,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
): ChartBuildResult {
  if (registration.registration.engine !== ChartEngine.BoundaryRegion) {
    throw new Error(
      `Chart ${registration.instanceId} is not a boundary-region chart.`,
    );
  }
  const { spec } = registration.registration;
  if ("build" in spec) {
    const plotly = spec.build(chartSource, resultsByInput, context);
    return wrapPlotlyResult(plotly, registration);
  }
  return wrapPlotlyResult(
    buildModelBoundaryRegionChart(spec, context),
    registration,
  );
}

export function buildTimeSeriesLineChart<TResult, ChartSourceType>(
  registration: ChartEngineRegistration<TResult, ChartSourceType>,
  chartSource: ChartSourceType | null,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
): ChartBuildResult {
  if (registration.registration.engine !== ChartEngine.TimeSeriesLine) {
    throw new Error(
      `Chart ${registration.instanceId} is not a time-series-line chart.`,
    );
  }
  const { spec } = registration.registration;
  if ("build" in spec) {
    const plotly = spec.build(chartSource, resultsByInput, context);
    return wrapPlotlyResult(plotly, registration);
  }
  return wrapPlotlyResult(
    buildModelTimeSeriesLineChart(spec, resultsByInput, context),
    registration,
  );
}

export function buildParametricLineChart<TResult, ChartSourceType>(
  registration: ChartEngineRegistration<TResult, ChartSourceType>,
  chartSource: ChartSourceType | null,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
): ChartBuildResult {
  if (registration.registration.engine !== ChartEngine.ParametricLine) {
    throw new Error(
      `Chart ${registration.instanceId} is not a parametric-line chart.`,
    );
  }
  return wrapPlotlyResult(
    buildModelParametricLineChart(
      registration.registration.spec,
      chartSource,
      resultsByInput,
      context,
    ),
    registration,
  );
}

function wrapPlotlyResult<TResult, ChartSourceType>(
  plotly: PlotlyChartSpec | null,
  registration: ChartEngineRegistration<TResult, ChartSourceType>,
): ChartBuildResult {
  return {
    plotly,
    legend: null,
    readiness: plotly ? "ready" : "empty",
    emptyMessage: registration.emptyMessage,
  };
}
