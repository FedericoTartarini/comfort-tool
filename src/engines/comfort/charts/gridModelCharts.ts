import { CalculationSource } from "../../../catalog/calculationMetadata";
import type {
  CompareInputMap,
  ModelChartSource,
} from "../../../catalog/chartSource";
import type {
  PlotHoverValue,
  PlotlyChartSpec,
} from "../../plotlyTypes";
import { ChartAxisQuantityId, getPhysicalQuantityMeta } from "../../../catalog/quantities";
import type { InputId as InputIdType } from "../../../catalog/inputSlots";
import {
  ChartBuildContext,
  ModelOutput,
  NumericBand,
  NumericFieldChartConfig,
  ModelOutputKey as ModelOutputKeyType,
  findNumericBandIndexForValue,
} from "../../../catalog/modelCapabilities";
import type { UnitSystem as UnitSystemType } from "../../../catalog/units";
import type { FieldRequestAdapter } from "../requestMapping";
import {
  convertModelOutputFromSi,
  getModelOutputDisplayMeta,
} from "../../units";
import {
  buildFieldChart,
  createBandedGridStrategy,
  type BandedGridOutputEvaluation,
  type FieldChartInputGroup,
  type FieldChartLayoutSpec,
} from "./fieldChartEngine";
import { getBaselineInputEntry } from "../helpers";
import {
  CHART_COORDINATE_TOLERANCE,
  resolveInteractiveDynamicGridPoints,
  type ChartRange,
} from "./types";

export interface GridModelDynamicHoverExtension<TResult> {
  getTemplateSuffix: (unitSystem: UnitSystemType) => string;
  getMetadata: (
    result: TResult | null | undefined,
    unitSystem: UnitSystemType,
  ) => readonly PlotHoverValue[];
}

export interface GridModelFixedViewSpec {
  instanceId: string;
  title: string;
  xField: ChartAxisQuantityId;
  yField: ChartAxisQuantityId;
  xRangeSi: ChartRange;
  yRangeSi: ChartRange;
}

export interface GridModelChartSpec<TPayload extends object, TResult> {
  instanceId: string;
  dynamicTitle: string;
  output: ModelOutput;
  /** When set, z-output metadata resolves from this list (e.g. PHS multi-output). */
  exploreOutputs?: readonly ModelOutput[];
  bandLabel?: string;
  dynamicHoverExtension?: GridModelDynamicHoverExtension<TResult>;
  axisRanges?: Partial<Record<ChartAxisQuantityId, ChartRange>>;
  /** Samples per axis. Interactive Dynamic 2-D is capped at INTERACTIVE_DYNAMIC_GRID_POINTS. */
  gridPoints?: number;
  isPlottable?: (result: TResult | null | undefined) => boolean;
  outsideApplicabilityMessage?: string;
  requestAdapter: Pick<
    FieldRequestAdapter<TPayload>,
    "getAxisValue" | "setAxisValue"
  >;
  /** Uses operative-temperature or alias-aware axis adapters when chart axes differ from request fields. */
  chartAxisAdapter?: Pick<
    FieldRequestAdapter<TPayload>,
    "getAxisValue" | "setAxisValue"
  >;
  /** When false, the grid cell is empty. Defaults to setting both axis values on the payload. */
  applyChartCoordinates?: (
    payload: TPayload,
    xField: ChartAxisQuantityId,
    xSi: number,
    yField: ChartAxisQuantityId,
    ySi: number,
  ) => boolean;
  evaluate: (payload: TPayload) => TResult;
  /** When set, grid cells use this instead of evaluate + getOutputValue. */
  tryEvaluatePayload?: (payload: TPayload) => number | null | undefined;
  getOutputValue: (
    result: TResult,
    outputKey: ModelOutputKeyType,
  ) => number | null | undefined;
  fixedView?: GridModelFixedViewSpec;
  dynamicViewLayout?: Partial<FieldChartLayoutSpec>;
}

interface GridModelView {
  title: string;
  config: NumericFieldChartConfig;
  xRangeSi: ChartRange;
  yRangeSi: ChartRange;
  hoverTemplateSuffix: string;
  layout?: Partial<FieldChartLayoutSpec>;
}

function getAxisRange(
  field: ChartAxisQuantityId,
  ranges?: Partial<Record<ChartAxisQuantityId, ChartRange>>,
): ChartRange {
  return ranges?.[field] ?? {
    min: getPhysicalQuantityMeta(field).minSi,
    max: getPhysicalQuantityMeta(field).maxSi,
  };
}

