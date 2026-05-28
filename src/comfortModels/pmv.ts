/**
 * @file pmv.ts
 * @description Configuration, calculation, and charting service for the PMV (Predicted Mean Vote) comfort model.
 */

import { pmv_ppd_ashrae, pmv_ppd, units_converter, psy_ta_rh, p_sat, t_o, check_standard_compliance } from "jsthermalcomfort";

export { pmv_ppd_ashrae };

import { CalculationSource, ComfortStandard } from "../models/calculationMetadata";
import { ComfortModel, comfortModelMetaById, JsThermalComfortStandard, ComplianceStatus } from "../models/comfortModels";
import { ChartId, type ChartId as ChartIdType } from "../models/chartOptions";
import { FieldKey } from "../models/fieldKeys";
import { fieldMetaByKey } from "../models/inputFieldsMeta";
import { InputControlId } from "../models/inputControls";
import { ThermalZone } from "../models/thermalZone";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../models/units";
import { type InputId as InputIdType } from "../models/inputSlots";
import { inputDisplayMetaById } from "../models/inputSlotPresentation";
import type {
  CompareInputMap,
  ComfortPointDto,
  PlotlyChartResponseDto,
  PlotTraceDto,
} from "../models/comfortDtos";

import {
  AirSpeedControlMode,
  AirSpeedInputMode,
  HumidityInputMode,
  OptionKey,
  type OptionKey as OptionKeyType,
  TemperatureMode,
  defaultPmvOptions,
  type PmvModelOptions,
} from "../models/inputModes";

import {
  normalizePmvOptions,
  synchronizePmvInputState,
} from "../services/comfort/syncState";

import {
  createAirSpeedControlBehavior,
  createControlBehavior,
  createHumidityControlBehavior,
  createTemperatureControlBehavior,
} from "../services/comfort/controls/controlBehaviors";

import { createSingleInputPatch, type InputControlBehavior } from "../services/comfort/controls/types";
import { clothingTypicalEnsembles, metabolicActivityOptions } from "../services/comfort/referenceValues";
import { convertFieldValueFromSi, convertFieldValueToSi, convertHumidityRatioFromSi, getHumidityRatioDisplayMeta, formatDisplayValue } from "../services/units/index";
import { ComfortModelBuilder, isRecord, createEmptyResults, buildResultSection } from "../state/comfortTool/modelConfigs/builder";
import { getCompareInputs, roundValue } from "../services/comfort/helpers";
import { buildComfortPolygonTrace, buildInputScatterTrace, buildLineTrace, buildContourTrace } from "../services/comfort/charts/plotlyBuilders";

// ── Constants ──────────────────────────────────────────

export const PMV_COMFORT_LIMIT = 0.5;

// These exact bounds are used as a search bracket for finding PMV roots (comfort zone boundaries).
const COMFORT_ZONE_MIN_DRY_BULB = -20;
const COMFORT_ZONE_MAX_DRY_BULB = 80;
const ROOT_SCAN_POINTS = 101;
const ROOT_REFINE_POINTS = 7;
const ROOT_MAX_REFINEMENTS = 9;
const ROOT_TOLERANCE = 5e-4;

/**
 * Standard atmospheric pressure at sea level in Pascals (Pa).
 */
const STANDARD_ATM_PRESSURE_PA = 101325;

/**
 * Saturated water vapor to dry air molecular weight ratio constant 
 * (approx. 18.015 / 28.964) under standard conditions.
 */
const WATER_VAPOR_MOLECULAR_WEIGHT_RATIO = 0.62198;

/**
 * Resolution grid size (number of points) along the X and Y axes for generating 
 * background contours in both psychrometric and dynamic PMV charts.
 */
const CONTOUR_GRID_RESOLUTION = 50;

/**
 * Standard colors used across the PMV charts layout.
 */
const CHART_COLOR_WHITE = "#ffffff";
const CHART_COLOR_PLOT_BG = "#f8fafc";
const CHART_COLOR_GRIDLINE = "#e2e8f0";
const CHART_COLOR_BOUNDARY_LINE = "#333333";
const CHART_COLOR_RH_LINE = "#94a3b8";

const COLOR_COMPLIANT_GREEN = "#047857";
const COLOR_NON_COMPLIANT_RED = "#dc2626";

// ── Thermal Zones Definition ──────────────────────────

export const pmvZonesList = [
  new ThermalZone({ label: "Cold", max: -2.5, color: "#0571b0", textColor: "#1d4ed8" }),
  new ThermalZone({ label: "Cool", min: -2.5, max: -1.5, color: "#4c78a8", textColor: "#2563eb" }),
  new ThermalZone({ label: "Slightly Cool", min: -1.5, max: -0.5, color: "#92c5de", textColor: "#0369a1" }),
  new ThermalZone({ label: "Neutral", min: -0.5, max: 0.5, color: "#f2f2f2", textColor: "#475569" }),
  new ThermalZone({ label: "Slightly Warm", min: 0.5, max: 1.5, color: "#f4a582", textColor: "#ea580c" }),
  new ThermalZone({ label: "Warm", min: 1.5, max: 2.5, color: "#e15759", textColor: "#b91c1c" }),
  new ThermalZone({ label: "Hot", min: 2.5, color: "#cc79a7", textColor: "#701a75" }),
];

type TemperatureBracket =
  | { exactTemperature: number }
  | { low: number; high: number };

/**
 * Returns the ThermalZone metadata for a PMV value if it falls within the 
 * defined comfort zones, otherwise it returns the Neutral zone.
 */
export function getPmvZoneMeta(pmv: number): ThermalZone {
  if (isNaN(pmv)) return pmvZonesList[3]; // Neutral
  return pmvZonesList.find((zone) => zone.contains(pmv)) ?? pmvZonesList[3];
}

// ── Data Transfer Object (DTOs) ──────────────────────────

export interface PmvRequestDto {
  tdb: number;
  tr: number;
  vr: number;
  rh: number;
  met: number;
  clo: number;
  wme: number;
  occupantHasAirSpeedControl: boolean;
  units: UnitSystemType;
}

