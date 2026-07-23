/**
 * @file utci.ts
 * @description Configuration, calculation, and charting service for the UTCI (Universal Thermal Climate Index) comfort model.
 */

import { utci, t_o } from "jsthermalcomfort";
import { CalculationSource } from "../models/calculationMetadata";
import { ComfortModel, comfortModelMetaById, JsThermalComfortStandard } from "../models/comfortModels";
import { ChartId, type ChartId as ChartIdType } from "../models/chartOptions";
import { FieldKey } from "../models/fieldKeys";
import { fieldMetaByKey } from "../models/inputFieldsMeta";
import { InputControlId } from "../models/inputControls";
import { ThermalZone } from "../models/thermalZone";
import { bandsFromThermalZones, ChartMode, ModelOutputKey } from "../models/modelCapabilities";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../models/units";
import { inputOrder, type InputId as InputIdType } from "../models/inputSlots";
import { inputDisplayMetaById } from "../models/inputSlotPresentation";
import type {
  PlotAnnotationDto,
  PlotlyChartResponseDto,
  PlotTraceDto,
  CompareInputMap,
} from "../models/comfortDtos";
import { OptionKey, TemperatureMode, defaultUtciOptions, type UtciModelOptions } from "../models/inputModes";
import { createControlBehavior, createTemperatureControlBehavior } from "../services/comfort/controls/controlBehaviors";
import { applyOperativeTemperatureControlMode, synchronizeControlInputState } from "../services/comfort/syncState";
import { convertFieldValueFromSi, formatDisplayValue } from "../services/units";
import { ComfortModelBuilder, isRecord, createEmptyResults, buildResultSection } from "../state/comfortTool/modelConfigs/builder";
import { getCompareInputs, roundValue } from "../services/comfort/helpers";
import { buildContourTrace, buildInputScatterTrace, buildTextAnnotation } from "../services/comfort/charts/plotlyBuilders";
import { createFieldAxisScale } from "../services/comfort/charts/axis";
import { buildGridContourFieldChart, type GridContourLayerSpec } from "../services/comfort/charts/chartEngine";
import {
  resolveBaselineInputEntry,
  shouldShowInputLegend,
  type BuildInputTraceGroupsOptions,
} from "../services/comfort/charts/inputPoints";
import type { ChartAxisScale, GridPointEvaluation } from "../services/comfort/charts/types";

// ── Thermal Zones Definition ──────────────────────────

export const utciZonesList = [
  new ThermalZone({ category: "extreme cold stress",      label: "Extreme Cold Stress",      legendText: "Ext.<br>cold",                max: -40, color: "#0f172a", textColor: "#64748b" }),
  new ThermalZone({ category: "very strong cold stress",  label: "Very Strong Cold Stress",  legendText: "V strong<br>cold", min: -40, max: -27, color: "#1d4ed8", textColor: "#2563eb" }),
  new ThermalZone({ category: "strong cold stress",       label: "Strong Cold Stress",       legendText: "Strong<br>cold",   min: -27, max: -13, color: "#2563eb", textColor: "#3b82f6" }),
  new ThermalZone({ category: "moderate cold stress",     label: "Moderate Cold Stress",     legendText: "Moderate<br>cold", min: -13, max:   0, color: "#3b82f6", textColor: "#60a5fa" }),
  new ThermalZone({ category: "slight cold stress",       label: "Slight Cold Stress",       legendText: "Slight<br>cold",   min:   0, max:   9, color: "#7dd3fc", textColor: "#0284c7" }),
  new ThermalZone({ category: "no thermal stress",        label: "No Thermal Stress",        legendText: "No<br>stress",     min:   9, max:  26, color: "#34d399", textColor: "#059669" }),
  new ThermalZone({ category: "moderate heat stress",     label: "Moderate Heat Stress",     legendText: "Moderate<br>heat", min:  26, max:  32, color: "#fbbf24", textColor: "#d97706" }),
  new ThermalZone({ category: "strong heat stress",       label: "Strong Heat Stress",       legendText: "Strong<br>heat",   min:  32, max:  38, color: "#fb923c", textColor: "#ea580c" }),
  new ThermalZone({ category: "very strong heat stress",  label: "Very Strong Heat Stress",  legendText: "V strong<br>heat", min:  38, max:  46, color: "#f97316", textColor: "#c2410c" }),
  new ThermalZone({ category: "extreme heat stress",      label: "Extreme Heat Stress",      legendText: "Ext.<br>heat",      min:  46,          color: "#dc2626", textColor: "#b91c1c" }),
];

