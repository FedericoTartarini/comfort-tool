import { CalculationSource } from "../../../models/calculationMetadata";
import type { ChartId as ChartIdType } from "../../../models/chartOptions";
import type { CompareInputMap, PlotlyChartResponseDto } from "../../../models/comfortDtos";
import type { FieldKey as FieldKeyType } from "../../../models/fieldKeys";
import { fieldMetaByKey } from "../../../models/inputFieldsMeta";
import type { InputId as InputIdType } from "../../../models/inputSlots";
import type {
  ChartBuildContext,
  GridFieldChartConfig,
  ModelOutput,
} from "../../../models/modelCapabilities";
import {
  ChartMode,
  findNumericBandIndexForValue,
} from "../../../models/modelCapabilities";
import type { UnitSystem as UnitSystemType } from "../../../models/units";
import {
  convertModelOutputFromSi,
  getModelOutputDisplayMeta,
} from "../../units";
import { createFieldAxisScale } from "./axis";
import {
  buildGridFieldChart,
  createBandedGridStrategy,
  type BandedGridOutputEvaluation,
  type FieldChartInputGroup,
} from "./chartEngine";
import { getBaselineInputEntry, shouldShowInputLegend } from "./inputPoints";
import type { ChartRange } from "./types";

export interface GridModelChartSource<TPayload> {
  chartRequest: CompareInputMap<TPayload>;
}

export interface GridModelDynamicHoverExtension<TResult> {
  getTemplateSuffix: (unitSystem: UnitSystemType) => string;
  getMetadata: (
    result: TResult | null | undefined,
    unitSystem: UnitSystemType,
  ) => readonly unknown[];
}

export interface GridModelFixedViewSpec {
  chartId: ChartIdType;
  title: string;
  xField: FieldKeyType;
  yField: FieldKeyType;
  xRangeSi: ChartRange;
  yRangeSi: ChartRange;
}

export interface GridModelChartSpec<TPayload extends object, TResult> {
  dynamicChartId: ChartIdType;
  dynamicTitle: string;
  output: ModelOutput;
  bandLabel?: string;
  dynamicHoverExtension?: GridModelDynamicHoverExtension<TResult>;
  axisRanges?: Partial<Record<FieldKeyType, ChartRange>>;
  getAxisValue: (payload: TPayload, field: FieldKeyType) => number;
  setAxisValue: (payload: TPayload, field: FieldKeyType, valueSi: number) => void;
  evaluate: (payload: TPayload) => TResult;
  getOutputValue: (result: TResult) => number;
  fixedView?: GridModelFixedViewSpec;
}

interface GridModelView {
  title: string;
  config: GridFieldChartConfig;
  xRangeSi: ChartRange;
  yRangeSi: ChartRange;
  hoverTemplateSuffix: string;
}

function getAxisRange(
  field: FieldKeyType,
  ranges?: Partial<Record<FieldKeyType, ChartRange>>,
): ChartRange {
  return ranges?.[field] ?? {
    min: fieldMetaByKey[field].minValue,
    max: fieldMetaByKey[field].maxValue,
  };
}