function resolveGridOutput(
  spec: GridModelChartSpec<object, unknown>,
  zOutput: ModelOutputKeyType,
): ModelOutput {
  if (spec.exploreOutputs) {
    const match = spec.exploreOutputs.find(({ key }) => key === zOutput);
    if (!match) {
      throw new Error(`Missing chart output ${zOutput}.`);
    }
    return match;
  }
  return spec.output;
}

function buildGridModelView<TPayload extends object, TResult>(
  inputsMap: CompareInputMap<TPayload>,
  resultsByInput: Partial<Record<InputIdType, TResult | null>>,
  baselinePayload: TPayload,
  context: ChartBuildContext<NumericBand>,
  spec: GridModelChartSpec<TPayload, TResult>,
  view: GridModelView,
): PlotlyChartSpec {
  const { unitSystem } = context;
  const output = resolveGridOutput(
    spec as GridModelChartSpec<object, unknown>,
    view.config.zOutput,
  );
  const outputMeta = getModelOutputDisplayMeta(output.key, unitSystem);
  const outputUnits = outputMeta.displayUnits ? ` ${outputMeta.displayUnits}` : "";
  const bandLabel = spec.bandLabel ?? "Band";
  const gridPoints = resolveInteractiveDynamicGridPoints(spec.gridPoints);
  const chartAxisAdapter = spec.chartAxisAdapter ?? spec.requestAdapter;
  const baselineXSi = chartAxisAdapter.getAxisValue(baselinePayload, view.config.xField);
  const baselineYSi = chartAxisAdapter.getAxisValue(baselinePayload, view.config.yField);
  const getResultValue = (result: TResult | null | undefined) => {
    if (result == null) return undefined;
    const valueSi = spec.getOutputValue(result, view.config.zOutput);
    if (valueSi == null || !Number.isFinite(valueSi)) return undefined;
    return valueSi;
  };
  const isPlottable = (result: TResult | null | undefined) => (
    spec.isPlottable ? spec.isPlottable(result) : getResultValue(result) !== undefined
  );
  return buildFieldChart({
    unitSystem,
    xAxis: {
      field: view.config.xField,
      rangeSi: view.xRangeSi,
      points: gridPoints,
    },
    yAxis: {
      field: view.config.yField,
      rangeSi: view.yRangeSi,
      points: gridPoints,
    },
    strategy: createBandedGridStrategy({
      config: view.config,
      output,
      bandLabel,
      hoverTemplateSuffix: view.hoverTemplateSuffix,
      evaluateOutput: (xSi, ySi, zOutput, _xIndex, _yIndex, renderContext) => {
        if (
          Math.abs(xSi - baselineXSi) < CHART_COORDINATE_TOLERANCE
          && Math.abs(ySi - baselineYSi) < CHART_COORDINATE_TOLERANCE
        ) {
          const cachedResult = resultsByInput[context.baselineInputId];
          const cachedValue = getResultValue(cachedResult);
          if (cachedValue !== undefined) {
            const additionalHoverMetadata = spec.dynamicHoverExtension
              ?.getMetadata(cachedResult, renderContext.unitSystem);
            return additionalHoverMetadata
              ? { valueSi: cachedValue, additionalHoverMetadata } satisfies BandedGridOutputEvaluation
              : cachedValue;
          }
        }
        const pointPayload = { ...baselinePayload };
        const coordinatesValid = spec.applyChartCoordinates
          ? spec.applyChartCoordinates(
              pointPayload,
              view.config.xField,
              xSi,
              view.config.yField,
              ySi,
            )
          : (() => {
              spec.requestAdapter.setAxisValue(pointPayload, view.config.xField, xSi);
              spec.requestAdapter.setAxisValue(pointPayload, view.config.yField, ySi);
              return true;
            })();
        if (!coordinatesValid) {
          return null;
        }
        if (spec.tryEvaluatePayload) {
          const directValue = spec.tryEvaluatePayload(pointPayload);
          if (directValue == null || !Number.isFinite(directValue)) {
            return null;
          }
          return directValue;
        }
        const result = spec.evaluate(pointPayload);
        const valueSi = spec.getOutputValue(result, zOutput);
        if (valueSi == null || !Number.isFinite(valueSi)) {
          return null;
        }
        const additionalHoverMetadata = spec.dynamicHoverExtension
          ?.getMetadata(result, renderContext.unitSystem);

        return additionalHoverMetadata
          ? { valueSi, additionalHoverMetadata } satisfies BandedGridOutputEvaluation
          : valueSi;
      },
    }),
    inputGroups: ({ xAxis, yAxis }) => [{
      inputsMap,
      resultsByInput,
      getXSi: (payload) => chartAxisAdapter.getAxisValue(payload, view.config.xField),
      getYSi: (payload) => chartAxisAdapter.getAxisValue(payload, view.config.yField),
      getHovertemplate: ({ inputLabel, result }) => {
        if (!isPlottable(result) && spec.outsideApplicabilityMessage) {
          return `${inputLabel}<br><b>${spec.outsideApplicabilityMessage}</b><extra></extra>`;
        }
        const valueSi = getResultValue(result);
        const selectedBandIndex = valueSi === undefined
          ? undefined
          : findNumericBandIndexForValue(view.config.bands, valueSi);
        const selectedBandLabel = selectedBandIndex === undefined
          ? "Unclassified"
          : view.config.bands[selectedBandIndex].label;

        return `${inputLabel}<br>${xAxis.label}: %{x:.${xAxis.decimals ?? 2}f} ${xAxis.units}<br>${yAxis.label}: %{y:.${yAxis.decimals ?? 2}f} ${yAxis.units}<br><b>${bandLabel}: ${selectedBandLabel}</b><br>${output.label}: %{customdata[0]:.${outputMeta.decimals}f}${outputUnits}${view.hoverTemplateSuffix}<extra></extra>`;
      },
      hoverMetadata: ({ result }) => {
        const valueSi = getResultValue(result);
        return [
          valueSi === undefined
            ? ""
            : convertModelOutputFromSi(output.key, valueSi, unitSystem),
          ...(spec.dynamicHoverExtension?.getMetadata(result, unitSystem) ?? []),
        ];
      },
    } satisfies FieldChartInputGroup<TPayload, TResult>],
    layout: {
      title: view.title,
      paperBgColor: "rgba(0,0,0,0)",
      plotBgColor: "rgba(0,0,0,0)",
      margin: { l: 60, r: 24, t: 60, b: 60 },
      ...view.layout,
    },
    source: CalculationSource.JsThermalComfort,
  });
}