// UTCI stress categories are unbounded, while the chart needs finite endpoints.
const UTCI_CHART_RANGE_SI = { min: -50, max: 55 } as const;
const UTCI_CHART_BOUNDARIES = [
  UTCI_CHART_RANGE_SI.min,
  ...utciZonesList.slice(0, -1).map((zone) => zone.max),
  UTCI_CHART_RANGE_SI.max,
];

// Fallback zone used for NaN or an unrecognized category.
const UTCI_DEFAULT_ZONE = utciZonesList[5]; // "No Thermal Stress"

export function getUtciZoneMeta(value: string | number): ThermalZone {
  if (typeof value === "number") {
    if (isNaN(value)) return UTCI_DEFAULT_ZONE;
    return utciZonesList.find((zone) => zone.contains(value)) ?? UTCI_DEFAULT_ZONE;
  }
  // If it's a string, check if it's a numeric representation first
  const parsed = Number(value);
  if (value.trim() !== "" && !isNaN(parsed)) {
    return utciZonesList.find((zone) => zone.contains(parsed)) ?? UTCI_DEFAULT_ZONE;
  }
  return utciZonesList.find((zone) => zone.contains(value)) ?? UTCI_DEFAULT_ZONE;
}

// ── Constants ──────────────────────────────────────────────────────────
const TDB_LIMITS = { min: UTCI_CHART_RANGE_SI.min, max: 50 };
const TR_LIMITS = { min: -80, max: 120 };

/**
 * Plotly layout styling colors for backgrounds, canvas, and line boundaries.
 */
const CHART_COLOR_WHITE = "#ffffff";
const CHART_COLOR_PLOT_BG = "#f8fafc";
const CHART_COLOR_BOUNDARY_LINE = "#333333";

/**
 * Number of dummy Y-axis data points used to stretch the 1D stress range horizontal 
 * contour band vertically to give it visual height inside the Plotly canvas.
 */
const STRESS_BAND_Y_RESOLUTION = 50;

/**
 * Resolution grid size (number of points) along the X and Y axes for generating 
 * high-fidelity Plotly dynamic contour maps.
 */
const CONTOUR_GRID_RESOLUTION = 450;

/**
 * Y-axis positions (normalized coordinates [0, 1]) for displaying input markers/dots 
 * in the 1D UTCI stress category range chart. Distributes multiple inputs vertically 
 * to prevent visual overlap.
 */
const MULTI_INPUT_MARKER_Y_POSITIONS = [0.78, 0.5, 0.22];
const SINGLE_INPUT_MARKER_Y_POSITION = [0.5];

/**
 * Staggered Y-axis positions for UTCI zone annotations on the 1D stress chart 
 * to prevent adjacent labels from overlapping horizontally.
 * Even-indexed zones use the first value (lower); odd-indexed zones use the second (higher).
 */
const ZONE_ANNOTATION_Y_STAGGER = {
  even: 0.05,
  odd: 0.16,
};

/**
 * Layout margin configurations for the Plotly UTCI charts to ensure consistent padding.
 */
const UTCI_STRESS_CHART_MARGIN = { l: 56, r: 24, t: 48, b: 80 };
const UTCI_DYNAMIC_CHART_MARGIN = { l: 64, r: 24, t: 48, b: 64 };

// ── Data Transfer Object (DTOs) ──────────────────────────

export interface UtciRequestDto {
  tdb: number;
  tr: number;
  v: number;
  rh: number;
  units: UnitSystemType;
}

export interface UtciResponseDto {
  utci: number;
  stressCategory: string;
  source: CalculationSource;
}

export interface UtciChartInputsRequestDto {
  inputs: CompareInputMap<UtciRequestDto>;
}

