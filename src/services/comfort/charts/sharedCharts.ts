/**
 * Compatibility wrapper for simple contour-based model charts.
 *
 * The shared chart engine lives in `chartEngine.ts`; this module preserves the
 * existing simple-model configuration API used by Heat Index, Humidex, and Wind Chill.
 */
import { FieldKey } from "../../../models/fieldKeys";
import { fieldMetaByKey } from "../../../models/inputFieldsMeta";
import { CalculationSource } from "../../../models/calculationMetadata";
import {
  findNumericBandIndexForValue,
  type ExploreFieldChartConfig,
  type ModelOutput,
  type ModelOutputKey,
} from "../../../models/modelCapabilities";
import type { CompareInputMap, PlotlyChartResponseDto } from "../../../models/comfortDtos";
import { type UnitSystem as UnitSystemType } from "../../../models/units";
import { ThermalZone } from "../../../models/thermalZone";
import { createFieldAxisScale } from "./axis";
import {
  buildBandedGridFieldChart,
  buildGridContourFieldChart,
  type BandedGridOutputEvaluation,
} from "./chartEngine";
import { resolveBaselineInputEntry, shouldShowInputLegend } from "./inputPoints";
import { buildZoneColorscale, buildZoneContourLayers } from "./zoneGrid";
import type { ChartAxisScale, ChartRange, GridPointEvaluation } from "./types";
import {
  convertModelOutputFromSi,
  getModelOutputDisplayMeta,
} from "../../units";

function getPayloadAxisValue(payload: Record<string, any>, key: FieldKey): number {
  if (key === FieldKey.RelativeAirSpeed || key === FieldKey.WindSpeed) {
    return payload.v || 0;
  }
  return payload[key] || 0;
}

type ContourPointResult = {
  rangeValue: number;
  category: string;
  hovertext?: string;
};

interface ContourZoneChartOptions {
  inputsMap: CompareInputMap<Record<string, any>>;
  cachedResultsByInput: any;
  title: string;
  xAxis: ChartAxisScale;
  yAxis: ChartAxisScale;
  zMax: number;
  colorscale: Array<[number, string]>;
  hovertemplateContour: string;
  calculatePoint: (xSi: number, ySi: number) => ContourPointResult;
  getHovertemplateScatter: (inputLabel: string, cached: any) => string;
  getScatterXSi: (payload: any) => number;
  getScatterYSi: (payload: any) => number;
}

