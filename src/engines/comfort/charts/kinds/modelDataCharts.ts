import { CalculationSource } from "../../../../catalog/calculationMetadata";
import type { ModelChartSource } from "../../../../catalog/chartSource";
import type { PlotlyChartSpec } from "../../../plotlyTypes";
import {
  inputOrder,
  type InputId as InputIdType,
} from "../../../../catalog/inputSlots";
import {
  findNumericBandIndexForValue,
  type Band,
  type ChartBuildContext,
  type ModelOutput,
  type NumericBand,
} from "../../../../catalog/modelCapabilities";
import {
  PhysicalQuantityId,
  getPhysicalQuantityMeta,
  type QuantityState,
} from "../../../../catalog/quantities";
import { unitLabel } from "../../../../catalog/units";
import { getBaselineInputEntry, getCompareInputs } from "../../helpers";
import { buildCompareInputMarkerTraces } from "../inputPoints";
import type { ChartPlotlyBuild } from "../chartBuildResult";
import { createDisplayHoverProbe } from "../hoverProbe";
import { buildTextAnnotation } from "../plotlyBuilders";
import {
  buildFieldChart,
  createBandedGridStrategy,
  createBoundaryRegionStrategy,
  createEmptyFieldStrategy,
  createFieldChartAxis,
} from "../fieldChartEngine";
import {
  buildTimeSeriesLineTrace,
  paddedSeriesRange,
} from "../timeSeriesLineChart";
import type { ChartRange } from "../types";
import { convertQuantityFromSi } from "../../../units";
import type {
  BandScalarDataSpec,
  BoundaryRegionDataSpec,
  TimeSeriesLineDataSpec,
} from "./types";

const BAND_SCALAR_Y_POINTS = 50;
const BAND_SCALAR_X_POINTS = 450;
const BAND_SCALAR_MARKER_Y = [0.78, 0.5, 0.22];
const ZONE_ANNOTATION_Y = { even: 0.05, odd: 0.16 };
const BOUNDARY_POINTS = 240;
const BOUNDARY_LINE = "#334155";

function asChartSource(
  chartSource: unknown,
): ModelChartSource<object> | null {
  if (
    chartSource &&
    typeof chartSource === "object" &&
    "inputs" in chartSource
  ) {
    return chartSource as ModelChartSource<object>;
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
  label?: string,
): ModelOutput {
  return {
    key: context.fieldChartConfig.zOutput,
    label: label
      ?? getPhysicalQuantityMeta(context.fieldChartConfig.zOutput).label,
    defaultBands: bands,
  };
}

export function buildModelBandScalarChart<TResult>(
  spec: BandScalarDataSpec<TResult>,
  chartSource: unknown,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
): PlotlyChartSpec {
  const bands = toNumericBands(context.fieldChartConfig.bands);
  const values = Object.values(resultsByInput).flatMap((result) =>
    result == null ? [] : [spec.getOutputValue(result)],
  );
  const xRangeSi = spec.xRangeSi ?? finiteRange(bands, values);
  const output = outputFromContext(context, bands, spec.xLabel);
  const source = asChartSource(chartSource);
  const inputs = source ? getCompareInputs(source.inputs) : [];
  const markerY = inputs.length > 1 ? BAND_SCALAR_MARKER_Y : [0.5];
  const yByInput = new Map(
    inputs.map(({ inputId }, index) => [inputId, markerY[index] ?? 0.5]),
  );
  const temperatureUnits = unitLabel(
    getPhysicalQuantityMeta(PhysicalQuantityId.DryBulbTemperature).siUnit,
    context.unitSystem,
  );
  const categoryTitle = spec.hoverCategoryTitle ?? "Category";
  const annotations = bands.flatMap((band, index) => {
    const min = Math.max(band.min, xRangeSi.min);
    const max = Math.min(band.max, xRangeSi.max);
    if (min >= max) return [];
    const text = spec.legendTextByLabel?.[band.label] ?? band.label;
    return [buildTextAnnotation({
      x: convertQuantityFromSi(
        context.fieldChartConfig.xField,
        (min + max) / 2,
        context.unitSystem,
      ),
      y: index % 2 === 0 ? ZONE_ANNOTATION_Y.even : ZONE_ANNOTATION_Y.odd,
      text,
    })];
  });

  return buildFieldChart({
    unitSystem: context.unitSystem,
    xAxis: {
      field: context.fieldChartConfig.xField,
      rangeSi: xRangeSi,
      points: spec.xPoints ?? BAND_SCALAR_X_POINTS,
      label: spec.xLabel,
      showGrid: false,
      zeroLine: false,
    },
    yAxis: {
      field: context.fieldChartConfig.yField,
      rangeSi: { min: 0, max: 1 },
      points: spec.yPoints ?? BAND_SCALAR_Y_POINTS,
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
      opacity: 0.75,
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
              if (result == null) {
                return `${inputLabel}<extra></extra>`;
              }
              const valueSi = spec.getOutputValue(result);
              const bandIndex = findNumericBandIndexForValue(bands, valueSi);
              const bandLabel = bandIndex === undefined
                ? "Unclassified"
                : bands[bandIndex]!.label;
              return `${inputLabel}<br>${output.label}: %{x:.1f} ${temperatureUnits}<br><b>${categoryTitle}: ${bandLabel}</b><extra></extra>`;
            },
            markerSize: 14,
          },
        ]
      : undefined,
    annotations,
    layout: {
      title: spec.title ?? "",
      margin: spec.margin ?? { l: 56, r: 24, t: 48, b: 80 },
      legend: { orientation: "h", x: 0, y: 1.08 },
    },
    source: CalculationSource.FrontendGenerated,
  });
}