export interface UtciChartSourceDto {
  chartRequest: UtciChartInputsRequestDto;
  dynamicXAxis?: FieldKey;
  dynamicYAxis?: FieldKey;
  baselineInputId?: InputIdType;
}

export function calculateUtci(payload: UtciRequestDto): UtciResponseDto {
  // Calculate UTCI using jsthermalcomfort utci function.
  const result = utci(payload.tdb, payload.tr, payload.v, payload.rh, payload.units, true, false);

  // The jsthermalcomfort utci function returns a number when return_stress_category is false, 
  // and an object when return_stress_category is true. Since we pass true, it returns an object, 
  // and this check acts as a TypeScript type guard to ensure the compiler knows it is an object.
  if (typeof result === "number") {
    throw new Error("UTCI calculation did not return a stress category.");
  }

  const utciVal = result.utci;
  if (!Number.isFinite(utciVal)) {
    throw new Error(`Invalid non-finite UTCI value encountered: ${utciVal}`);
  }

  const category = String(result.stress_category).toLowerCase();
  const matched = utciZonesList.some((z) => z.category === category);
  if (!matched) {
    throw new Error(`Unexpected UTCI stress category: ${category}`);
  }

  return {
    utci: utciVal,
    stressCategory: category,
    source: CalculationSource.JsThermalComfort,
  };
}

// ── Option Normalization and Synchronizers ──────────────────────────

/**
 * Validates and sanitizes the untrusted UTCI model options from UI state or storage.
 * If the value is not a valid object or is missing the temperature mode option, it falls back
 * to the default UTCI model options. Otherwise, it guarantees that only valid temperature
 * modes (Air or Operative) are returned, preventing runtime errors.
 * 
 * @param value - The raw, untrusted options value to normalize.
 * @returns A sanitized UtciModelOptions object containing a valid TemperatureMode, or null if invalid.
 */
function normalizeUtciOptions(value: unknown): UtciModelOptions | null {
  if (!isRecord(value)) {
    return { ...defaultUtciOptions };
  }

  const mode = value[OptionKey.TemperatureMode];
  if (mode === undefined) {
    return { ...defaultUtciOptions };
  }

  if (mode === TemperatureMode.Air || mode === TemperatureMode.Operative) {
    return { [OptionKey.TemperatureMode]: mode };
  }

  return null;
}

function toUtciRequest(state: any, inputId: InputIdType): UtciRequestDto {
  const inputs = state.inputsByInput[inputId];
  const options = normalizeUtciOptions(state.ui.modelOptionsByModel[ComfortModel.Utci]) || defaultUtciOptions;

  const tdb = Number(inputs[FieldKey.DryBulbTemperature]);
  const tr = options[OptionKey.TemperatureMode] === TemperatureMode.Operative 
    ? tdb 
    : Number(inputs[FieldKey.MeanRadiantTemperature]);

  return {
    tdb,
    tr,
    v: Number(inputs[FieldKey.WindSpeed]),
    rh: Number(inputs[FieldKey.RelativeHumidity]),
    units: UnitSystem.SI,
  };
}

function toUtciChartInputsRequest(
  state: any,
  visibleInputIds: InputIdType[],
): UtciChartInputsRequestDto {
  return {
    inputs: visibleInputIds.reduce((accumulator, inputId) => {
      accumulator[inputId] = toUtciRequest(state, inputId);
      return accumulator;
    }, {} as UtciChartInputsRequestDto["inputs"]),
  };
}

// ── Tabular Result Builder ──────────────────────────

function buildUtciResultSections(
  results: Record<InputIdType, UtciResponseDto | null>,
  visibleInputIds: InputIdType[],
  unitSystem: UnitSystemType,
  options: any,
  selectedChartId: ChartIdType,
) {
  const temperatureUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
  const sections = [];

  sections.push(
    buildResultSection(comfortModelMetaById[ComfortModel.Utci].label, results, visibleInputIds, (result) => {
      const displayValue = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.utci, unitSystem);
      const formattedValue = formatDisplayValue(
        displayValue,
        fieldMetaByKey[FieldKey.DryBulbTemperature].decimals,
      );
      
      return {
        text: `${formattedValue} ${temperatureUnits}`,
        color: "",
      };
    }),
  );

  sections.push(
    buildResultSection("Stress Category", results, visibleInputIds, (result) => {
      const zone = getUtciZoneMeta(result.stressCategory);
      return {
        text: zone.label,
        color: zone.textColor,
      };
    }),
  );

  return sections;
}

