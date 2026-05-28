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
import { convertFieldValueFromSi, convertFieldValueToSi, formatDisplayValue } from "../services/units";
import { ComfortModelBuilder, isRecord, createEmptyResults, buildResultSection } from "../state/comfortTool/modelConfigs/builder";
import { getCompareInputs, roundValue } from "../services/comfort/helpers";
import { buildContourTrace, buildInputScatterTrace, buildTextAnnotation } from "../services/comfort/charts/plotlyBuilders";

// ── Thermal Zones Definition ──────────────────────────

export const utciZonesList = [
  new ThermalZone({ category: "extreme cold stress",      label: "Extreme Cold Stress",      legendText: "Ext.<br>cold",      min: -50, max: -40, color: "#0f172a", textColor: "#64748b" }),
  new ThermalZone({ category: "very strong cold stress",  label: "Very Strong Cold Stress",  legendText: "V strong<br>cold", min: -40, max: -27, color: "#1d4ed8", textColor: "#2563eb" }),
  new ThermalZone({ category: "strong cold stress",       label: "Strong Cold Stress",       legendText: "Strong<br>cold",   min: -27, max: -13, color: "#2563eb", textColor: "#3b82f6" }),
  new ThermalZone({ category: "moderate cold stress",     label: "Moderate Cold Stress",     legendText: "Moderate<br>cold", min: -13, max:   0, color: "#3b82f6", textColor: "#60a5fa" }),
  new ThermalZone({ category: "slight cold stress",       label: "Slight Cold Stress",       legendText: "Slight<br>cold",   min:   0, max:   9, color: "#7dd3fc", textColor: "#0284c7" }),
  new ThermalZone({ category: "no thermal stress",        label: "No Thermal Stress",        legendText: "No<br>stress",     min:   9, max:  26, color: "#34d399", textColor: "#059669" }),
  new ThermalZone({ category: "moderate heat stress",     label: "Moderate Heat Stress",     legendText: "Moderate<br>heat", min:  26, max:  32, color: "#fbbf24", textColor: "#d97706" }),
  new ThermalZone({ category: "strong heat stress",       label: "Strong Heat Stress",       legendText: "Strong<br>heat",   min:  32, max:  38, color: "#fb923c", textColor: "#ea580c" }),
  new ThermalZone({ category: "very strong heat stress",  label: "Very Strong Heat Stress",  legendText: "V strong<br>heat", min:  38, max:  46, color: "#f97316", textColor: "#c2410c" }),
  new ThermalZone({ category: "extreme heat stress",      label: "Extreme Heat Stress",      legendText: "Ext.<br>heat",      min:  46, max:  55, color: "#dc2626", textColor: "#b91c1c" }),
];

// Derived from utciZonesList so the boundary values are never duplicated.
const UTCI_BOUNDARIES = [
  utciZonesList[0].min,
  ...utciZonesList.map((z) => z.max),
];

// Fallback zone used when a UTCI value is out of range or NaN.
const UTCI_DEFAULT_ZONE = utciZonesList[5]; // "No Thermal Stress"

