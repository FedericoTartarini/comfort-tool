import { CalculationSource } from "../../../catalog/calculationMetadata";
import {
  getPhysicalQuantityMeta,
  type ChartAxisQuantityId,
  type PhysicalQuantityId as PhysicalQuantityIdType,
} from "../../../catalog/quantities";
import type {
  CompareInputMap,
  ModelChartSource,
} from "../../../catalog/chartSource";
import type {
  PlotHoverValue,
} from "../../plotlyTypes";
import type { InputId as InputIdType } from "../../../catalog/inputSlots";
import { ChartBuildContext, ModelOutput, NumericBand, NumericFieldChartConfig, findNumericBandIndexForValue } from "../../../catalog/modelCapabilities";
import type { UnitSystem as UnitSystemType } from "../../../catalog/units";
import type { FieldRequestAdapter } from "../requestMapping";
import {
  convertQuantityFromSi,
  getQuantityDisplayMeta,
  plotlyHoverNumber,
} from "../../units";
import type { ChartPlotlyBuild } from "./chartBuildResult";
import { createDisplayHoverProbe } from "./hoverProbe";
import { buildHoverTemplate } from "./plotlyBuilders";
import {
  buildFieldChart,
  createEmptyFieldStrategy,
  createFieldChartAxis,
  type FieldChartInputGroup,
  type FieldChartLayoutSpec,
} from "./fieldChartEngine";
import { buildIsolineBandOverlayTraces } from "./isolineBandOverlays";
import { getBaselineInputEntry } from "../helpers";
import {
  CHART_COORDINATE_TOLERANCE,
  type ChartRange,
} from "./types";

const EMPTY_AXIS_POINTS = 2;

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
    outputKey: PhysicalQuantityIdType,
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
  zOutput: PhysicalQuantityIdType,
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

function buildGridPointHoverTemplate(options: {
  inputLabel: string | null;
  xAxisLabel: string;
  xAxisUnits: string;
  yAxisLabel: string;
  yAxisUnits: string;
  bandLabel: string;
  selectedBandLabel: string;
  outputLabel: string;
  outputUnits: string;
  hoverTemplateSuffix: string;
}): string {
  return buildHoverTemplate([
    options.inputLabel,
    `${options.xAxisLabel}: ${plotlyHoverNumber("x")} ${options.xAxisUnits}`,
    `${options.yAxisLabel}: ${plotlyHoverNumber("y")} ${options.yAxisUnits}`,
    `<b>${options.bandLabel}: ${options.selectedBandLabel}</b>`,
    `${options.outputLabel}: ${plotlyHoverNumber("customdata[0]")}${options.outputUnits}${options.hoverTemplateSuffix}`,
  ]);
}