// ── Chart Building Logic ──────────────────────────

function mapUtciToZ(utci: number): number {
  if (utci <= UTCI_CHART_BOUNDARIES[0]) return 0;
  const lastIdx = UTCI_CHART_BOUNDARIES.length - 1;
  if (utci >= UTCI_CHART_BOUNDARIES[lastIdx]) return lastIdx;

  for (let i = 0; i < lastIdx; i++) {
    const min = UTCI_CHART_BOUNDARIES[i];
    const max = UTCI_CHART_BOUNDARIES[i + 1];
    if (utci >= min && utci < max) {
      return i + (utci - min) / (max - min);
    }
  }
  return lastIdx;
}

const UTCI_COLORSCALE = utciZonesList.reduce((acc, band, index, array) => {
  const step = 1 / array.length;
  acc.push([index * step, band.color]);
  acc.push([(index + 1) * step, band.color]);
  return acc;
}, [] as [number, string][]);

const UTCI_CONTOURS = {
  start: 1,
  end: 9,
  size: 1,
  type: "levels",
  coloring: "fill",
  showlines: false,
  smoothing: 1.3,
  line: { width: 1, color: CHART_COLOR_BOUNDARY_LINE },
};

const UTCI_BOUNDARY_CONTOURS = {
  ...UTCI_CONTOURS,
  coloring: "none" as const,
  showlines: true,
};