export interface ComfortZoneRequestDto extends PmvRequestDto {
  rhMin: number;
  rhMax: number;
  rhPoints: number;
}

export interface ComfortZoneResponseDto {
  coolEdge: ComfortPointDto[];
  warmEdge: ComfortPointDto[];
  source: CalculationSource;
}

export function calculateComfortZone(payload: ComfortZoneRequestDto): ComfortZoneResponseDto {
  const rhMinimum = Math.min(payload.rhMin, payload.rhMax);
  const rhMaximum = Math.max(payload.rhMin, payload.rhMax);
  const rhValues =
    payload.rhPoints === 1
      ? [rhMinimum]
      : Array.from({ length: payload.rhPoints }, (_, index) => (
        rhMinimum + ((rhMaximum - rhMinimum) * index) / (payload.rhPoints - 1)
      ));

  const coolEdge: ComfortPointDto[] = [];
  const warmEdge: ComfortPointDto[] = [];

  rhValues.forEach((relativeHumidity) => {
    const coolTemperature = solveDryBulbForTargetPmv(-PMV_COMFORT_LIMIT, relativeHumidity, payload);
    const warmTemperature = solveDryBulbForTargetPmv(PMV_COMFORT_LIMIT, relativeHumidity, payload);

    if (coolTemperature === null || warmTemperature === null) {
      return;
    }

    coolEdge.push({
      tdb: coolTemperature,
      rh: relativeHumidity,
    });
    warmEdge.push({
      tdb: warmTemperature,
      rh: relativeHumidity,
    });
  });

  return {
    coolEdge,
    warmEdge,
    source: CalculationSource.FrontendGenerated,
  };
}

export interface PmvResponseDto {
  pmv: number;
  ppd: number;
  vr: number;
  isCompliant: boolean;
  standard: ComfortStandard;
  source: CalculationSource;
}

interface ChartRangeDto {
  tdbMin: number;
  tdbMax: number;
  tdbPoints: number;
  humidityRatioMin: number;
  humidityRatioMax: number;
}

export interface PmvChartInputsRequestDto {
  inputs: CompareInputMap<ComfortZoneRequestDto>;
  chartRange: ChartRangeDto;
  rhCurves: number[];
}

export interface PmvChartSourceDto {
  chartRequest: PmvChartInputsRequestDto;
  comfortZonesByInput: CompareInputMap<ComfortZoneResponseDto>;
  dynamicXAxis?: string;
  dynamicYAxis?: string;
  baselineInputId?: InputIdType;
}

// ── Math Calculations & Solvers ──────────────────────

/**
 * Scans a range of temperatures sequentially to locate a bracket where the target PMV root crosses zero.
 */
function findTemperatureBracket(
  targetPmv: number,
  rh: number,
  payload: PmvRequestDto,
  minimum: number,
  maximum: number,
  pointCount: number,
): TemperatureBracket | null {
  let previousTemperature: number | null = null;
  let previousDelta: number | null = null;

  for (let index = 0; index < pointCount; index += 1) {
    const temperature = minimum + ((maximum - minimum) * index) / (pointCount - 1);
    const evaluationPayload = {
      ...payload,
      tdb: temperature,
      rh,
    };
    const normalizedPayload = evaluationPayload.units === UnitSystem.SI
      ? evaluationPayload
      : {
        ...evaluationPayload,
        ...units_converter(
          {
            tdb: evaluationPayload.tdb,
            tr: evaluationPayload.tr,
            vr: evaluationPayload.vr,
          },
          evaluationPayload.units,
        ),
        units: UnitSystem.SI,
      };

    const pmv = pmv_ppd_ashrae(
      normalizedPayload.tdb,
      normalizedPayload.tr,
      normalizedPayload.vr,
      normalizedPayload.rh,
      normalizedPayload.met,
      normalizedPayload.clo,
      normalizedPayload.wme,
      {
        units: normalizedPayload.units,
        limit_inputs: false,
        airspeed_control: normalizedPayload.occupantHasAirSpeedControl,
      },
    ).pmv;
    const delta = Number.isFinite(pmv) ? pmv - targetPmv : null;

    if (delta === null) {
      previousTemperature = null;
      previousDelta = null;
      continue;
    }

    if (Math.abs(delta) < ROOT_TOLERANCE) {
      return { exactTemperature: temperature };
    }

    if (previousTemperature !== null && previousDelta !== null && previousDelta * delta <= 0) {
      return {
        low: previousTemperature,
        high: temperature,
      };
    }

    previousTemperature = temperature;
    previousDelta = delta;
  }

  return null;
}

/**
 * Solves for the dry bulb temperature that results in a target PMV value at a given RH.
 */
export function solveDryBulbForTargetPmv(
  targetPmv: number,
  rh: number,
  payload: PmvRequestDto,
): number | null {
  const initialBracket = findTemperatureBracket(
    targetPmv,
    rh,
    payload,
    COMFORT_ZONE_MIN_DRY_BULB,
    COMFORT_ZONE_MAX_DRY_BULB,
    ROOT_SCAN_POINTS,
  );

  if (!initialBracket) {
    return null;
  }

  if ("exactTemperature" in initialBracket) {
    return initialBracket.exactTemperature;
  }

  let currentBracket = initialBracket;

  for (let index = 0; index < ROOT_MAX_REFINEMENTS; index += 1) {
    const refinedBracket = findTemperatureBracket(
      targetPmv,
      rh,
      payload,
      currentBracket.low,
      currentBracket.high,
      ROOT_REFINE_POINTS,
    );

    if (!refinedBracket) {
      break;
    }

    if ("exactTemperature" in refinedBracket) {
      return refinedBracket.exactTemperature;
    }

    currentBracket = refinedBracket;
  }

  return (currentBracket.low + currentBracket.high) / 2;
}

// ── Option Normalization and Synchronizers ──────────────────────────

const clothingPresetOptions = clothingTypicalEnsembles.map((ensemble) => ({
  id: ensemble.id,
  label: ensemble.label,
  value: ensemble.clo,
}));