// If a UTCI value is out of range or NaN, return the default zone; otherwise, return the UTCI stress category zone.
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
// tdb and tr limits are based on the UTCI_BOUNDARIES
const TDB_LIMITS = { min: utciZonesList[0].min, max: 50 };
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
  if (utci <= UTCI_BOUNDARIES[0]) return 0;
  const lastIdx = UTCI_BOUNDARIES.length - 1;
  if (utci >= UTCI_BOUNDARIES[lastIdx]) return lastIdx;

  for (let i = 0; i < lastIdx; i++) {
    const min = UTCI_BOUNDARIES[i];
    const max = UTCI_BOUNDARIES[i + 1];
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
    convertFieldValueFromSi(FieldKey.DryBulbTemperature, utciZonesList[0].min, unitSystem),
    convertFieldValueFromSi(FieldKey.DryBulbTemperature, utciZonesList[utciZonesList.length - 1].max, unitSystem),
  ];
  const zMax = UTCI_BOUNDARIES.length - 1;

  const traces: PlotTraceDto[] = [
    buildContourTrace({
      name: "Legend",
      x: UTCI_BOUNDARIES.map(val => convertFieldValueFromSi(FieldKey.DryBulbTemperature, val, unitSystem)),
      y: Array.from({ length: STRESS_BAND_Y_RESOLUTION }, (_, i) => i / (STRESS_BAND_Y_RESOLUTION - 1)),
      z: Array.from({ length: STRESS_BAND_Y_RESOLUTION }, () => UTCI_BOUNDARIES.map((_, i) => i)),
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
      x: UTCI_BOUNDARIES.map((val) =>
        convertFieldValueFromSi(FieldKey.DryBulbTemperature, val, unitSystem),
      ),
      y: Array.from({ length: 50 }, (_, i) => i / 49),
      z: Array.from({ length: 50 }, () => UTCI_BOUNDARIES.map((_, i) => i)),
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
    annotations.push(buildTextAnnotation({
      x: (
        convertFieldValueFromSi(FieldKey.DryBulbTemperature, band.min, unitSystem) +
        convertFieldValueFromSi(FieldKey.DryBulbTemperature, band.max, unitSystem)
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

export function buildUtciDynamicChart(
  payload: UtciChartInputsRequestDto,
  cachedResultsByInput: Record<string, any> = {},
  unitSystem: UnitSystemType = UnitSystem.SI,
  dynamicXAxis?: FieldKey,
  dynamicYAxis?: FieldKey,
  baselineInputId?: InputIdType,
): PlotlyChartResponseDto {
  const inputs = getCompareInputs(payload.inputs);
  const showInputLegend = inputs.length > 1;

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

  const activeInputPayload = (payload.inputs[baselineInputId as InputIdType] || inputs[0]?.payload);

  const xMeta = fieldMetaByKey[dynamicXAxis];
  const yMeta = fieldMetaByKey[dynamicYAxis];

  const xMin = convertFieldValueFromSi(dynamicXAxis, xMeta.minValue, unitSystem);
  const xMax = convertFieldValueFromSi(dynamicXAxis, xMeta.maxValue, unitSystem);
  const yMin = convertFieldValueFromSi(dynamicYAxis, yMeta.minValue, unitSystem);
  const yMax = convertFieldValueFromSi(dynamicYAxis, yMeta.maxValue, unitSystem);
  
  const xValues: number[] = [];
  const yValues: number[] = [];
  
  for (let i = 0; i < CONTOUR_GRID_RESOLUTION; i++) {
    xValues.push(xMin + (xMax - xMin) * (i / (CONTOUR_GRID_RESOLUTION - 1)));
  }
  for (let i = 0; i < CONTOUR_GRID_RESOLUTION; i++) {
    yValues.push(yMin + (yMax - yMin) * (i / (CONTOUR_GRID_RESOLUTION - 1)));
  }

  const zValues: number[][] = [];
  const textValues: string[][] = [];
  const hoverMetadata: number[][] = [];

  if (activeInputPayload) {
    for (let i = 0; i < CONTOUR_GRID_RESOLUTION; i++) {
      const row: number[] = [];
      const textRow: string[] = [];
      const hoverMetadataRow: number[] = [];

      const ySi = convertFieldValueToSi(dynamicYAxis, yValues[i], unitSystem);

      for (let j = 0; j < CONTOUR_GRID_RESOLUTION; j++) {
        const xSi = convertFieldValueToSi(dynamicXAxis, xValues[j], unitSystem);

        const pointArgs = { ...activeInputPayload };
        // Dynamically overrides the baseline comfort inputs with the active grid coordinates 
        // for the current contour point, leaving all other input parameters unchanged.
        // Used to evaluate model states across the grid.
        const updateParams = (key: string, val: number) => {
          if (key === FieldKey.DryBulbTemperature) { pointArgs.tdb = val; }
          else if (key === FieldKey.MeanRadiantTemperature) { pointArgs.tr = val; }
          else if (key === FieldKey.OperativeTemperature) { pointArgs.tdb = val; pointArgs.tr = val; }
          else if (key === FieldKey.WindSpeed || key === FieldKey.RelativeAirSpeed) { pointArgs.v = val; }
          else if (key === FieldKey.RelativeHumidity) { pointArgs.rh = val; }
        };

        updateParams(dynamicXAxis, xSi);
        updateParams(dynamicYAxis, ySi);

        try {
          const result = utci(pointArgs.tdb, pointArgs.tr, pointArgs.v, pointArgs.rh, UnitSystem.SI, true, false);
          const categoryName = String(result.stress_category);
          const zone = getUtciZoneMeta(categoryName);
          const shortLabel = zone.legendText ?? zone.label;
          
          if (typeof result === "object" && typeof result.utci === "number") {
            row.push(mapUtciToZ(result.utci));
            textRow.push(shortLabel);
            hoverMetadataRow.push(convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.utci, unitSystem));
          } else {
            row.push(NaN);
            textRow.push("");
            hoverMetadataRow.push(NaN);
          }
        } catch (e) {
          row.push(NaN);
          textRow.push("");
          hoverMetadataRow.push(NaN);
        }
      }
      zValues.push(row);
      textValues.push(textRow);
      hoverMetadata.push(hoverMetadataRow);
    }
  }

  const traces: PlotTraceDto[] = [];

  if (zValues.length > 0) {
    traces.push(buildContourTrace({
      name: `${comfortModelMetaById[ComfortModel.Utci].label} Zones`,
      x: xValues,
      y: yValues,
      z: zValues,
      text: textValues,
      colorscale: UTCI_COLORSCALE,
      contours: UTCI_CONTOURS,
      showscale: false,
      zmin: 0,
      zmax: 10,
      hovertemplate: `${xMeta.label}: %{x:.2f} ${xMeta.displayUnits[unitSystem]}<br>${yMeta.label}: %{y:.2f} ${yMeta.displayUnits[unitSystem]}<br><b>Zone: %{text}</b><br>UTCI: %{customdata:.1f} ${fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem]}<extra></extra>`,
      hoverMetadata: hoverMetadata,
      opacity: 0.75,
      isBackgroundZone: true,
    }),
    buildContourTrace({
      name: "Boundaries",
      x: xValues,
      y: yValues,
      z: zValues,
      colorscale: UTCI_COLORSCALE,
      contours: UTCI_BOUNDARY_CONTOURS,
      showscale: false,
      hoverinfo: "skip",
      hovertemplate: "",
      zmin: 0,
      zmax: 10,
      opacity: 0.8,
    }),
    );
  }

  inputs.forEach(({ inputId, payload: inputPayload }) => {
    // Map each FieldKey to its corresponding SI value from the UTCI request payload.
    const UTCI_FIELD_VALUES: Partial<Record<string, number>> = {
      [FieldKey.DryBulbTemperature]:   inputPayload.tdb,
      [FieldKey.MeanRadiantTemperature]: inputPayload.tr,
      [FieldKey.WindSpeed]:            inputPayload.v,
      [FieldKey.RelativeAirSpeed]:     inputPayload.v,
      [FieldKey.RelativeHumidity]:     inputPayload.rh,
      [FieldKey.OperativeTemperature]: t_o(inputPayload.tdb, inputPayload.tr, inputPayload.v, JsThermalComfortStandard.ISO),
    };
    const getFieldValue = (key: string): number => UTCI_FIELD_VALUES[key] ?? 0;

    let inputX = getFieldValue(dynamicXAxis as string);
    let inputY = getFieldValue(dynamicYAxis as string);
    
    inputX = convertFieldValueFromSi(dynamicXAxis, inputX, unitSystem);
    inputY = convertFieldValueFromSi(dynamicYAxis, inputY, unitSystem);

    let utciText = "";
    try {
      const utciRes = utci(inputPayload.tdb, inputPayload.tr, inputPayload.v, inputPayload.rh, UnitSystem.SI, true, false);
      const categoryName = String(utciRes.stress_category);
      const categoryZone = getUtciZoneMeta(categoryName);
      const shortLabel = categoryZone.legendText ?? categoryZone.label;
      const displayUtciVal = convertFieldValueFromSi(FieldKey.DryBulbTemperature, utciRes.utci, unitSystem);
      utciText = `<br><b>Zone: ${shortLabel}</b><br>UTCI: ${roundValue(displayUtciVal, 1)} ${fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem]}`;
    } catch {
      // Ignore errors.
    }

    traces.push(buildInputScatterTrace({
      inputId,
      x: roundValue(inputX),
      y: roundValue(inputY),
      showLegend: showInputLegend,
      hovertemplate: `${inputDisplayMetaById[inputId]?.label ?? "Input"}<br>${xMeta.label}: %{x:.2f} ${xMeta.displayUnits[unitSystem]}<br>${yMeta.label}: %{y:.2f} ${yMeta.displayUnits[unitSystem]}${utciText}<extra></extra>`,
    }));
  });

  return {
    traces,
    layout: {
      title: `${comfortModelMetaById[ComfortModel.Utci].label} Dynamic Chart (${xMeta.label} vs ${yMeta.label})`,
      paper_bgcolor: CHART_COLOR_WHITE,
      plot_bgcolor: CHART_COLOR_PLOT_BG,
      showlegend: showInputLegend,
      margin: UTCI_DYNAMIC_CHART_MARGIN,
      xaxis: {
        title: `${xMeta.label} (${xMeta.displayUnits[unitSystem]})`,
        range: [xMin, xMax],
        showgrid: false,
        zeroline: false,
      },
      yaxis: {
        title: `${yMeta.label} (${yMeta.displayUnits[unitSystem]})`,
        range: [yMin, yMax],
        showgrid: false,
        zeroline: false,
      },
      legend: { orientation: "h", x: 0, y: 1.1 },
      height: 480,
    },
    annotations: [],
    source: CalculationSource.FrontendGenerated,
  };
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
  .setDescription(comfortModelMetaById[ComfortModel.Utci].description);

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