export function buildUtciStressChart(
  payload: UtciChartInputsRequestDto,
  cachedResultsByInput: Record<string, any> = {},
  unitSystem: UnitSystemType = UnitSystem.SI,
  baselineInputId?: string,
): PlotlyChartResponseDto {
  const inputs = getCompareInputs(payload.inputs);
  const showInputLegend = inputs.length > 1;
  const markerPositions = inputs.length > 1 ? MULTI_INPUT_MARKER_Y_POSITIONS : SINGLE_INPUT_MARKER_Y_POSITION;
  const annotations: PlotAnnotationDto[] = [];
  const temperatureDisplayUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
  const stressRange: [number, number] = [
    convertFieldValueFromSi(FieldKey.DryBulbTemperature, UTCI_CHART_RANGE_SI.min, unitSystem),
    convertFieldValueFromSi(FieldKey.DryBulbTemperature, UTCI_CHART_RANGE_SI.max, unitSystem),
  ];
  const zMax = UTCI_CHART_BOUNDARIES.length - 1;

  const traces: PlotTraceDto[] = [
    buildContourTrace({
      name: "Legend",
      x: UTCI_CHART_BOUNDARIES.map(val => convertFieldValueFromSi(FieldKey.DryBulbTemperature, val, unitSystem)),
      y: Array.from({ length: STRESS_BAND_Y_RESOLUTION }, (_, i) => i / (STRESS_BAND_Y_RESOLUTION - 1)),
      z: Array.from({ length: STRESS_BAND_Y_RESOLUTION }, () => UTCI_CHART_BOUNDARIES.map((_, i) => i)),
      text: Array.from({ length: STRESS_BAND_Y_RESOLUTION }, () => 
        utciZonesList.map(b => b.label).concat(utciZonesList[utciZonesList.length - 1].label)
      ),
      colorscale: UTCI_COLORSCALE,
      contours: UTCI_CONTOURS,
      showscale: false,
      hovertemplate: `UTCI: %{x:.1f} ${temperatureDisplayUnits}<br><b>Stress Category: %{text}</b><extra></extra>`,
      zmin: 0,
      zmax: zMax,
      opacity: 0.75,
      isBackgroundZone: true,
    }),
    buildContourTrace({
      name: "Boundaries",
      x: UTCI_CHART_BOUNDARIES.map((val) =>
        convertFieldValueFromSi(FieldKey.DryBulbTemperature, val, unitSystem),
      ),
      y: Array.from({ length: 50 }, (_, i) => i / 49),
      z: Array.from({ length: 50 }, () => UTCI_CHART_BOUNDARIES.map((_, i) => i)),
      colorscale: UTCI_COLORSCALE,
      contours: UTCI_BOUNDARY_CONTOURS,
      showscale: false,
      hoverinfo: "skip",
      hovertemplate: "",
      zmin: 0,
      zmax: zMax,
      opacity: 0.8,
    }),
  ];

  inputs.forEach(({ inputId, payload: inputPayload }, index) => {
    const result = cachedResultsByInput[inputId] ?? calculateUtci(inputPayload);
    const inputLabel = inputDisplayMetaById[inputId].label;
    const yPosition = markerPositions[index];
    const displayUtci = roundValue(convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.utci, unitSystem));

    traces.push(buildInputScatterTrace({
      inputId,
      x: displayUtci,
      y: yPosition,
      showLegend: showInputLegend,
      hovertemplate: `${inputLabel}<br>UTCI: %{x:.1f} ${temperatureDisplayUnits}<br><b>Stress Category: ${getUtciZoneMeta(result.stressCategory).label}</b><extra></extra>`,
      markerSize: 14,
    }));
  });

  utciZonesList.forEach((band, index) => {
    const chartMin = UTCI_CHART_BOUNDARIES[index];
    const chartMax = UTCI_CHART_BOUNDARIES[index + 1];
    annotations.push(buildTextAnnotation({
      x: (
        convertFieldValueFromSi(FieldKey.DryBulbTemperature, chartMin, unitSystem) +
        convertFieldValueFromSi(FieldKey.DryBulbTemperature, chartMax, unitSystem)
      ) / 2,
      y: index % 2 === 0 ? ZONE_ANNOTATION_Y_STAGGER.even : ZONE_ANNOTATION_Y_STAGGER.odd,
      text: band.legendText ?? band.label,
    }));
  });

  return {
    traces,
    layout: {
      title: `${comfortModelMetaById[ComfortModel.Utci].label} stress category`,
      paper_bgcolor: CHART_COLOR_WHITE,
      plot_bgcolor: CHART_COLOR_PLOT_BG,
      showlegend: showInputLegend,
      margin: UTCI_STRESS_CHART_MARGIN,
      xaxis: {
        title: `${comfortModelMetaById[ComfortModel.Utci].label} (${temperatureDisplayUnits})`,
        range: stressRange,
        showgrid: false,
        zeroline: false,
      },
      yaxis: {
        title: "",
        range: [0, 1],
        showticklabels: false,
        gridcolor: CHART_COLOR_WHITE,
      },
      shapes: [],
      legend: { orientation: "h", x: 0, y: 1.08 },
      height: 480,
    },
    annotations,
    source: CalculationSource.FrontendGenerated,
  };
}

function setUtciAxisValue(payload: UtciRequestDto, key: FieldKey, value: number): void {
  if (key === FieldKey.DryBulbTemperature) payload.tdb = value;
  else if (key === FieldKey.MeanRadiantTemperature) payload.tr = value;
  else if (key === FieldKey.OperativeTemperature) {
    payload.tdb = value;
    payload.tr = value;
  } else if (key === FieldKey.WindSpeed || key === FieldKey.RelativeAirSpeed) payload.v = value;
  else if (key === FieldKey.RelativeHumidity) payload.rh = value;
}

function getUtciAxisValue(payload: UtciRequestDto, key: FieldKey): number {
  const fieldValues: Partial<Record<FieldKey, number>> = {
    [FieldKey.DryBulbTemperature]: payload.tdb,
    [FieldKey.MeanRadiantTemperature]: payload.tr,
    [FieldKey.WindSpeed]: payload.v,
    [FieldKey.RelativeAirSpeed]: payload.v,
    [FieldKey.RelativeHumidity]: payload.rh,
    [FieldKey.OperativeTemperature]: t_o(
      payload.tdb,
      payload.tr,
      payload.v,
      JsThermalComfortStandard.ISO,
    ),
  };

  return fieldValues[key] ?? 0;
}