const metabolicPresetOptions = metabolicActivityOptions.map((activity) => ({
  id: activity.id,
  label: activity.label,
  value: activity.met,
}));

const temperatureModeValues = new Set<string>(Object.values(TemperatureMode));
const airSpeedControlModeValues = new Set<string>(Object.values(AirSpeedControlMode));
const airSpeedInputModeValues = new Set<string>(Object.values(AirSpeedInputMode));
const humidityInputModeValues = new Set<string>(Object.values(HumidityInputMode));

function normalizePmvOptionsSnapshot(value: unknown) {
  if (!isRecord(value)) {
    return Object.assign({}, defaultPmvOptions);
  }

  const nextTemperatureMode = value[OptionKey.TemperatureMode];
  const nextAirSpeedControlMode = value[OptionKey.AirSpeedControlMode];
  const nextAirSpeedInputMode = value[OptionKey.AirSpeedInputMode];
  const nextHumidityInputMode = value[OptionKey.HumidityInputMode];

  if (nextTemperatureMode !== undefined && !temperatureModeValues.has(String(nextTemperatureMode))) {
    return null;
  }
  if (nextAirSpeedControlMode !== undefined && !airSpeedControlModeValues.has(String(nextAirSpeedControlMode))) {
    return null;
  }
  if (nextAirSpeedInputMode !== undefined && !airSpeedInputModeValues.has(String(nextAirSpeedInputMode))) {
    return null;
  }
  if (nextHumidityInputMode !== undefined && !humidityInputModeValues.has(String(nextHumidityInputMode))) {
    return null;
  }

  const options: PmvModelOptions = Object.assign({}, defaultPmvOptions);

  if (nextTemperatureMode !== undefined) {
    options[OptionKey.TemperatureMode] = nextTemperatureMode as TemperatureMode;
  }
  if (nextAirSpeedControlMode !== undefined) {
    options[OptionKey.AirSpeedControlMode] = nextAirSpeedControlMode as AirSpeedControlMode;
  }
  if (nextAirSpeedInputMode !== undefined) {
    options[OptionKey.AirSpeedInputMode] = nextAirSpeedInputMode as AirSpeedInputMode;
  }
  if (nextHumidityInputMode !== undefined) {
    options[OptionKey.HumidityInputMode] = nextHumidityInputMode as HumidityInputMode;
  }

  return options;
}

function toPmvRequest(state: any, inputId: InputIdType): PmvRequestDto {
  const inputs = state.inputsByInput[inputId];
  const options = normalizePmvOptionsSnapshot(state.ui.modelOptionsByModel[ComfortModel.Pmv]) || defaultPmvOptions;

  const tdb = Number(inputs[FieldKey.DryBulbTemperature]);
  const tr = options[OptionKey.TemperatureMode] === TemperatureMode.Operative
    ? tdb
    : Number(inputs[FieldKey.MeanRadiantTemperature]);

  return {
    tdb,
    tr,
    vr: Number(inputs[FieldKey.RelativeAirSpeed]),
    rh: Number(inputs[FieldKey.RelativeHumidity]),
    met: Number(inputs[FieldKey.MetabolicRate]),
    clo: Number(inputs[FieldKey.ClothingInsulation]),
    wme: Number(inputs[FieldKey.ExternalWork]),
    occupantHasAirSpeedControl: options[OptionKey.AirSpeedControlMode] === AirSpeedControlMode.WithLocalControl,
    units: UnitSystem.SI,
  };
}

function toComfortZoneRequest(state: any, inputId: InputIdType): ComfortZoneRequestDto {
  const baseRequest = toPmvRequest(state, inputId);
  return {
    tdb: baseRequest.tdb,
    tr: baseRequest.tr,
    vr: baseRequest.vr,
    rh: baseRequest.rh,
    met: baseRequest.met,
    clo: baseRequest.clo,
    wme: baseRequest.wme,
    occupantHasAirSpeedControl: baseRequest.occupantHasAirSpeedControl,
    units: baseRequest.units,
    rhMin: 0,
    rhMax: 100,
    rhPoints: 31,
  };
}

function toPmvChartInputsRequest(
  state: any,
  visibleInputIds: InputIdType[],
): PmvChartInputsRequestDto {
  return {
    inputs: visibleInputIds.reduce((accumulator, inputId) => {
      accumulator[inputId] = toComfortZoneRequest(state, inputId);
      return accumulator;
    }, {} as PmvChartInputsRequestDto["inputs"]),
    chartRange: {
      tdbMin: 10,
      tdbMax: 40,
      tdbPoints: 121,
      humidityRatioMin: 0,
      humidityRatioMax: 0.03,
    },
    rhCurves: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
  };
}

// ── Tabular Result Builder ──────────────────────────

function buildPmvResultSections(
  results: Record<InputIdType, PmvResponseDto | null>,
  visibleInputIds: InputIdType[],
  unitSystem: UnitSystemType,
  options: any,
  selectedChartId: ChartIdType,
) {
  const normalizedOptions = normalizePmvOptions(options);
  const sections = [];

  sections.push(
    buildResultSection("Compliance", results, visibleInputIds, (result) => {
      return {
        text: result.isCompliant ? ComplianceStatus.Compliant : ComplianceStatus.OutOfRange,
        color: result.isCompliant ? COLOR_COMPLIANT_GREEN : COLOR_NON_COMPLIANT_RED,
      };
    }),
  );

  if (normalizedOptions[OptionKey.AirSpeedInputMode] === AirSpeedInputMode.Measured) {
    const airSpeedUnits = fieldMetaByKey[FieldKey.RelativeAirSpeed].displayUnits[unitSystem];
    sections.push(
      buildResultSection(fieldMetaByKey[FieldKey.RelativeAirSpeed].label, results, visibleInputIds, (result) => {
        const displayValue = convertFieldValueFromSi(FieldKey.RelativeAirSpeed, result.vr, unitSystem);
        const formattedValue = formatDisplayValue(
          displayValue,
          fieldMetaByKey[FieldKey.RelativeAirSpeed].decimals,
        );

        return {
          text: `${formattedValue} ${airSpeedUnits}`,
          color: "",
        };
      }),
    );
  }

  sections.push(
    buildResultSection("PMV", results, visibleInputIds, (result) => {
      return {
        text: result.pmv.toFixed(2),
        color: "",
      };
    }),
  );

  sections.push(
    buildResultSection("Zone", results, visibleInputIds, (result) => {
      const zoneInfo = getPmvZoneMeta(result.pmv);
      return {
        text: zoneInfo.label,
        color: zoneInfo.textColor,
      };
    }),
  );

  sections.push(
    buildResultSection("PPD", results, visibleInputIds, (result) => {
      return {
        text: `${result.ppd.toFixed(1)}%`,
        color: "",
      };
    }),
  );

  sections.push(
    buildResultSection("Acceptability", results, visibleInputIds, (result) => {
      return {
        text: `${(100 - result.ppd).toFixed(1)}%`,
        color: "",
      };
    }),
  );

  return sections;
}