export function buildGridModelChart<TPayload extends object, TResult>(
  instanceId: string,
  chartSource: ModelChartSource<TPayload> | null,
  resultsByInput: Partial<Record<InputIdType, TResult | null>>,
  context: ChartBuildContext<NumericBand>,
  spec: GridModelChartSpec<TPayload, TResult>,
): PlotlyChartSpec | null {
  if (!chartSource) {
    return null;
  }

  const inputsMap = chartSource.inputs;
  const baselinePayload = getBaselineInputEntry(
    inputsMap,
    context.baselineInputId,
  ).payload;
  const config = context.fieldChartConfig;

  if (spec.fixedView && instanceId === spec.fixedView.instanceId) {
    return buildGridModelView(
      inputsMap,
      resultsByInput,
      baselinePayload,
      context,
      spec,
      {
        title: spec.fixedView.title,
        config: {
          ...config,
          xField: spec.fixedView.xField,
          yField: spec.fixedView.yField,
        },
        xRangeSi: spec.fixedView.xRangeSi,
        yRangeSi: spec.fixedView.yRangeSi,
        hoverTemplateSuffix:
          spec.dynamicHoverExtension?.getTemplateSuffix(context.unitSystem) ?? "",
      },
    );
  }

  if (instanceId === spec.instanceId) {
    const resolvedOutput = resolveGridOutput(
      spec as GridModelChartSpec<object, unknown>,
      config.zOutput,
    );
    return buildGridModelView(
      inputsMap,
      resultsByInput,
      baselinePayload,
      context,
      spec,
      {
        title: `${spec.dynamicTitle} — ${resolvedOutput.label}`,
        config,
        xRangeSi: getAxisRange(config.xField, spec.axisRanges),
        yRangeSi: getAxisRange(config.yField, spec.axisRanges),
        hoverTemplateSuffix:
          spec.dynamicHoverExtension?.getTemplateSuffix(context.unitSystem) ?? "",
        layout: spec.dynamicViewLayout,
      },
    );
  }

  return null;
}