function buildFailedUtciGridPoint(): GridPointEvaluation {
  return { z: NaN, text: "", hoverMetadata: NaN };
}

function evaluateUtciDynamicPoint(
  pointArgs: UtciRequestDto,
  unitSystem: UnitSystemType,
): GridPointEvaluation {
  try {
    const result = utci(pointArgs.tdb, pointArgs.tr, pointArgs.v, pointArgs.rh, UnitSystem.SI, true, false);

    if (typeof result !== "object" || typeof result.utci !== "number") {
      return buildFailedUtciGridPoint();
    }

    const categoryName = String(result.stress_category);
    const zone = getUtciZoneMeta(categoryName);
    const shortLabel = zone.legendText ?? zone.label;

    return {
      z: mapUtciToZ(result.utci),
      text: shortLabel,
      hoverMetadata: convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.utci, unitSystem),
    };
  } catch {
    return buildFailedUtciGridPoint();
  }
}

function buildUtciDynamicGridLayers(
  xAxis: ChartAxisScale,
  yAxis: ChartAxisScale,
  unitSystem: UnitSystemType,
): GridContourLayerSpec[] {
  return [
    {
      name: `${comfortModelMetaById[ComfortModel.Utci].label} Zones`,
      colorscale: UTCI_COLORSCALE,
      contours: UTCI_CONTOURS,
      showscale: false,
      zmin: 0,
      zmax: 10,
      hovertemplate: `${xAxis.label}: %{x:.2f} ${xAxis.units}<br>${yAxis.label}: %{y:.2f} ${yAxis.units}<br><b>Zone: %{text}</b><br>UTCI: %{customdata:.1f} ${fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem]}<extra></extra>`,
      opacity: 0.75,
      isBackgroundZone: true,
    },
    {
      name: "Boundaries",
      colorscale: UTCI_COLORSCALE,
      contours: UTCI_BOUNDARY_CONTOURS,
      showscale: false,
      hoverinfo: "skip",
      hovertemplate: "",
      zmin: 0,
      zmax: 10,
      opacity: 0.8,
      includeText: false,
      includeHoverMetadata: false,
    },
  ];
}

function buildUtciDynamicInputGroup(
  payload: UtciChartInputsRequestDto,
  cachedResultsByInput: Record<string, any>,
  xAxis: ChartAxisScale,
  yAxis: ChartAxisScale,
  dynamicXAxis: FieldKey,
  dynamicYAxis: FieldKey,
  unitSystem: UnitSystemType,
): BuildInputTraceGroupsOptions<UtciRequestDto, any> {
  return {
    inputsMap: payload.inputs,
    resultsByInput: cachedResultsByInput,
    xAxis,
    yAxis,
    getXSi: (inputPayload) => getUtciAxisValue(inputPayload, dynamicXAxis),
    getYSi: (inputPayload) => getUtciAxisValue(inputPayload, dynamicYAxis),
    formatXDisplay: roundValue,
    formatYDisplay: roundValue,
    getHovertemplate: ({ inputLabel, payload: inputPayload }) => {
      let utciText = "";
      try {
        const utciRes = utci(inputPayload.tdb, inputPayload.tr, inputPayload.v, inputPayload.rh, UnitSystem.SI, true, false);
        if (typeof utciRes === "object" && typeof utciRes.utci === "number") {
          const categoryName = String(utciRes.stress_category);
          const categoryZone = getUtciZoneMeta(categoryName);
          const shortLabel = categoryZone.legendText ?? categoryZone.label;
          const displayUtciVal = convertFieldValueFromSi(FieldKey.DryBulbTemperature, utciRes.utci, unitSystem);
          utciText = `<br><b>Zone: ${shortLabel}</b><br>UTCI: ${roundValue(displayUtciVal, 1)} ${fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem]}`;
        }
      } catch {
        // Preserve existing hover fallback behavior when UTCI evaluation fails.
      }

      return `${inputLabel}<br>${xAxis.label}: %{x:.2f} ${xAxis.units}<br>${yAxis.label}: %{y:.2f} ${yAxis.units}${utciText}<extra></extra>`;
    },
  };
}