// ── Chart Building Logic ──────────────────────────

function getPmvHoverTemplate({
  xLabel,
  xUnits,
  yLabel,
  yUnits,
  yDecimals = 1,
  inputLabel,
  zoneText = "%{text}",
  pmvText = "%{z:.2f}",
  ppdText = "%{customdata[0]:.1f}%",
  isStaticZone = false,
}: {
  xLabel: string;
  xUnits: string;
  yLabel: string;
  yUnits: string;
  yDecimals?: number;
  inputLabel?: string;
  zoneText?: string | null;
  pmvText?: string | null;
  ppdText?: string | null;
  isStaticZone?: boolean;
}): string {
  const parts = [];
  if (inputLabel) parts.push(inputLabel);
  parts.push(`${xLabel}: %{x:.1f} ${xUnits}`);
  parts.push(`${yLabel}: %{y:.${yDecimals}f} ${yUnits}`);

  if (zoneText) {
    parts.push(`<b>Zone: ${zoneText}</b>`);
  }
  if (pmvText && !isStaticZone) {
    parts.push(`PMV: ${pmvText}`);
  }
  if (ppdText && !isStaticZone) {
    parts.push(`PPD: ${ppdText}`);
  }

  return parts.join("<br>") + "<extra></extra>";
}

const PMV_COLORSCALE = pmvZonesList.reduce((acc, zone, index, array) => {
  const step = 1 / array.length;
  acc.push([index * step, zone.color]);
  acc.push([(index + 1) * step, zone.color]);
  return acc;
}, [] as [number, string][]);

const PMV_CONTOURS = {
  start: -2.5,
  end: 2.5,
  size: 1,
  type: "levels",
  coloring: "fill",
  showlines: true,
  smoothing: 1,
  line: { width: 1, color: CHART_COLOR_BOUNDARY_LINE },
};

function smoothComfortZoneXValues(xValues: number[]): number[] {
  if (xValues.length < 3) {
    return xValues;
  }
  return xValues.map((value, index) => (
    index === 0 || index === xValues.length - 1
      ? value
      : Math.round((((xValues[index - 1] + (value * 2) + xValues[index + 1]) / 4) * 1000)) / 1000
  ));
}

export function buildComfortZonePolygon(
  coolEdge: ComfortPointDto[],
  warmEdge: ComfortPointDto[],
  getX: (point: ComfortPointDto) => number,
  getY: (point: ComfortPointDto) => number,
): { polygonX: number[]; polygonY: number[] } {
  const coolX = smoothComfortZoneXValues(coolEdge.map(getX));
  const coolY = coolEdge.map(getY);
  const warmX = smoothComfortZoneXValues(warmEdge.map(getX));
  const warmY = warmEdge.map(getY);

  return {
    polygonX: coolX.concat(warmX.slice().reverse()),
    polygonY: coolY.concat(warmY.slice().reverse()),
  };
}

function getComfortZoneForInput(
  inputId: InputIdType,
  payload: ComfortZoneRequestDto,
  comfortZonesByInput: Record<string, any>
): ComfortZoneResponseDto {
  return comfortZonesByInput[inputId] ?? calculateComfortZone(payload);
}

function getHumidityRatioDisplayValue(
  temperature: number,
  relativeHumidity: number,
  unitSystem: UnitSystemType,
): number {
  return convertHumidityRatioFromSi(psy_ta_rh(temperature, relativeHumidity).hr, unitSystem);
}

