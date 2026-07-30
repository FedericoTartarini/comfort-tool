import { CalculationSource } from "../../../models/calculationMetadata";
import type { ChartId as ChartIdType } from "../../../models/chartOptions";
import type { CompareInputMap, PlotlyChartResponseDto } from "../../../models/comfortDtos";
import type { FieldKey as FieldKeyType } from "../../../models/fieldKeys";
import { fieldMetaByKey } from "../../../models/inputFieldsMeta";
import {
  ChartMode,
  findNumericBandIndexForValue,
  type ExploreFieldChartConfig,
  type FieldChartConfig,
  type ModelOutput,
} from "../../../models/modelCapabilities";
import type { InputId as InputIdType } from "../../../models/inputSlots";
import type { ThermalZone } from "../../../models/thermalZone";
import type { UnitSystem as UnitSystemType } from "../../../models/units";
import { convertModelOutputFromSi, getModelOutputDisplayMeta } from "../../units";
import { createFieldAxisScale } from "./axis";
import {
  buildBandedGridFieldChart,
  buildGridContourFieldChart,
  type BandedGridOutputEvaluation,
} from "./chartEngine";
import { resolveBaselineInputEntry, shouldShowInputLegend } from "./inputPoints";
import { buildZoneColorscale, buildZoneContourLayers } from "./zoneGrid";
import type { ChartRange, GridPointEvaluation } from "./types";

export interface GridModelChartSource<TPayload> {
  chartRequest: CompareInputMap<TPayload>;
  baselineInputId?: InputIdType;
}

export interface GridModelContourPoint {
  rangeValue: number;
  category: string;
  hovertext?: string;
}

export interface GridModelDynamicHoverExtension<TResult> {
  templateSuffix: string;
  getMetadata: (result: TResult | null | undefined) => readonly unknown[];
}

export interface GridModelStaticChartSpec<TPayload, TResult> {
  chartId: ChartIdType;
  title: string;
  xField: FieldKeyType;
  yField: FieldKeyType;
  xRangeSi: ChartRange;
  yRangeSi: ChartRange;
  hovertemplate: string;
  getInputHovertemplate: (inputLabel: string, result: TResult | null | undefined) => string;
  getXValue: (payload: TPayload) => number;
  getYValue: (payload: TPayload) => number;
  evaluatePoint: (xSi: number, ySi: number) => GridModelContourPoint;
}

export interface GridModelChartSpec<TPayload extends object, TResult> {
  dynamicChartId: ChartIdType;
  dynamicTitle: string;
  output: ModelOutput;
  zones: readonly ThermalZone[];
  bandLabel?: string;
  dynamicHoverExtension?: GridModelDynamicHoverExtension<TResult>;
  axisRanges?: Partial<Record<FieldKeyType, ChartRange>>;
  baselinePayloadDefault: TPayload;
  getAxisValue: (payload: TPayload, field: FieldKeyType) => number;
  setAxisValue: (payload: TPayload, field: FieldKeyType, valueSi: number) => void;
  evaluate: (payload: TPayload) => TResult;
  getOutputValue: (result: TResult) => number;
  staticChart?: GridModelStaticChartSpec<TPayload, TResult>;
}

function getRange(
  field: FieldKeyType,
  ranges?: Partial<Record<FieldKeyType, ChartRange>>,
): ChartRange {
  return ranges?.[field] ?? {
    min: fieldMetaByKey[field].minValue,
    max: fieldMetaByKey[field].maxValue,
  };
}

function getRangeContour(
  zMax: number,
  coloring: "fill" | "none",
  showlines: boolean,
) {
  return {
    coloring,
    showlines,
    type: "levels",
    start: 0.5,
    end: zMax - 0.5,
    size: 1,
    smoothing: 1.3,
    line: { width: 1, color: "#333333" },
  };
}

function toGridPoint(result: GridModelContourPoint): GridPointEvaluation {
  return {
    z: result.rangeValue,
    text: result.hovertext ?? result.category,
  };
}

function buildStaticChart<TPayload extends object, TResult>(
  inputsMap: CompareInputMap<TPayload>,
  resultsByInput: Partial<Record<InputIdType, TResult | null>>,
  unitSystem: UnitSystemType,
  spec: GridModelChartSpec<TPayload, TResult>,
  staticChart: GridModelStaticChartSpec<TPayload, TResult>,
): PlotlyChartResponseDto {
  const xAxis = createFieldAxisScale({
    field: staticChart.xField,
    unitSystem,
    rangeSi: staticChart.xRangeSi,
    points: 300,
  });
  const yAxis = createFieldAxisScale({
    field: staticChart.yField,
    unitSystem,
    rangeSi: staticChart.yRangeSi,
    points: 300,
  });
  const zMax = spec.zones.length - 1;

  return buildGridContourFieldChart({
    xAxis,
    yAxis,
    grid: {
      evaluatePoint: (xSi, ySi) => toGridPoint(
        staticChart.evaluatePoint(xSi, ySi),
      ),
      layers: buildZoneContourLayers({
        name: staticChart.title,
        colorscale: buildZoneColorscale(spec.zones),
        zmin: 0,
        zmax: zMax,
        contours: getRangeContour(zMax, "fill", false),
        hovertemplate: staticChart.hovertemplate,
        isBackgroundZone: true,
        includeHoverMetadata: false,
        boundaryLayer: {
          contours: getRangeContour(zMax, "none", true),
        },
      }),
    },
    inputGroups: [{
      inputsMap,
      resultsByInput,
      xAxis,
      yAxis,
      getXSi: staticChart.getXValue,
      getYSi: staticChart.getYValue,
      getHovertemplate: ({ inputLabel, result }) => (
        staticChart.getInputHovertemplate(inputLabel, result)
      ),
    }],
    layout: {
      title: staticChart.title,
      xAxis,
      yAxis,
      height: 480,
      paperBgColor: "rgba(0,0,0,0)",
      plotBgColor: "rgba(0,0,0,0)",
      showLegend: shouldShowInputLegend(inputsMap),
      margin: { l: 60, r: 24, t: 60, b: 60 },
    },
    source: CalculationSource.JsThermalComfort,
  });
}