function getRangeContour(zMax: number, coloring: "fill" | "none", showlines: boolean) {
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

function buildContourPoint(result: ContourPointResult): GridPointEvaluation {
  return {
    z: result.rangeValue,
    text: result.hovertext || result.category,
  };
}

function buildContourZoneChart({
  inputsMap,
  cachedResultsByInput,
  title,
  xAxis,
  yAxis,
  zMax,
  colorscale,
  hovertemplateContour,
  calculatePoint,
  getHovertemplateScatter,
  getScatterXSi,
  getScatterYSi,
}: ContourZoneChartOptions): PlotlyChartResponseDto {
  return buildGridContourFieldChart({
    xAxis,
    yAxis,
    grid: {
      evaluatePoint: (xSi, ySi) => buildContourPoint(calculatePoint(xSi, ySi)),
      layers: buildZoneContourLayers({
        name: title,
        colorscale,
        zmin: 0,
        zmax: zMax,
        contours: getRangeContour(zMax, "fill", false),
        hovertemplate: hovertemplateContour,
        isBackgroundZone: true,
        includeHoverMetadata: false,
        boundaryLayer: {
          contours: getRangeContour(zMax, "none", true),
        },
      }),
    },
    inputGroups: [{
      inputsMap,
      resultsByInput: cachedResultsByInput,
      xAxis,
      yAxis,
      getXSi: (payload) => getScatterXSi(payload),
      getYSi: (payload) => getScatterYSi(payload),
      getHovertemplate: ({ inputLabel, result }) => getHovertemplateScatter(inputLabel, result),
    }],
    layout: {
      title,
      xAxis,
      yAxis,
      paperBgColor: "rgba(0,0,0,0)",
      plotBgColor: "rgba(0,0,0,0)",
      showLegend: shouldShowInputLegend(inputsMap),
      margin: { l: 60, r: 24, t: 60, b: 60 },
    },
    source: CalculationSource.JsThermalComfort,
  });
}

function buildStaticContourChart(
  inputsMap: CompareInputMap<Record<string, any>>,
  cachedResultsByInput: any,
  unitSystem: UnitSystemType,
  config: {
    title: string;
    xKey: FieldKey;
    yKey: FieldKey;
    xRangeSi: { min: number; max: number };
    yRangeSi: { min: number; max: number };
    zMax: number;
    colorscale: any[][];
    hovertemplateContour: string;
    getHovertemplateScatter: (inputLabel: string, cached: any) => string;
    getScatterXSi: (payload: any) => number;
    getScatterYSi: (payload: any) => number;
    calculatePoint: (xSi: number, ySi: number) => { rangeValue: number; category: string; hovertext?: string };
  }
): PlotlyChartResponseDto {
  const xAxis = createFieldAxisScale({
    field: config.xKey,
    unitSystem,
    rangeSi: config.xRangeSi,
    points: 300,
  });
  const yAxis = createFieldAxisScale({
    field: config.yKey,
    unitSystem,
    rangeSi: config.yRangeSi,
    points: 300,
  });
  return buildContourZoneChart({
    inputsMap,
    cachedResultsByInput,
    title: config.title,
    xAxis,
    yAxis,
    zMax: config.zMax,
    colorscale: config.colorscale,
    hovertemplateContour: config.hovertemplateContour,
    calculatePoint: config.calculatePoint,
    getHovertemplateScatter: config.getHovertemplateScatter,
    getScatterXSi: config.getScatterXSi,
    getScatterYSi: config.getScatterYSi,
  });
}

function buildDynamicAxes(
  unitSystem: UnitSystemType,
  dynamicXAxis: FieldKey,
  dynamicYAxis: FieldKey,
  getRange: (key: FieldKey) => ChartRange,
): { xAxis: ChartAxisScale; yAxis: ChartAxisScale } {
  return {
    xAxis: createFieldAxisScale({
      field: dynamicXAxis,
      unitSystem,
      rangeSi: getRange(dynamicXAxis),
      points: 300,
    }),
    yAxis: createFieldAxisScale({
      field: dynamicYAxis,
      unitSystem,
      rangeSi: getRange(dynamicYAxis),
      points: 300,
    }),
  };
}

function getDefaultRange(key: FieldKey, customRanges?: Partial<Record<FieldKey, ChartRange>>): ChartRange {
  if (customRanges?.[key]) {
    return customRanges[key]!;
  }
  const meta = fieldMetaByKey[key];
  return { min: meta.minValue, max: meta.maxValue };
}

export interface DynamicHoverExtension {
  templateSuffix: string;
  getInputMetadata: (cached: any) => readonly unknown[];
}

function buildDynamicExploreChart(
  inputsMap: CompareInputMap<Record<string, any>>,
  cachedResultsByInput: any,
  unitSystem: UnitSystemType,
  fieldChartConfig: ExploreFieldChartConfig,
  config: {
    title: string;
    output: ModelOutput;
    bandLabel?: string;
    dynamicHoverExtension?: DynamicHoverExtension;
    getRange: (key: FieldKey) => { min: number; max: number };
    calculateOutput: (
      xSi: number,
      ySi: number,
      dynamicXAxis: FieldKey,
      dynamicYAxis: FieldKey,
      zOutput: ModelOutputKey,
    ) => number | BandedGridOutputEvaluation;
    getResultOutputValue: (cached: any, zOutput: ModelOutputKey) => number | undefined;
  }
): PlotlyChartResponseDto {
  const dynamicXAxis = fieldChartConfig.xField;
  const dynamicYAxis = fieldChartConfig.yField;
  if (!dynamicXAxis || !dynamicYAxis || dynamicXAxis === dynamicYAxis) {
    return {
      traces: [],
      layout: {
        title: "Invalid Axes",
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        showlegend: false,
        margin: { l: 60, r: 24, t: 60, b: 60 },
        xaxis: {},
        yaxis: {},
      },
      annotations: [],
      source: CalculationSource.JsThermalComfort,
    };
  }

  const { xAxis, yAxis } = buildDynamicAxes(unitSystem, dynamicXAxis, dynamicYAxis, config.getRange);
  const outputMeta = getModelOutputDisplayMeta(config.output.key, unitSystem);
  const outputUnits = outputMeta.displayUnits ? ` ${outputMeta.displayUnits}` : "";
  const bandLabel = config.bandLabel ?? "Band";

  return buildBandedGridFieldChart({
    config: fieldChartConfig,
    output: config.output,
    unitSystem,
    bandLabel,
    hoverTemplateSuffix: config.dynamicHoverExtension?.templateSuffix,
    xAxis,
    yAxis,
    evaluateOutput: (xSi, ySi, zOutput) => (
      config.calculateOutput(xSi, ySi, dynamicXAxis, dynamicYAxis, zOutput)
    ),
    inputGroups: [{
      inputsMap,
      resultsByInput: cachedResultsByInput,
      xAxis,
      yAxis,
      getXSi: (payload) => getPayloadAxisValue(payload, dynamicXAxis),
      getYSi: (payload) => getPayloadAxisValue(payload, dynamicYAxis),
      getHovertemplate: ({ inputLabel, result }) => {
        const valueSi = config.getResultOutputValue(result, fieldChartConfig.zOutput);
        const bandIndex = valueSi === undefined
          ? undefined
          : findNumericBandIndexForValue(fieldChartConfig.bands, valueSi);
        const selectedBandLabel = bandIndex === undefined
          ? "Unclassified"
          : fieldChartConfig.bands[bandIndex].label;

        return `${inputLabel}<br>${xAxis.label}: %{x:.${xAxis.decimals ?? 2}f} ${xAxis.units}<br>${yAxis.label}: %{y:.${yAxis.decimals ?? 2}f} ${yAxis.units}<br><b>${bandLabel}: ${selectedBandLabel}</b><br>${config.output.label}: %{customdata[0]:.${outputMeta.decimals}f}${outputUnits}${config.dynamicHoverExtension?.templateSuffix ?? ""}<extra></extra>`;
      },
      hoverMetadata: ({ result }) => {
        const valueSi = config.getResultOutputValue(result, fieldChartConfig.zOutput);

        return [
          valueSi === undefined
            ? ""
            : convertModelOutputFromSi(config.output.key, valueSi, unitSystem),
          ...(config.dynamicHoverExtension?.getInputMetadata(result) ?? []),
        ];
      },
    }],
    layout: {
      title: config.title,
      xAxis,
      yAxis,
      paperBgColor: "rgba(0,0,0,0)",
      plotBgColor: "rgba(0,0,0,0)",
      showLegend: shouldShowInputLegend(inputsMap),
      margin: { l: 60, r: 24, t: 60, b: 60 },
    },
    source: CalculationSource.JsThermalComfort,
  });
}

export interface ModelChartConfig {
  dynamicChartId: string;
  dynamicTitle: string;
  output: ModelOutput;
  zones: ThermalZone[];
  bandLabel?: string;
  dynamicHoverExtension?: DynamicHoverExtension;
  customRanges?: Partial<Record<FieldKey, { min: number; max: number }>>;
  baselinePayloadDefault: any;
  calculateDynamicOutput: (
    xSi: number,
    ySi: number,
    dynamicXAxis: FieldKey,
    dynamicYAxis: FieldKey,
    baselinePayload: any,
    zOutput: ModelOutputKey,
  ) => number | BandedGridOutputEvaluation;
  getResultOutputValue: (cached: any, zOutput: ModelOutputKey) => number | undefined;

  staticConfig?: {
    title: string;
    xKey: FieldKey;
    yKey: FieldKey;
    xRangeSi: { min: number; max: number };
    yRangeSi: { min: number; max: number };
    hovertemplateContour: string;
    getHovertemplateScatter: (label: string, cached: any) => string;
    getScatterXSi: (payload: any) => number;
    getScatterYSi: (payload: any) => number;
    calculateStaticPoint: (xSi: number, ySi: number) => { rangeValue: number; category: string; hovertext?: string };
  };
}

export function buildComfortModelChart(
  chartId: string,
  chartSource: any,
  resultsByInput: any,
  unitSystem: UnitSystemType,
  fieldChartConfig: ExploreFieldChartConfig | null | undefined,
  config: ModelChartConfig
): PlotlyChartResponseDto | null {
  if (!chartSource) return null;
  const sharedChartRequest = chartSource.chartRequest;

  if (chartId === config.dynamicChartId) {
    if (!fieldChartConfig || fieldChartConfig.zOutput !== config.output.key) {
      return null;
    }
    const baselinePayload =
      resolveBaselineInputEntry(sharedChartRequest, chartSource.baselineInputId)?.payload
      ?? config.baselinePayloadDefault;

    return buildDynamicExploreChart(
      sharedChartRequest,
      resultsByInput,
      unitSystem,
      fieldChartConfig,
      {
        title: `${config.dynamicTitle} — ${config.output.label}`,
        output: config.output,
        bandLabel: config.bandLabel,
        dynamicHoverExtension: config.dynamicHoverExtension,
        getRange: (key: FieldKey) => getDefaultRange(key, config.customRanges),
        calculateOutput: (xSi, ySi, dynamicXAxis, dynamicYAxis, zOutput) => {
          return config.calculateDynamicOutput(
            xSi,
            ySi,
            dynamicXAxis,
            dynamicYAxis,
            baselinePayload,
            zOutput,
          );
        },
        getResultOutputValue: config.getResultOutputValue,
      }
    );
  }

  if (config.staticConfig) {
    return buildStaticContourChart(sharedChartRequest, resultsByInput, unitSystem, {
      title: config.staticConfig.title,
      xKey: config.staticConfig.xKey,
      yKey: config.staticConfig.yKey,
      xRangeSi: config.staticConfig.xRangeSi,
      yRangeSi: config.staticConfig.yRangeSi,
      zMax: config.zones.length - 1,
      colorscale: buildZoneColorscale(config.zones),
      hovertemplateContour: config.staticConfig.hovertemplateContour,
      getHovertemplateScatter: config.staticConfig.getHovertemplateScatter,
      getScatterXSi: config.staticConfig.getScatterXSi,
      getScatterYSi: config.staticConfig.getScatterYSi,
      calculatePoint: config.staticConfig.calculateStaticPoint,
    });
  }

  return null;
}
