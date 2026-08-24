import { CalculationSource } from "../../../../models/calculationMetadata";
import type {
  ModelChartSourceDto,
  PlotlyChartResponseDto,
} from "../../../../models/comfortDtos";
import {
  inputOrder,
  type InputId as InputIdType,
} from "../../../../models/inputSlots";
import {
  type Band,
  type ChartBuildContext,
  type ModelOutput,
  type NumericBand,
} from "../../../../models/modelCapabilities";
import { getPhysicalQuantityMeta } from "../../../../models/physicalQuantities";
import { getCompareInputs } from "../../helpers";
import { buildCompareInputMarkerTraces } from "../inputPoints";
import {
  buildFieldChart,
  createBandedGridStrategy,
  createBoundaryRegionStrategy,
} from "../chartEngine";
import {
  buildTimeSeriesLineTrace,
  paddedSeriesRange,
} from "../timeSeriesLineChart";
import type { ChartRange } from "../types";
import type {
  BandScalarDataSpec,
  BoundaryRegionDataSpec,
  TimeSeriesLineDataSpec,
} from "./types";

const BAND_SCALAR_Y_POINTS = 8;
const BAND_SCALAR_X_POINTS = 64;
const BOUNDARY_POINTS = 32;
const BOUNDARY_LINE = "#334155";

function asChartSource(
  chartSource: unknown,
): ModelChartSourceDto<object> | null {
  if (
    chartSource &&
    typeof chartSource === "object" &&
    "inputs" in chartSource
  ) {
    return chartSource as ModelChartSourceDto<object>;
  }
  return null;
}

function toNumericBands(bands: readonly Band[]): NumericBand[] {
  return bands.filter(
    (band): band is NumericBand =>
      typeof band.min === "number" && typeof band.max === "number",
  );
}

function finiteRange(
  bands: readonly NumericBand[],
  values: readonly number[],
): ChartRange {
  const edges = [
    ...bands.flatMap(({ min, max }) => [min, max]),
    ...values,
  ].filter((value) => Number.isFinite(value));
  if (edges.length === 0) {
    return { min: 0, max: 1 };
  }
  const min = Math.min(...edges);
  const max = Math.max(...edges);
  if (min === max) {
    return { min: min - 1, max: max + 1 };
  }
  return { min, max };
}

function outputFromContext(
  context: ChartBuildContext,
  bands: readonly NumericBand[],
): ModelOutput {
  return {
    key: context.fieldChartConfig.zOutput,
    label: context.fieldChartConfig.zOutput,
    defaultBands: bands,
  };
}

export function buildModelBandScalarChart<TResult>(
  spec: BandScalarDataSpec<TResult>,
  chartSource: unknown,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
): PlotlyChartResponseDto {
  const bands = toNumericBands(context.fieldChartConfig.bands);
  const values = Object.values(resultsByInput).flatMap((result) =>
    result == null ? [] : [spec.getOutputValue(result)],
  );
  const xRangeSi = finiteRange(bands, values);
  const output = outputFromContext(context, bands);
  const source = asChartSource(chartSource);
  const yByInput = new Map(
    (source ? getCompareInputs(source.inputs) : []).map(
      ({ inputId }, index) => [inputId, [0.78, 0.5, 0.22][index] ?? 0.5],
    ),
  );

  return buildFieldChart({
    unitSystem: context.unitSystem,
    xAxis: {
      field: context.fieldChartConfig.xField,
      rangeSi: xRangeSi,
      points: BAND_SCALAR_X_POINTS,
      showGrid: false,
      zeroLine: false,
    },
    yAxis: {
      field: context.fieldChartConfig.yField,
      rangeSi: { min: 0, max: 1 },
      points: BAND_SCALAR_Y_POINTS,
      label: "",
      units: "",
      toDisplay: (value) => value,
      toSi: (value) => value,
      showTickLabels: false,
    },
    strategy: createBandedGridStrategy({
      config: {
        xField: context.fieldChartConfig.xField,
        yField: context.fieldChartConfig.yField,
        zOutput: context.fieldChartConfig.zOutput,
        bands,
      },
      output,
      evaluateOutput: (xSi) => xSi,
    }),
    inputGroups: source
      ? () => [
          {
            inputsMap: source.inputs,
            resultsByInput,
            getXSi: (_payload, inputId) => {
              const result = resultsByInput[inputId];
              return result == null ? Number.NaN : spec.getOutputValue(result);
            },
            getYSi: (_payload, inputId) => yByInput.get(inputId) ?? 0.5,
            getHovertemplate: ({ inputLabel, inputId }) => {
              const result = resultsByInput[inputId];
              const value =
                result == null ? "—" : String(spec.getOutputValue(result));
              return `${inputLabel}<br>${output.label}: ${value}<extra></extra>`;
            },
          },
        ]
      : undefined,
    layout: {
      title: spec.title,
      margin: { l: 56, r: 24, t: 48, b: 64 },
      legend: { orientation: "h", x: 0, y: 1.08 },
    },
    source: CalculationSource.FrontendGenerated,
  });
}