export function buildModelBoundaryRegionChart<TResult, TPayload extends object>(
  spec: BoundaryRegionDataSpec<TResult, TPayload>,
  chartSource: unknown,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
): ChartPlotlyBuild {
  const source = asChartSource(chartSource) as ModelChartSource<TPayload> | null;
  const outdoorField = spec.axisFields.find(
    (field) => field === PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
  ) ?? spec.axisFields[0]!;
  const operativeField = spec.axisFields.find(
    (field) => field === PhysicalQuantityId.OperativeTemperature,
  ) ?? spec.axisFields[1]!;
  const boundaryAxis = context.fieldChartConfig.xField === outdoorField
    ? "x"
    : "y";
  const outdoorAxisSpec = {
    field: outdoorField,
    rangeSi: spec.outdoorRangeSi,
    points: spec.boundaryPoints ?? BOUNDARY_POINTS,
    label: spec.outdoorLabel,
    units: (unitSystem: typeof context.unitSystem) =>
      unitLabel(
        getPhysicalQuantityMeta(PhysicalQuantityId.DryBulbTemperature).siUnit,
        unitSystem,
      ),
  };
  const operativeAxisSpec = {
    field: operativeField,
    rangeSi: spec.operativeRangeSi,
    points: 2,
    units: (unitSystem: typeof context.unitSystem) =>
      unitLabel(
        getPhysicalQuantityMeta(PhysicalQuantityId.DryBulbTemperature).siUnit,
        unitSystem,
      ),
  };
  const xAxisSpec = boundaryAxis === "x" ? outdoorAxisSpec : operativeAxisSpec;
  const yAxisSpec = boundaryAxis === "x" ? operativeAxisSpec : outdoorAxisSpec;
  const xAxis = createFieldChartAxis(xAxisSpec, context.unitSystem);
  const yAxis = createFieldChartAxis(yAxisSpec, context.unitSystem);
  const baseline = source
    ? getBaselineInputEntry(source.inputs, context.baselineInputId)
    : null;
  const bandInputsSi = baseline && spec.getBandInputsSi
    ? spec.getBandInputsSi(baseline.payload)
    : spec.getBandInputsSi
      ? null
      : (context.modelInputs ?? {});

  const plotly = buildFieldChart({
    unitSystem: context.unitSystem,
    xAxis: xAxisSpec,
    yAxis: yAxisSpec,
    strategy: bandInputsSi
      ? createBoundaryRegionStrategy({
          bands: context.fieldChartConfig.bands,
          bandInputsSi,
          style: { lineColor: BOUNDARY_LINE },
          boundaryAxis,
        })
      : createEmptyFieldStrategy(),
    inputGroups: source
      ? () => [
          {
            inputsMap: source.inputs,
            resultsByInput,
            getXSi: (payload, inputId) => {
              const result = (resultsByInput[inputId] ?? spec.evaluate(payload)) as QuantityState | null;
              return boundaryAxis === "x"
                ? (payload as { t_running_mean?: number }).t_running_mean ?? Number.NaN
                : result?.[PhysicalQuantityId.OperativeTemperature]
                  ?? Number.NaN;
            },
            getYSi: (payload, inputId) => {
              const result = (resultsByInput[inputId] ?? spec.evaluate(payload)) as QuantityState | null;
              return boundaryAxis === "x"
                ? result?.[PhysicalQuantityId.OperativeTemperature]
                  ?? Number.NaN
                : (payload as { t_running_mean?: number }).t_running_mean ?? Number.NaN;
            },
            getHovertemplate: ({ inputLabel }) => spec.buildHoverTemplate(
              context.unitSystem,
              xAxis,
              yAxis,
              inputLabel,
            ),
            hoverMetadata: ({ payload, inputId }) => {
              const result = resultsByInput[inputId] ?? spec.evaluate(payload);
              return spec.getHoverMetadata(result, context.unitSystem, payload);
            },
          },
        ]
      : undefined,
    layout: {
      title: spec.title ?? "",
      margin: { l: 56, r: 24, t: 48, b: 80 },
      legend: { orientation: "h", x: 0, y: 1.1 },
    },
    source: CalculationSource.FrontendGenerated,
  });

  return {
    spec: plotly,
    hoverProbe: baseline
      ? createDisplayHoverProbe(xAxis, yAxis, (xSi, ySi) => {
          const outdoorSi = boundaryAxis === "x" ? xSi : ySi;
          const operativeSi = boundaryAxis === "x" ? ySi : xSi;
          const payload = spec.requestFromPoint(
            baseline.payload,
            outdoorSi,
            operativeSi,
          );
          const result = spec.evaluate(payload);
          return {
            hovertemplate: spec.buildHoverTemplate(
              context.unitSystem,
              xAxis,
              yAxis,
            ),
            customdata: spec.getHoverMetadata(
              result,
              context.unitSystem,
              payload,
            ),
          };
        })
      : undefined,
  };
}

export function buildModelTimeSeriesLineChart<TResult>(
  spec: TimeSeriesLineDataSpec<TResult>,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
): PlotlyChartSpec | null {
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
      title: spec.title ?? "",
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