export function buildComparePsychrometricChart(
  payload: PmvChartInputsRequestDto,
  comfortZonesByInput: Record<string, any> = {},
  unitSystem: UnitSystemType = UnitSystem.SI,
  chartSource?: PmvChartSourceDto,
): PlotlyChartResponseDto {
  const inputs = getCompareInputs(payload.inputs);
  const showInputLegend = inputs.length > 1;
  const { chartRange } = payload;
  const temperatureDisplayUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
  const humidityRatioMeta = getHumidityRatioDisplayMeta(unitSystem);
  const temperatures = Array.from({ length: chartRange.tdbPoints }, (_, index) => (
    chartRange.tdbMin + ((chartRange.tdbMax - chartRange.tdbMin) * index) / (chartRange.tdbPoints - 1)
  ));

  const traces: PlotTraceDto[] = [];

  const activeInputPayload = (payload.inputs[chartSource?.baselineInputId as InputIdType] || inputs[0]?.payload);
  if (activeInputPayload) {
    const xPoints = CONTOUR_GRID_RESOLUTION;
    const yPoints = CONTOUR_GRID_RESOLUTION;
    const xValuesSi: number[] = [];
    const yValuesSi: number[] = [];
    for (let i = 0; i < xPoints; i++) xValuesSi.push(chartRange.tdbMin + (chartRange.tdbMax - chartRange.tdbMin) * (i / (xPoints - 1)));
    for (let i = 0; i < yPoints; i++) yValuesSi.push(chartRange.humidityRatioMin + (chartRange.humidityRatioMax - chartRange.humidityRatioMin) * (i / (yPoints - 1)));

    const zValues: number[][] = [];
    const textValues: string[][] = [];
    const hoverMetadata: any[][][] = [];
    for (let i = 0; i < yPoints; i++) {
      const row: number[] = [];
      const textRow: string[] = [];
      const hoverMetadataRow: any[][] = [];
      const hr = yValuesSi[i];
      for (let j = 0; j < xPoints; j++) {
        const tdb = xValuesSi[j];
        const pAtm = STANDARD_ATM_PRESSURE_PA;
        const pVap = (hr * pAtm) / (WATER_VAPOR_MOLECULAR_WEIGHT_RATIO + hr);
        const pSaturation = p_sat(tdb);
        if (pVap > pSaturation) {
          row.push(NaN);
          textRow.push("");
          hoverMetadataRow.push([NaN]);
        } else {
          const rh = Math.max(0, (pVap / pSaturation) * 100);
          try {
            const pmvResult = pmv_ppd(
              tdb,
              activeInputPayload.tr,
              activeInputPayload.vr,
              rh,
              activeInputPayload.met,
              activeInputPayload.clo,
              activeInputPayload.wme,
              JsThermalComfortStandard.ASHRAE,
              { limit_inputs: false },
            );
            row.push(pmvResult.pmv);
            textRow.push(getPmvZoneMeta(pmvResult.pmv).label);
            hoverMetadataRow.push([pmvResult.ppd]);
          } catch {
            row.push(NaN);
            textRow.push("");
            hoverMetadataRow.push([NaN]);
          }
        }
      }
      zValues.push(row);
      textValues.push(textRow);
      hoverMetadata.push(hoverMetadataRow);
    }
    const displayXValues = xValuesSi.map(x => convertFieldValueFromSi(FieldKey.DryBulbTemperature, x, unitSystem));
    const displayYValues = yValuesSi.map(y => convertHumidityRatioFromSi(y, unitSystem));

    traces.push(buildContourTrace({
      name: `${comfortModelMetaById[ComfortModel.Pmv].label} Zones`,
      x: displayXValues,
      y: displayYValues,
      z: zValues,
      text: textValues,
      colorscale: PMV_COLORSCALE,
      contours: PMV_CONTOURS,
      zmin: -3.5,
      zmax: 3.5,
      hovertemplate: getPmvHoverTemplate({
        xLabel: fieldMetaByKey[FieldKey.DryBulbTemperature].label,
        xUnits: temperatureDisplayUnits,
        yLabel: fieldMetaByKey[FieldKey.HumidityRatio].label,
        yUnits: humidityRatioMeta.displayUnits,
        yDecimals: humidityRatioMeta.decimals,
      }),
      hoverMetadata: hoverMetadata,
      opacity: 0.80,
      isBackgroundZone: true,
    }));
  }

  payload.rhCurves.forEach((relativeHumidity) => {
    const xValues: number[] = [];
    const yValues: number[] = [];
    const hoverMetadata: any[][] = [];
    const textValues: string[] = [];

    temperatures.forEach((temperature) => {
      const humidityRatioSi = psy_ta_rh(temperature, relativeHumidity).hr;
      const humidityRatio = convertHumidityRatioFromSi(humidityRatioSi, unitSystem);
      if (humidityRatioSi >= chartRange.humidityRatioMin && humidityRatioSi <= chartRange.humidityRatioMax) {
        xValues.push(roundValue(convertFieldValueFromSi(FieldKey.DryBulbTemperature, temperature, unitSystem)));
        yValues.push(roundValue(humidityRatio));

        if (activeInputPayload) {
          try {
            const res = pmv_ppd(temperature, activeInputPayload.tr, activeInputPayload.vr, relativeHumidity, activeInputPayload.met, activeInputPayload.clo, activeInputPayload.wme, JsThermalComfortStandard.ASHRAE, { limit_inputs: false });
            hoverMetadata.push([res.ppd, res.pmv.toFixed(2)]);
            textValues.push(getPmvZoneMeta(res.pmv).label);
          } catch {
            hoverMetadata.push([NaN, "NaN"]);
            textValues.push("");
          }
        }
      }
    });
    if (xValues.length === 0) {
      return;
    }
    traces.push(buildLineTrace({
      name: `RH ${relativeHumidity}%`,
      x: xValues,
      y: yValues,
      color: CHART_COLOR_RH_LINE,
      hovertemplate: getPmvHoverTemplate({
        xLabel: fieldMetaByKey[FieldKey.DryBulbTemperature].label,
        xUnits: temperatureDisplayUnits,
        yLabel: fieldMetaByKey[FieldKey.HumidityRatio].label,
        yUnits: humidityRatioMeta.displayUnits,
        yDecimals: humidityRatioMeta.decimals,
        zoneText: "%{text}",
        pmvText: "%{customdata[1]}",
        ppdText: "%{customdata[0]:.1f}%",
      }),
      text: textValues,
      hoverMetadata: hoverMetadata,
    }));
  });

  inputs.forEach(({ inputId, payload: inputPayload }) => {
    const comfortZone = getComfortZoneForInput(inputId, inputPayload, comfortZonesByInput);

    const { polygonX, polygonY } = buildComfortZonePolygon(
      comfortZone.coolEdge || [],
      comfortZone.warmEdge || [],
      (point) => roundValue(convertFieldValueFromSi(FieldKey.DryBulbTemperature, point.tdb, unitSystem)),
      (point) => roundValue(getHumidityRatioDisplayValue(point.tdb, point.rh, unitSystem)),
    );

    if (polygonX.length > 0) {
      traces.push(buildComfortPolygonTrace({
        inputId,
        nameSuffix: "comfort zone",
        polygonX,
        polygonY,
        hovertemplate: "",
        hoverinfo: "skip",
        isComfortZone: true,
      }));
    }

    let pmvValue: number | undefined;
    let zoneLabel: string | undefined;
    let ppdValue: number | undefined;
    try {
      const pmvRes = pmv_ppd(inputPayload.tdb, inputPayload.tr, inputPayload.vr, inputPayload.rh, inputPayload.met, inputPayload.clo, inputPayload.wme, JsThermalComfortStandard.ASHRAE, { limit_inputs: false });
      pmvValue = pmvRes.pmv;
      zoneLabel = getPmvZoneMeta(pmvRes.pmv).label;
      ppdValue = pmvRes.ppd;
    } catch {
      // Ignore errors.
    }

    traces.push(buildInputScatterTrace({
      inputId,
      x: roundValue(convertFieldValueFromSi(FieldKey.DryBulbTemperature, inputPayload.tdb, unitSystem)),
      y: roundValue(getHumidityRatioDisplayValue(inputPayload.tdb, inputPayload.rh, unitSystem)),
      showLegend: showInputLegend,
      hovertemplate: getPmvHoverTemplate({
        inputLabel: inputDisplayMetaById[inputId]?.label ?? "Input",
        xLabel: fieldMetaByKey[FieldKey.DryBulbTemperature].label,
        xUnits: temperatureDisplayUnits,
        yLabel: fieldMetaByKey[FieldKey.HumidityRatio].label,
        yUnits: humidityRatioMeta.displayUnits,
        yDecimals: humidityRatioMeta.decimals,
        zoneText: zoneLabel,
        pmvText: pmvValue !== undefined ? roundValue(pmvValue, 2).toString() : undefined,
        ppdText: ppdValue !== undefined ? `${roundValue(ppdValue, 1)}%` : undefined,
      }),
    }));
  });

  return {
    traces,
    layout: {
      title: `${comfortModelMetaById[ComfortModel.Pmv].label} Psychrometric Chart`,
      paper_bgcolor: CHART_COLOR_WHITE,
      plot_bgcolor: CHART_COLOR_PLOT_BG,
      showlegend: showInputLegend,
      margin: { l: 56, r: 24, t: 48, b: 80 },
      xaxis: {
        title: `${fieldMetaByKey[FieldKey.DryBulbTemperature].label} (${temperatureDisplayUnits})`,
        range: [
          convertFieldValueFromSi(FieldKey.DryBulbTemperature, chartRange.tdbMin, unitSystem),
          convertFieldValueFromSi(FieldKey.DryBulbTemperature, chartRange.tdbMax, unitSystem),
        ],
        gridcolor: CHART_COLOR_GRIDLINE,
      },
      yaxis: {
        title: `${fieldMetaByKey[FieldKey.HumidityRatio].label} (${humidityRatioMeta.displayUnits})`,
        range: [
          convertHumidityRatioFromSi(chartRange.humidityRatioMin, unitSystem),
          convertHumidityRatioFromSi(chartRange.humidityRatioMax, unitSystem),
        ],
        gridcolor: CHART_COLOR_GRIDLINE,
      },
      legend: { orientation: "h", x: 0, y: 1.1 },
      height: 480,
    },
    annotations: [],
    source: CalculationSource.FrontendGenerated,
  };
}