export function buildModelBoundaryRegionChart(
  spec: BoundaryRegionDataSpec,
  context: ChartBuildContext,
): PlotlyChartResponseDto {
  const [xField, yField] = spec.axisFields;
  const xMeta = getPhysicalQuantityMeta(xField);
  const yMeta = getPhysicalQuantityMeta(yField);

  return buildFieldChart({
    unitSystem: context.unitSystem,
    xAxis: {
      field: xField,
      rangeSi: { min: xMeta.minSi, max: xMeta.maxSi },
      points: BOUNDARY_POINTS,
    },
    yAxis: {
      field: yField,
      rangeSi: { min: yMeta.minSi, max: yMeta.maxSi },
      points: BOUNDARY_POINTS,
    },
    strategy: createBoundaryRegionStrategy({
      bands: context.fieldChartConfig.bands,
      bandInputsSi: context.modelInputs ?? {},
      style: { lineColor: BOUNDARY_LINE },
      boundaryAxis: "y",
    }),
    layout: {
      title: spec.title,
      margin: { l: 60, r: 24, t: 48, b: 64 },
    },
    source: CalculationSource.FrontendGenerated,
  });
}

export function buildModelTimeSeriesLineChart<TResult>(
  spec: TimeSeriesLineDataSpec<TResult>,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
): PlotlyChartResponseDto | null {
  const result = resultsByInput[context.baselineInputId];
  if (result == null) return null;
  const series = spec
    .getSeries(result)
    .filter(({ x, y }) => Number.isFinite(x) && Number.isFinite(y));
  if (series.length === 0) return null;

  const xValues = series.map(({ x }) => x);
  const yValues = series.map(({ y }) => y);
  const comparePointsByInput: Partial<
    Record<InputIdType, { x: number; y: number }>
  > = {};
  for (const inputId of inputOrder) {
    const inputResult = resultsByInput[inputId];
    if (inputResult == null) continue;
    const inputSeries = spec
      .getSeries(inputResult)
      .filter(({ x, y }) => Number.isFinite(x) && Number.isFinite(y));
    const lastPoint = inputSeries[inputSeries.length - 1];
    if (lastPoint) {
      comparePointsByInput[inputId] = lastPoint;
    }
  }

  return {
    traces: [
      buildTimeSeriesLineTrace({
        name: spec.yLabel,
        x: xValues,
        y: yValues,
        color: "#1B679B",
        unit: "",
      }),
      ...buildCompareInputMarkerTraces(comparePointsByInput),
    ],
    layout: {
      title: spec.title,
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#f8fafc",
      showlegend: true,
      margin: { l: 56, r: 24, t: 48, b: 64 },
      xaxis: { title: "Time", range: paddedSeriesRange(xValues, 0.1) },
      yaxis: { title: spec.yLabel, range: paddedSeriesRange(yValues, 0.1) },
    },
    annotations: [],
    source: CalculationSource.FrontendGenerated,
  };
}