export function buildUtciDynamicChart(
  payload: UtciChartInputsRequestDto,
  cachedResultsByInput: Record<string, any> = {},
  unitSystem: UnitSystemType = UnitSystem.SI,
  dynamicXAxis?: FieldKey,
  dynamicYAxis?: FieldKey,
  baselineInputId?: InputIdType,
): PlotlyChartResponseDto {
  if (!dynamicXAxis || !dynamicYAxis || dynamicXAxis === dynamicYAxis) {
    return {
      traces: [],
      layout: {
        title: "Invalid Axes Selection",
        paper_bgcolor: CHART_COLOR_WHITE,
        plot_bgcolor: CHART_COLOR_PLOT_BG,
        showlegend: false,
        margin: UTCI_DYNAMIC_CHART_MARGIN,
        xaxis: {},
        yaxis: {},
      },
      annotations: [],
      source: CalculationSource.FrontendGenerated,
    };
  }

  const activeInputPayload = resolveBaselineInputEntry(payload.inputs, baselineInputId)?.payload;
  const xAxis = createFieldAxisScale({
    field: dynamicXAxis,
    unitSystem,
    points: CONTOUR_GRID_RESOLUTION,
  });
  const yAxis = createFieldAxisScale({
    field: dynamicYAxis,
    unitSystem,
    points: CONTOUR_GRID_RESOLUTION,
  });

  return buildGridContourFieldChart({
    xAxis,
    yAxis,
    grid: activeInputPayload
      ? {
        evaluatePoint: (xSi, ySi) => {
          const pointArgs = { ...activeInputPayload };
          setUtciAxisValue(pointArgs, dynamicXAxis, xSi);
          setUtciAxisValue(pointArgs, dynamicYAxis, ySi);

          return evaluateUtciDynamicPoint(pointArgs, unitSystem);
        },
        layers: buildUtciDynamicGridLayers(xAxis, yAxis, unitSystem),
      }
      : undefined,
    inputGroups: [
      buildUtciDynamicInputGroup(
        payload,
        cachedResultsByInput,
        xAxis,
        yAxis,
        dynamicXAxis,
        dynamicYAxis,
        unitSystem,
      ),
    ],
    layout: {
      title: `${comfortModelMetaById[ComfortModel.Utci].label} Dynamic Chart (${xAxis.label} vs ${yAxis.label})`,
      xAxis,
      yAxis,
      paperBgColor: CHART_COLOR_WHITE,
      plotBgColor: CHART_COLOR_PLOT_BG,
      showLegend: shouldShowInputLegend(payload.inputs),
      margin: UTCI_DYNAMIC_CHART_MARGIN,
      showGrid: false,
      zeroLine: false,
      legend: { orientation: "h", x: 0, y: 1.1 },
      height: 480,
    },
    source: CalculationSource.FrontendGenerated,
  });
}

function buildUtciChartResult(
  chartId: ChartIdType,
  chartSource: UtciChartSourceDto | null,
  resultsByInput: Record<InputIdType, UtciResponseDto | null>,
  unitSystem: UnitSystemType,
) {
  if (!chartSource) {
    return null;
  }

  if (chartId === ChartId.Stress) {
    return buildUtciStressChart(chartSource.chartRequest, resultsByInput, unitSystem, chartSource.baselineInputId);
  }

  if (chartId === ChartId.UtciDynamic) {
    return buildUtciDynamicChart(chartSource.chartRequest, resultsByInput, unitSystem, chartSource.dynamicXAxis, chartSource.dynamicYAxis, chartSource.baselineInputId);
  }

  return null;
}

// ── Model Config Builder ──────────────────────────

const utciChartIds: ChartIdType[] = [ChartId.Stress, ChartId.UtciDynamic];