export function buildPmvDynamicChart(
  payload: PmvChartInputsRequestDto,
  dynamicXAxis: FieldKey,
  dynamicYAxis: FieldKey,
  unitSystem: UnitSystemType = UnitSystem.SI,
  chartSource?: PmvChartSourceDto,
): PlotlyChartResponseDto {
  const inputs = getCompareInputs(payload.inputs);
  const showInputLegend = inputs.length > 1;
  const activeInputPayload = payload.inputs[chartSource?.baselineInputId as InputIdType] || inputs[0]?.payload;

  const xMeta = fieldMetaByKey[dynamicXAxis];
  const yMeta = fieldMetaByKey[dynamicYAxis];

  const xMin = convertFieldValueFromSi(dynamicXAxis, xMeta.minValue, unitSystem);
  const xMax = convertFieldValueFromSi(dynamicXAxis, xMeta.maxValue, unitSystem);
  const yMin = convertFieldValueFromSi(dynamicYAxis, yMeta.minValue, unitSystem);
  const yMax = convertFieldValueFromSi(dynamicYAxis, yMeta.maxValue, unitSystem);

  const xPoints = CONTOUR_GRID_RESOLUTION;
  const yPoints = CONTOUR_GRID_RESOLUTION;
  const xValues: number[] = [];
  const yValues: number[] = [];

  for (let i = 0; i < xPoints; i++) {
    xValues.push(xMin + (xMax - xMin) * (i / (xPoints - 1)));
  }
  for (let i = 0; i < yPoints; i++) {
    yValues.push(yMin + (yMax - yMin) * (i / (yPoints - 1)));
  }

  const zValues: number[][] = [];
  const textValues: string[][] = [];
  const hoverMetadata: any[][][] = [];

  if (activeInputPayload) {
    for (let i = 0; i < yPoints; i++) {
      const row: number[] = [];
      const textRow: string[] = [];
      const hoverMetadataRow: any[][] = [];
      const ySi = convertFieldValueToSi(dynamicYAxis, yValues[i], unitSystem);

      for (let j = 0; j < xPoints; j++) {
        const xSi = convertFieldValueToSi(dynamicXAxis, xValues[j], unitSystem);

        const pointArgs = { ...activeInputPayload };
        // Dynamically overrides the baseline comfort inputs with the active grid coordinates 
        // for the current contour point, leaving all other input parameters unchanged.
        // Used to evaluate model states across the grid.
        const updateParams = (key: string, val: number) => {
          if (key === FieldKey.DryBulbTemperature) { pointArgs.tdb = val; }
          else if (key === FieldKey.MeanRadiantTemperature) { pointArgs.tr = val; }
          else if (key === FieldKey.OperativeTemperature) { pointArgs.tdb = val; pointArgs.tr = val; }
          else if (key === FieldKey.WindSpeed || key === FieldKey.RelativeAirSpeed) { pointArgs.vr = val; }
          else if (key === FieldKey.RelativeHumidity) { pointArgs.rh = val; }
          else if (key === FieldKey.MetabolicRate) { pointArgs.met = val; }
          else if (key === FieldKey.ClothingInsulation) { pointArgs.clo = val; }
          else if (key === FieldKey.ExternalWork) { pointArgs.wme = val; }
        };

        updateParams(dynamicXAxis as string, xSi);
        updateParams(dynamicYAxis as string, ySi);
        try {
          const pmvResult = pmv_ppd(pointArgs.tdb, pointArgs.tr, pointArgs.vr, pointArgs.rh, pointArgs.met, pointArgs.clo, pointArgs.wme, JsThermalComfortStandard.ASHRAE, { limit_inputs: false });
          row.push(pmvResult.pmv);
          textRow.push(getPmvZoneMeta(pmvResult.pmv).label);
          hoverMetadataRow.push([pmvResult.ppd]);
        } catch (e) {
          row.push(NaN);
          textRow.push("");
          hoverMetadataRow.push([NaN]);
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
      name: comfortModelMetaById[ComfortModel.Pmv].label,
      x: xValues,
      y: yValues,
      z: zValues,
      text: textValues,
      colorscale: PMV_COLORSCALE,
      contours: PMV_CONTOURS,
      zmin: -3.5,
      zmax: 3.5,
      hovertemplate: getPmvHoverTemplate({
        xLabel: xMeta.label,
        xUnits: xMeta.displayUnits[unitSystem],
        yLabel: yMeta.label,
        yUnits: yMeta.displayUnits[unitSystem],
        yDecimals: 2,
      }),
      hoverMetadata: hoverMetadata,
      opacity: 0.80,
      isBackgroundZone: true,
    }));
  }

  inputs.forEach(({ inputId, payload: inputPayload }) => {
    // Map each FieldKey to its corresponding SI value from the PMV request payload.
    const PMV_FIELD_VALUES: Partial<Record<string, number>> = {
      [FieldKey.DryBulbTemperature]: inputPayload.tdb,
      [FieldKey.MeanRadiantTemperature]: inputPayload.tr,
      [FieldKey.WindSpeed]: inputPayload.vr,
      [FieldKey.RelativeAirSpeed]: inputPayload.vr,
      [FieldKey.RelativeHumidity]: inputPayload.rh,
      [FieldKey.MetabolicRate]: inputPayload.met,
      [FieldKey.ClothingInsulation]: inputPayload.clo,
      [FieldKey.ExternalWork]: inputPayload.wme,
      [FieldKey.OperativeTemperature]: t_o(inputPayload.tdb, inputPayload.tr, inputPayload.vr, JsThermalComfortStandard.ASHRAE),
    };
    const getFieldValue = (key: string): number => PMV_FIELD_VALUES[key] ?? 0;

    let inputX = getFieldValue(dynamicXAxis as string);
    let inputY = getFieldValue(dynamicYAxis as string);

    inputX = convertFieldValueFromSi(dynamicXAxis, inputX, unitSystem);
    inputY = convertFieldValueFromSi(dynamicYAxis, inputY, unitSystem);

    let pmvValue: number | undefined;
    let zoneLabel: string | undefined;
    let ppdValue: number | undefined;
    try {
      const pmvRes = pmv_ppd(inputPayload.tdb, inputPayload.tr, inputPayload.vr, inputPayload.rh, inputPayload.met, inputPayload.clo, inputPayload.wme, JsThermalComfortStandard.ASHRAE, { limit_inputs: false });
      pmvValue = pmvRes.pmv;
      zoneLabel = getPmvZoneMeta(pmvRes.pmv).label;
      ppdValue = pmvRes.ppd;
    } catch {
      // Ignore errors.
    }

    traces.push(buildInputScatterTrace({
      inputId,
      x: roundValue(inputX),
      y: roundValue(inputY),
      showLegend: showInputLegend,
      hovertemplate: getPmvHoverTemplate({
        inputLabel: inputDisplayMetaById[inputId]?.label ?? "Input",
        xLabel: xMeta.label,
        xUnits: xMeta.displayUnits[unitSystem],
        yLabel: yMeta.label,
        yUnits: yMeta.displayUnits[unitSystem],
        yDecimals: 2,
        zoneText: zoneLabel,
        pmvText: pmvValue !== undefined ? roundValue(pmvValue, 2).toString() : undefined,
        ppdText: ppdValue !== undefined ? `${roundValue(ppdValue, 1)}%` : undefined,
      }),
    }));
  });

  return {
    traces,
    layout: {
      title: `${comfortModelMetaById[ComfortModel.Pmv].label} Dynamic Chart (${xMeta.label} vs ${yMeta.label})`,
      paper_bgcolor: CHART_COLOR_WHITE,
      plot_bgcolor: CHART_COLOR_PLOT_BG,
      showlegend: showInputLegend,
      margin: { l: 64, r: 24, t: 48, b: 64 },
      xaxis: {
        title: `${xMeta.label} (${xMeta.displayUnits[unitSystem]})`,
        range: [xMin, xMax],
        gridcolor: CHART_COLOR_GRIDLINE,
      },
      yaxis: {
        title: `${yMeta.label} (${yMeta.displayUnits[unitSystem]})`,
        range: [yMin, yMax],
        gridcolor: CHART_COLOR_GRIDLINE,
      },
      legend: { orientation: "h", x: 0, y: 1.1 },
      height: 480,
    },
    annotations: [],
    source: CalculationSource.FrontendGenerated,
  };
}

