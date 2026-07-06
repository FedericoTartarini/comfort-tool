/**
 * Compatibility wrapper for simple contour-based model charts.
 *
 * The shared chart engine lives in `chartEngine.ts`; this module preserves the
 * existing simple-model configuration API used by Heat Index, Humidex, and Wind Chill.
 */
import { FieldKey } from "../../../models/fieldKeys";
import { fieldMetaByKey } from "../../../models/inputFieldsMeta";
import { CalculationSource } from "../../../models/calculationMetadata";
import type { CompareInputMap, PlotlyChartResponseDto } from "../../../models/comfortDtos";
import { type UnitSystem as UnitSystemType } from "../../../models/units";
import { ThermalZone } from "../../../models/thermalZone";
import { createFieldAxisScale } from "./axis";
import { buildGridContourFieldChart } from "./chartEngine";
import { resolveBaselineInputEntry, shouldShowInputLegend } from "./inputPoints";
import { buildZoneColorscale, buildZoneContourLayers } from "./zoneGrid";
import type { ChartAxisScale, ChartRange, GridPointEvaluation } from "./types";

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

function getDynamicHovertemplate(
  xAxis: ChartAxisScale,
  yAxis: ChartAxisScale,
  hovertemplateContour?: string,
): string {
  return hovertemplateContour || `${xAxis.label}: %{x:.1f} ${xAxis.units}<br>${yAxis.label}: %{y:.1f} ${yAxis.units}<br><b>Zone: %{text}</b><extra></extra>`;
}

function getDefaultRange(key: FieldKey, customRanges?: Partial<Record<FieldKey, ChartRange>>): ChartRange {
  if (customRanges?.[key]) {
    return customRanges[key]!;
  }
  const meta = fieldMetaByKey[key];
  return { min: meta.minValue, max: meta.maxValue };
}

function buildDynamicContourChart(
  inputsMap: CompareInputMap<Record<string, any>>,
  cachedResultsByInput: any,
  unitSystem: UnitSystemType,
  dynamicXAxis: FieldKey | undefined,
  dynamicYAxis: FieldKey | undefined,
  config: {
    title: string;
    zMax: number;
    colorscale: any[][];
    getRange: (key: FieldKey) => { min: number; max: number };
    calculatePoint: (xSi: number, ySi: number, dynamicXAxis: FieldKey, dynamicYAxis: FieldKey) => { rangeValue: number; category: string; hovertext?: string };
    getHovertemplateScatter: (inputLabel: string, cached: any) => string;
    hovertemplateContour?: string;
  }
): PlotlyChartResponseDto {
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
  return buildContourZoneChart({
    inputsMap,
    cachedResultsByInput,
    title: config.title,
    xAxis,
    yAxis,
    zMax: config.zMax,
    colorscale: config.colorscale,
    hovertemplateContour: getDynamicHovertemplate(xAxis, yAxis, config.hovertemplateContour),
    calculatePoint: (xSi, ySi) => config.calculatePoint(xSi, ySi, dynamicXAxis, dynamicYAxis),
    getHovertemplateScatter: config.getHovertemplateScatter,
    getScatterXSi: (payload) => getPayloadAxisValue(payload, dynamicXAxis),
    getScatterYSi: (payload) => getPayloadAxisValue(payload, dynamicYAxis),
  });
}

export interface ModelChartConfig {
  dynamicChartId: string;
  dynamicTitle: string;
  zones: ThermalZone[];
  customRanges?: Partial<Record<FieldKey, { min: number; max: number }>>;
  baselinePayloadDefault: any;
  calculateDynamicPoint: (xSi: number, ySi: number, dynamicXAxis: FieldKey, dynamicYAxis: FieldKey, baselinePayload: any) => { rangeValue: number; category: string; hovertext?: string };
  getHovertemplateScatterDynamic: (label: string, cached: any) => string;
  hovertemplateContourDynamic?: string;

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
  config: ModelChartConfig
): PlotlyChartResponseDto | null {
  if (!chartSource) return null;
  const sharedChartRequest = chartSource.chartRequest;

  if (chartId === config.dynamicChartId) {
    const baselinePayload =
      resolveBaselineInputEntry(sharedChartRequest, chartSource.baselineInputId)?.payload
      ?? config.baselinePayloadDefault;

    return buildDynamicContourChart(
      sharedChartRequest,
      resultsByInput,
      unitSystem,
      chartSource.dynamicXAxis as FieldKey,
      chartSource.dynamicYAxis as FieldKey,
      {
        title: config.dynamicTitle,
        zMax: config.zones.length - 1,
        colorscale: buildZoneColorscale(config.zones),
        getRange: (key: FieldKey) => getDefaultRange(key, config.customRanges),
        calculatePoint: (xSi, ySi, dynamicXAxis, dynamicYAxis) => {
          return config.calculateDynamicPoint(xSi, ySi, dynamicXAxis, dynamicYAxis, baselinePayload);
        },
        getHovertemplateScatter: config.getHovertemplateScatterDynamic,
        hovertemplateContour: config.hovertemplateContourDynamic,
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