const builder = new ComfortModelBuilder<UtciResponseDto, UtciChartSourceDto>(ComfortModel.Utci);
builder
  .setLabel(comfortModelMetaById[ComfortModel.Utci].label)
  .setDescription(comfortModelMetaById[ComfortModel.Utci].description)
  .setModes([ChartMode.Explore])
  .setChartableOutputs([
    {
      key: ModelOutputKey.Utci,
      label: "UTCI",
      unit: "°C",
      defaultBands: bandsFromThermalZones(utciZonesList),
    },
  ]);

const utciTemperatureBehavior = createTemperatureControlBehavior(InputControlId.Temperature, {
  minValue: TDB_LIMITS.min,
  maxValue: TDB_LIMITS.max,
});

builder.addControl({
  id: InputControlId.Temperature,
  behavior: utciTemperatureBehavior,
});

builder.addControl({
  id: InputControlId.RadiantTemperature,
  behavior: createControlBehavior({
    controlId: InputControlId.RadiantTemperature,
    fieldKey: FieldKey.MeanRadiantTemperature,
    minValue: TR_LIMITS.min,
    maxValue: TR_LIMITS.max,
    hidden: (context) => {
      const options = normalizeUtciOptions(context.options) || defaultUtciOptions;
      return options[OptionKey.TemperatureMode] === TemperatureMode.Operative;
    },
  }),
});

builder.addControl({
  id: InputControlId.WindSpeed,
  behavior: createControlBehavior({
    controlId: InputControlId.WindSpeed,
    fieldKey: FieldKey.WindSpeed,
  }),
});

builder.addControl({
  id: InputControlId.Humidity,
  behavior: createControlBehavior({
    controlId: InputControlId.Humidity,
    fieldKey: FieldKey.RelativeHumidity,
  }),
});

builder.addOptionHandler(OptionKey.TemperatureMode, (context, nextValue) => {
  if (nextValue !== TemperatureMode.Air && nextValue !== TemperatureMode.Operative) return null;

  const nextOptions = Object.assign({}, context.options);
  nextOptions[OptionKey.TemperatureMode] = nextValue;

  const inputsPatch = {} as any;
  inputOrder.forEach((inputId) => {
    inputsPatch[inputId] = (nextValue === TemperatureMode.Operative
      ? applyOperativeTemperatureControlMode(
          context.inputsByInput[inputId],
          nextOptions,
          context.derivedByInput[inputId]
        )
      : synchronizeControlInputState(
          context.inputsByInput[inputId],
          nextOptions,
          context.derivedByInput[inputId]
        )
    ).inputState;
  });

  return { inputsPatch, optionsPatch: { [OptionKey.TemperatureMode]: nextValue } };
});

builder.setDefaultChart(ChartId.Stress, utciChartIds);
builder.setDynamicAxisFields([
  FieldKey.DryBulbTemperature,
  FieldKey.MeanRadiantTemperature,
  FieldKey.OperativeTemperature,
  FieldKey.WindSpeed,
  FieldKey.RelativeHumidity,
]);
builder.setDefaultOptions(Object.assign({}, defaultUtciOptions));
builder.setOptionNormalizer(normalizeUtciOptions);

builder.setCalculator((state, visibleInputIds) => {
  const resultsByInput = createEmptyResults<UtciResponseDto>();
  
  visibleInputIds.forEach((inputId) => {
    resultsByInput[inputId] = calculateUtci(toUtciRequest(state, inputId));
  });

  const chartRequest = toUtciChartInputsRequest(state, visibleInputIds);

  return {
    resultsByInput: resultsByInput,
    chartSource: {
      chartRequest: chartRequest,
      dynamicXAxis: state.ui.dynamicXAxis,
      dynamicYAxis: state.ui.dynamicYAxis,
      baselineInputId: state.ui.chartBaselineInputId,
    },
  };
});

builder.setResultBuilder(buildUtciResultSections);
builder.setChartBuilder((chartId, chartSource, resultsByInput, unitSystem) => {
  return buildUtciChartResult(chartId, chartSource, resultsByInput, unitSystem);
});
builder.setZones(utciZonesList);
builder.setLegendChartIds([ChartId.Stress, ChartId.UtciDynamic]);
builder.setLegendTitle("UTCI Zones");
builder.setLockYAxisChartIds([]);

export const utciModelConfig = builder.build();