function buildPmvChartResult(
  chartId: ChartIdType,
  chartSource: PmvChartSourceDto | null,
  unitSystem: UnitSystemType,
) {
  if (!chartSource) {
    return null;
  }

  if (chartId === ChartId.Psychrometric) {
    return buildComparePsychrometricChart(
      chartSource.chartRequest,
      chartSource.comfortZonesByInput,
      unitSystem,
      chartSource
    );
  }

  if (chartId === ChartId.PmvDynamic && chartSource.dynamicXAxis && chartSource.dynamicYAxis) {
    return buildPmvDynamicChart(
      chartSource.chartRequest,
      chartSource.dynamicXAxis as any,
      chartSource.dynamicYAxis as any,
      unitSystem,
      chartSource
    );
  }

  return null;
}

// ── Model Config Builder ──────────────────────────

function createOptionHandler(
  behavior: InputControlBehavior,
  optionKey: OptionKeyType,
) {
  return (context: any, nextValue: string) => {
    if (behavior.applyOptionChange) {
      return behavior.applyOptionChange(context, optionKey, nextValue);
    }
    return null;
  };
}

const temperatureBehavior = createTemperatureControlBehavior(InputControlId.Temperature);
const airSpeedBehavior = createAirSpeedControlBehavior(InputControlId.AirSpeed);
const humidityBehavior = createHumidityControlBehavior(InputControlId.Humidity);