function buildDynamicChart<TPayload extends object, TResult>(
  inputsMap: CompareInputMap<TPayload>,
  resultsByInput: Partial<Record<InputIdType, TResult | null>>,
  baselinePayload: TPayload,
  unitSystem: UnitSystemType,
  config: ExploreFieldChartConfig,
  spec: GridModelChartSpec<TPayload, TResult>,
): PlotlyChartResponseDto {
  if (config.xField === config.yField) {
    throw new Error("Grid model chart axes must be distinct");
  }

  const xAxis = createFieldAxisScale({
    field: config.xField,
    unitSystem,
    rangeSi: getRange(config.xField, spec.axisRanges),
    points: 300,
  });
  const yAxis = createFieldAxisScale({
    field: config.yField,
    unitSystem,
    rangeSi: getRange(config.yField, spec.axisRanges),
    points: 300,
  });
  const outputMeta = getModelOutputDisplayMeta(spec.output.key, unitSystem);
  const outputUnits = outputMeta.displayUnits ? ` ${outputMeta.displayUnits}` : "";
  const bandLabel = spec.bandLabel ?? "Band";
  const getResultValue = (result: TResult | null | undefined) => (
    result == null ? undefined : spec.getOutputValue(result)
  );

  return buildBandedGridFieldChart({
    config,
    output: spec.output,
    unitSystem,
    bandLabel,
    hoverTemplateSuffix: spec.dynamicHoverExtension?.templateSuffix,
    xAxis,
    yAxis,
    evaluateOutput: (xSi, ySi) => {
      const pointPayload = { ...baselinePayload };
      spec.setAxisValue(pointPayload, config.xField, xSi);
      spec.setAxisValue(pointPayload, config.yField, ySi);
      const result = spec.evaluate(pointPayload);
      const valueSi = spec.getOutputValue(result);
      const additionalHoverMetadata = spec.dynamicHoverExtension
        ?.getMetadata(result);

      return additionalHoverMetadata
        ? {
            valueSi,
            additionalHoverMetadata,
          } satisfies BandedGridOutputEvaluation
        : valueSi;
    },
    inputGroups: [{
      inputsMap,
      resultsByInput,
      xAxis,
      yAxis,
      getXSi: (payload) => spec.getAxisValue(payload, config.xField),
      getYSi: (payload) => spec.getAxisValue(payload, config.yField),
      getHovertemplate: ({ inputLabel, result }) => {
        const valueSi = getResultValue(result);
        const bandIndex = valueSi === undefined
          ? undefined
          : findNumericBandIndexForValue(config.bands, valueSi);
        const selectedBandLabel = bandIndex === undefined
          ? "Unclassified"
          : config.bands[bandIndex].label;

        return `${inputLabel}<br>${xAxis.label}: %{x:.${xAxis.decimals ?? 2}f} ${xAxis.units}<br>${yAxis.label}: %{y:.${yAxis.decimals ?? 2}f} ${yAxis.units}<br><b>${bandLabel}: ${selectedBandLabel}</b><br>${spec.output.label}: %{customdata[0]:.${outputMeta.decimals}f}${outputUnits}${spec.dynamicHoverExtension?.templateSuffix ?? ""}<extra></extra>`;
      },
      hoverMetadata: ({ result }) => {
        const valueSi = getResultValue(result);
        return [
          valueSi === undefined
            ? ""
            : convertModelOutputFromSi(spec.output.key, valueSi, unitSystem),
          ...(spec.dynamicHoverExtension?.getMetadata(result) ?? []),
        ];
      },
    }],
    layout: {
      title: `${spec.dynamicTitle} — ${spec.output.label}`,
      xAxis,
      yAxis,
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
  unitSystem: UnitSystemType,
  fieldChartConfig: FieldChartConfig | null | undefined,
  spec: GridModelChartSpec<TPayload, TResult>,
): PlotlyChartResponseDto | null {
  if (!chartSource) return null;

  if (chartId === spec.dynamicChartId) {
    if (fieldChartConfig?.mode !== ChartMode.Explore) {
      return null;
    }
    const baselinePayload = resolveBaselineInputEntry(
      chartSource.chartRequest,
      chartSource.baselineInputId,
    )?.payload ?? spec.baselinePayloadDefault;

    return buildDynamicChart(
      chartSource.chartRequest,
      resultsByInput,
      baselinePayload,
      unitSystem,
      fieldChartConfig,
      spec,
    );
  }

  if (spec.staticChart && chartId === spec.staticChart.chartId) {
    return buildStaticChart(
      chartSource.chartRequest,
      resultsByInput,
      unitSystem,
      spec,
      spec.staticChart,
    );
  }

  return null;
}