function buildGridModelView<TPayload extends object, TResult>(
  inputsMap: CompareInputMap<TPayload>,
  resultsByInput: Partial<Record<InputIdType, TResult | null>>,
  baselinePayload: TPayload,
  context: ChartBuildContext<NumericBand>,
  spec: GridModelChartSpec<TPayload, TResult>,
  view: GridModelView,
): ChartPlotlyBuild {
  const { unitSystem } = context;
  const output = resolveGridOutput(
    spec as GridModelChartSpec<object, unknown>,
    view.config.zOutput,
  );
  const outputMeta = getQuantityDisplayMeta(output.key, unitSystem);
  const outputUnits = outputMeta.displayUnits ? ` ${outputMeta.displayUnits}` : "";
  const bandLabel = spec.bandLabel ?? "Band";
  const chartAxisAdapter = spec.chartAxisAdapter ?? spec.requestAdapter;
  const baselineXSi = chartAxisAdapter.getAxisValue(baselinePayload, view.config.xField);
  const baselineYSi = chartAxisAdapter.getAxisValue(baselinePayload, view.config.yField);
  const xAxisSpec = {
    field: view.config.xField,
    rangeSi: view.xRangeSi,
    points: EMPTY_AXIS_POINTS,
  };
  const yAxisSpec = {
    field: view.config.yField,
    rangeSi: view.yRangeSi,
    points: EMPTY_AXIS_POINTS,
  };
  const probeXAxis = createFieldChartAxis(xAxisSpec, unitSystem);
  const probeYAxis = createFieldChartAxis(yAxisSpec, unitSystem);
  const getResultValue = (result: TResult | null | undefined) => {
    if (result == null) return undefined;
    const valueSi = spec.getOutputValue(result, view.config.zOutput);
    if (valueSi == null || !Number.isFinite(valueSi)) return undefined;
    return valueSi;
  };
  const isPlottable = (result: TResult | null | undefined) => (
    spec.isPlottable ? spec.isPlottable(result) : getResultValue(result) !== undefined
  );
  const applyCoordinates = (payload: TPayload, xSi: number, ySi: number) => (
    spec.applyChartCoordinates
      ? spec.applyChartCoordinates(
          payload,
          view.config.xField,
          xSi,
          view.config.yField,
          ySi,
        )
      : (() => {
          spec.requestAdapter.setAxisValue(payload, view.config.xField, xSi);
          spec.requestAdapter.setAxisValue(payload, view.config.yField, ySi);
          return true;
        })()
  );
  const evaluateField = (xSi: number, ySi: number): number | null => {
    if (
      Math.abs(xSi - baselineXSi) < CHART_COORDINATE_TOLERANCE
      && Math.abs(ySi - baselineYSi) < CHART_COORDINATE_TOLERANCE
    ) {
      const cachedValue = getResultValue(resultsByInput[context.baselineInputId]);
      if (cachedValue !== undefined) return cachedValue;
    }
    const pointPayload = { ...baselinePayload };
    if (!applyCoordinates(pointPayload, xSi, ySi)) return null;
    if (spec.tryEvaluatePayload) {
      const directValue = spec.tryEvaluatePayload(pointPayload);
      return directValue == null || !Number.isFinite(directValue) ? null : directValue;
    }
    const result = spec.evaluate(pointPayload);
    const valueSi = spec.getOutputValue(result, view.config.zOutput);
    return valueSi == null || !Number.isFinite(valueSi) ? null : valueSi;
  };
  const evaluateResult = (xSi: number, ySi: number): TResult | null => {
    if (
      Math.abs(xSi - baselineXSi) < CHART_COORDINATE_TOLERANCE
      && Math.abs(ySi - baselineYSi) < CHART_COORDINATE_TOLERANCE
    ) {
      const cached = resultsByInput[context.baselineInputId];
      if (cached != null) return cached;
    }
    const pointPayload = { ...baselinePayload };
    if (!applyCoordinates(pointPayload, xSi, ySi)) return null;
    try {
      return spec.evaluate(pointPayload);
    } catch {
      return null;
    }
  };
  const specChart = buildFieldChart({
    unitSystem,
    xAxis: xAxisSpec,
    yAxis: yAxisSpec,
    strategy: createEmptyFieldStrategy(),
    chartOverlays: ({ xAxis, yAxis }) => buildIsolineBandOverlayTraces({
      bands: view.config.bands,
      outputLabel: output.label,
      evaluateField,
      xAxis,
      yAxis,
      xField: view.config.xField,
      yField: view.config.yField,
      layout: "monotonic",
    }),
    inputGroups: ({ xAxis, yAxis }) => [{
      inputsMap,
      resultsByInput,
      getXSi: (payload) => chartAxisAdapter.getAxisValue(payload, view.config.xField),
      getYSi: (payload) => chartAxisAdapter.getAxisValue(payload, view.config.yField),
      getHovertemplate: ({ inputLabel, result }) => {
        if (!isPlottable(result) && spec.outsideApplicabilityMessage) {
          return buildHoverTemplate([
            inputLabel,
            `<b>${spec.outsideApplicabilityMessage}</b>`,
          ]);
        }
        const valueSi = getResultValue(result);
        const selectedBandIndex = valueSi === undefined
          ? undefined
          : findNumericBandIndexForValue(view.config.bands, valueSi);
        const selectedBandLabel = selectedBandIndex === undefined
          ? "Unclassified"
          : view.config.bands[selectedBandIndex].label;

        return buildGridPointHoverTemplate({
          inputLabel,
          xAxisLabel: xAxis.label,
          xAxisUnits: xAxis.units,
          yAxisLabel: yAxis.label,
          yAxisUnits: yAxis.units,
          bandLabel,
          selectedBandLabel,
          outputLabel: output.label,
          outputUnits,
          hoverTemplateSuffix: view.hoverTemplateSuffix,
        });
      },
      hoverMetadata: ({ result }) => {
        const valueSi = getResultValue(result);
        return [
          valueSi === undefined
            ? ""
            : convertQuantityFromSi(output.key, valueSi, unitSystem),
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

  return {
    spec: specChart,
    hoverProbe: createDisplayHoverProbe(probeXAxis, probeYAxis, (xSi, ySi) => {
      const result = evaluateResult(xSi, ySi);
      if (!isPlottable(result) && spec.outsideApplicabilityMessage) {
        return {
          hovertemplate: buildHoverTemplate([
            `<b>${spec.outsideApplicabilityMessage}</b>`,
          ]),
        };
      }
      if (result == null && spec.tryEvaluatePayload) {
        const valueSi = evaluateField(xSi, ySi);
        if (valueSi == null) return null;
        const selectedBandIndex = findNumericBandIndexForValue(view.config.bands, valueSi);
        const selectedBandLabel = selectedBandIndex === undefined
          ? "Unclassified"
          : view.config.bands[selectedBandIndex].label;
        return {
          hovertemplate: buildGridPointHoverTemplate({
            inputLabel: null,
            xAxisLabel: probeXAxis.label,
            xAxisUnits: probeXAxis.units,
            yAxisLabel: probeYAxis.label,
            yAxisUnits: probeYAxis.units,
            bandLabel,
            selectedBandLabel,
            outputLabel: output.label,
            outputUnits,
            hoverTemplateSuffix: view.hoverTemplateSuffix,
          }),
          customdata: [
            convertQuantityFromSi(output.key, valueSi, unitSystem),
          ],
        };
      }
      if (result == null) return null;
      const valueSi = getResultValue(result);
      if (valueSi === undefined && !spec.outsideApplicabilityMessage) return null;
      const selectedBandIndex = valueSi === undefined
        ? undefined
        : findNumericBandIndexForValue(view.config.bands, valueSi);
      const selectedBandLabel = selectedBandIndex === undefined
        ? "Unclassified"
        : view.config.bands[selectedBandIndex].label;
      return {
        hovertemplate: buildGridPointHoverTemplate({
          inputLabel: null,
          xAxisLabel: probeXAxis.label,
          xAxisUnits: probeXAxis.units,
          yAxisLabel: probeYAxis.label,
          yAxisUnits: probeYAxis.units,
          bandLabel,
          selectedBandLabel,
          outputLabel: output.label,
          outputUnits,
          hoverTemplateSuffix: view.hoverTemplateSuffix,
        }),
        customdata: [
          valueSi === undefined
            ? ""
            : convertQuantityFromSi(output.key, valueSi, unitSystem),
          ...(spec.dynamicHoverExtension?.getMetadata(result, unitSystem) ?? []),
        ],
      };
    }),
  };
}

export function buildGridModelChart<TPayload extends object, TResult>(
  instanceId: string,
  chartSource: ModelChartSource<TPayload> | null,
  resultsByInput: Partial<Record<InputIdType, TResult | null>>,
  context: ChartBuildContext<NumericBand>,
  spec: GridModelChartSpec<TPayload, TResult>,
): ChartPlotlyBuild | null {
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