const pmvChartIds: ChartIdType[] = [ChartId.Psychrometric, ChartId.PmvDynamic];

export const pmvModelConfig = new ComfortModelBuilder<PmvResponseDto, PmvChartSourceDto>(ComfortModel.Pmv)
  .setLabel(comfortModelMetaById[ComfortModel.Pmv].label)
  .setDescription(comfortModelMetaById[ComfortModel.Pmv].description)
  .addControl({
    id: InputControlId.Temperature,
    behavior: temperatureBehavior,
  })
  .addControl({
    id: InputControlId.RadiantTemperature,
    behavior: createControlBehavior({
      controlId: InputControlId.RadiantTemperature,
      fieldKey: FieldKey.MeanRadiantTemperature,
      hidden: (context) => {
        const options = normalizePmvOptions(context.options);
        return options[OptionKey.TemperatureMode] === TemperatureMode.Operative;
      },
    }),
  })
  .addControl({
    id: InputControlId.AirSpeed,
    behavior: airSpeedBehavior,
  })
  .addControl({
    id: InputControlId.Humidity,
    behavior: humidityBehavior,
  })
  .addControl({
    id: InputControlId.MetabolicRate,
    behavior: createControlBehavior({
      controlId: InputControlId.MetabolicRate,
      fieldKey: FieldKey.MetabolicRate,
      presetOptions: metabolicPresetOptions,
      applyInput: (context, inputId, nextValue) => {
        if (nextValue === null) {
          return null;
        }
        const nextInputState = Object.assign({}, context.inputsByInput[inputId]);
        nextInputState[FieldKey.MetabolicRate] = nextValue;

        const synchronizedState = synchronizePmvInputState(
          nextInputState,
          context.options,
          context.derivedByInput[inputId],
        );

        return createSingleInputPatch(inputId, synchronizedState.inputState);
      },
    }),
  })
  .addControl({
    id: InputControlId.ClothingInsulation,
    behavior: createControlBehavior({
      controlId: InputControlId.ClothingInsulation,
      fieldKey: FieldKey.ClothingInsulation,
      presetOptions: clothingPresetOptions,
      presetDecimals: 2,
      showClothingBuilder: true,
    }),
  })
  .addOptionHandler(OptionKey.TemperatureMode, createOptionHandler(temperatureBehavior, OptionKey.TemperatureMode))
  .addOptionHandler(OptionKey.AirSpeedControlMode, createOptionHandler(airSpeedBehavior, OptionKey.AirSpeedControlMode))
  .addOptionHandler(OptionKey.AirSpeedInputMode, createOptionHandler(airSpeedBehavior, OptionKey.AirSpeedInputMode))
  .addOptionHandler(OptionKey.HumidityInputMode, createOptionHandler(humidityBehavior, OptionKey.HumidityInputMode))
  .setDefaultChart(ChartId.Psychrometric, pmvChartIds)
  .setDefaultOptions(Object.assign({}, defaultPmvOptions))
  .setOptionNormalizer(normalizePmvOptionsSnapshot)
  .setDynamicAxisFields([
    FieldKey.DryBulbTemperature,
    FieldKey.MeanRadiantTemperature,
    FieldKey.OperativeTemperature,
    FieldKey.RelativeAirSpeed,
    FieldKey.RelativeHumidity,
    FieldKey.MetabolicRate,
    FieldKey.ClothingInsulation,
  ])
  .setCalculator((state, visibleInputIds) => {
    const compareChartRequest = toPmvChartInputsRequest(state, visibleInputIds);
    const resultsByInput = createEmptyResults<PmvResponseDto>();

    const comfortZonesByInput = visibleInputIds.reduce((accumulator, inputId) => {
      accumulator[inputId] = calculateComfortZone(toComfortZoneRequest(state, inputId));
      return accumulator;
    }, {} as Record<string, any>);

    visibleInputIds.forEach((inputId) => {
      const request = toPmvRequest(state, inputId);
      const result = pmv_ppd_ashrae(
        request.tdb,
        request.tr,
        request.vr,
        request.rh,
        request.met,
        request.clo,
        request.wme,
        {
          units: request.units,
          limit_inputs: false,
          airspeed_control: request.occupantHasAirSpeedControl,
        },
      );
      const complianceWarnings = check_standard_compliance(JsThermalComfortStandard.ASHRAE, {
        tdb: request.tdb,
        tr: request.tr,
        v: request.vr,
        met: request.met,
        clo: request.clo,
        airspeed_control: request.occupantHasAirSpeedControl,
      } as any);

      resultsByInput[inputId] = {
        pmv: result.pmv,
        ppd: result.ppd,
        vr: request.vr,
        isCompliant: complianceWarnings.length === 0
          && Math.abs(result.pmv) <= PMV_COMFORT_LIMIT,
        standard: ComfortStandard.Ashrae55PmvPpd,
        source: CalculationSource.JsThermalComfort,
      };
    });

    return {
      resultsByInput: resultsByInput,
      chartSource: {
        chartRequest: compareChartRequest,
        comfortZonesByInput: comfortZonesByInput,
        dynamicXAxis: state.ui.dynamicXAxis,
        dynamicYAxis: state.ui.dynamicYAxis,
        baselineInputId: state.ui.chartBaselineInputId,
      },
    };
  })
  .setResultBuilder(buildPmvResultSections)
  .setChartBuilder((chartId, chartSource, _resultsByInput, unitSystem) => {
    return buildPmvChartResult(chartId, chartSource, unitSystem);
  })
  .setZones(pmvZonesList)
  .setLegendChartIds([ChartId.Psychrometric, ChartId.PmvDynamic])
  .setLegendTitle("PMV Zones")
  .setLockYAxisChartIds([])
  .build();