function buildGridModelView<TPayload extends object, TResult>(
  inputsMap: CompareInputMap<TPayload>,
  resultsByInput: Partial<Record<InputIdType, TResult | null>>,
  baselinePayload: TPayload,
  context: ChartBuildContext,
  spec: GridModelChartSpec<TPayload, TResult>,
  view: GridModelView,
): PlotlyChartResponseDto {
  const { unitSystem } = context;
  if (view.config.zOutput !== spec.output.key) {
    throw new Error(`Unsupported grid-model chart output: ${view.config.zOutput}.`);
  }
  const output = spec.output;
  const xAxis = createFieldAxisScale({
    field: view.config.xField,
    unitSystem,
    rangeSi: view.xRangeSi,
    points: 300,
  });
  const yAxis = createFieldAxisScale({
    field: view.config.yField,
    unitSystem,
    rangeSi: view.yRangeSi,
    points: 300,
  });
  const outputMeta = getModelOutputDisplayMeta(output.key, unitSystem);
  const outputUnits = outputMeta.displayUnits ? ` ${outputMeta.displayUnits}` : "";
  const bandLabel = spec.bandLabel ?? "Band";
  const getResultValue = (result: TResult | null | undefined) => (
    result == null ? undefined : spec.getOutputValue(result)
  );
  const inputGroup: FieldChartInputGroup<TPayload, TResult> = {
    inputsMap,
    resultsByInput,
    getXSi: (payload) => spec.getAxisValue(payload, view.config.xField),
    getYSi: (payload) => spec.getAxisValue(payload, view.config.yField),
    getHovertemplate: ({ inputLabel, result }) => {
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
  };

  return buildGridFieldChart({
    xAxis,
    yAxis,
    grid: createBandedGridStrategy({
      config: view.config,
      output,
      unitSystem,
      bandLabel,
      hoverTemplateSuffix: view.hoverTemplateSuffix,
      xAxis,
      yAxis,
      evaluateOutput: (xSi, ySi) => {
        const pointPayload = { ...baselinePayload };
        spec.setAxisValue(pointPayload, view.config.xField, xSi);
        spec.setAxisValue(pointPayload, view.config.yField, ySi);
        const result = spec.evaluate(pointPayload);
        const valueSi = spec.getOutputValue(result);
        const additionalHoverMetadata = spec.dynamicHoverExtension
          ?.getMetadata(result, unitSystem);

        return additionalHoverMetadata
          ? { valueSi, additionalHoverMetadata } satisfies BandedGridOutputEvaluation
          : valueSi;
      },
    }),
    inputGroups: [inputGroup],
    layout: {
      title: view.title,
      height: 480,
      paperBgColor: "rgba(0,0,0,0)",
      plotBgColor: "rgba(0,0,0,0)",
      showLegend: shouldShowInputLegend(inputsMap),
      margin: { l: 60, r: 24, t: 60, b: 60 },
    },
    source: CalculationSource.JsThermalComfort,
  });
}

export function buildGridModelChart<TPayload extends object, TResult>(
  chartId: ChartIdType,
  chartSource: GridModelChartSource<TPayload> | null,
  resultsByInput: Partial<Record<InputIdType, TResult | null>>,
  context: ChartBuildContext,
  spec: GridModelChartSpec<TPayload, TResult>,
): PlotlyChartResponseDto | null {
  if (!chartSource) {
    return null;
  }

  const inputsMap = chartSource.chartRequest;
  const baselinePayload = getBaselineInputEntry(
    inputsMap,
    context.baselineInputId,
  ).payload;

  if (chartId === spec.dynamicChartId) {
    const config = context.fieldChartConfig;
    if (config?.mode !== ChartMode.Explore) {
      return null;
    }
    return buildGridModelView(
      inputsMap,
      resultsByInput,
      baselinePayload,
      context,
      spec,
      {
        title: `${spec.dynamicTitle} — ${spec.output.label}`,
        config,
        xRangeSi: getAxisRange(config.xField, spec.axisRanges),
        yRangeSi: getAxisRange(config.yField, spec.axisRanges),
        hoverTemplateSuffix:
          spec.dynamicHoverExtension?.getTemplateSuffix(context.unitSystem) ?? "",
      },
    );
  }

  if (spec.fixedView && chartId === spec.fixedView.chartId) {
    return buildGridModelView(
      inputsMap,
      resultsByInput,
      baselinePayload,
      context,
      spec,
      {
        title: spec.fixedView.title,
        config: {
          mode: ChartMode.Explore,
          xField: spec.fixedView.xField,
          yField: spec.fixedView.yField,
          zOutput: spec.output.key,
          bands: spec.output.defaultBands,
        },
        xRangeSi: spec.fixedView.xRangeSi,
        yRangeSi: spec.fixedView.yRangeSi,
        hoverTemplateSuffix:
          spec.dynamicHoverExtension?.getTemplateSuffix(context.unitSystem) ?? "",
      },
    );
  }

  return null;
}
