/**
 * @file adaptive.ts
 * @description Configuration, calculation, and charting service for both the Adaptive (ASHRAE-55 and EN-16798-1) comfort models.
 */

import { adaptive_ashrae, adaptive_en, t_o, units_converter } from "jsthermalcomfort";

import { CalculationSource, ComfortStandard } from "../models/calculationMetadata";
import { ComfortModel, comfortModelMetaById, JsThermalComfortStandard, ComplianceStatus } from "../models/comfortModels";
import { ChartId, type ChartId as ChartIdType } from "../models/chartOptions";
import { FieldKey, type FieldKey as FieldKeyType } from "../models/fieldKeys";
import { fieldMetaByKey } from "../models/inputFieldsMeta";
import { InputControlId, type PresetInputOption } from "../models/inputControls";
import { ThermalZone } from "../models/thermalZone";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../models/units";
import { type InputId as InputIdType } from "../models/inputSlots";
import { inputDisplayMetaById } from "../models/inputSlotPresentation";
import type { PlotlyChartResponseDto, PlotTraceDto, CompareInputMap } from "../models/comfortDtos";

import { OptionKey, TemperatureMode, defaultAdaptiveOptions, AdaptiveStandardMode } from "../models/inputModes";
import {
  buildDefaultPresentation,
  createControlBehavior,
  createTemperatureControlBehavior,
} from "../services/comfort/controls/controlBehaviors";
import { convertFieldValueFromSi, convertFieldValueToSi } from "../services/units";
import { ComfortModelBuilder, isRecord, createEmptyResults, buildResultSection } from "../state/comfortTool/modelConfigs/builder";
import { getCompareInputs, roundValue, isFiniteNumber } from "../services/comfort/helpers";
import { buildComfortPolygonTrace, buildInputScatterTrace, buildContourTrace } from "../services/comfort/charts/plotlyBuilders";

// ── Thermal Zones Definitions ───────────────────────

export const adaptiveAshraeZonesList = [
  new ThermalZone({ label: "Too Cool", color: "#3b82f6", textColor: "#2563eb" }),
  new ThermalZone({ label: "80% Acceptability", color: "#86efac", textColor: "#047857" }),
  new ThermalZone({ label: "90% Acceptability", color: "#22c55e", textColor: "#047857" }),
  new ThermalZone({ label: "Too Warm", color: "#ef4444", textColor: "#b91c1c" }),
];

export const adaptiveEnZonesList = [
  new ThermalZone({ label: "Too Cool", color: "#3b82f6", textColor: "#2563eb" }),
  new ThermalZone({ label: "Category III", color: "#fde047", textColor: "#047857" }),
  new ThermalZone({ label: "Category II", color: "#86efac", textColor: "#047857" }),
  new ThermalZone({ label: "Category I", color: "#22c55e", textColor: "#047857" }),
  new ThermalZone({ label: "Too Warm", color: "#ef4444", textColor: "#b91c1c" }),
];

export const ADAPTIVE_ASHRAE_COLORSCALE = [
  adaptiveAshraeZonesList[0].color, // Too cool
  adaptiveAshraeZonesList[1].color, // 80% Acceptability
  adaptiveAshraeZonesList[2].color, // 90% Acceptability
  adaptiveAshraeZonesList[1].color, // 80% Acceptability
  adaptiveAshraeZonesList[3].color, // Too warm
].reduce((acc, color, index, array) => {
  const step = 1 / array.length;
  acc.push([index * step, color]);
  acc.push([(index + 1) * step, color]);
  return acc;
}, [] as [number, string][]);

export const ADAPTIVE_EN_COLORSCALE = [
  adaptiveEnZonesList[0].color, // Too cool
  adaptiveEnZonesList[1].color, // Category III
  adaptiveEnZonesList[2].color, // Category II
  adaptiveEnZonesList[3].color, // Category I
  adaptiveEnZonesList[2].color, // Category II
  adaptiveEnZonesList[1].color, // Category III
  adaptiveEnZonesList[4].color, // Too warm
].reduce((acc, color, index, array) => {
  const step = 1 / array.length;
  acc.push([index * step, color]);
  acc.push([(index + 1) * step, color]);
  return acc;
}, [] as [number, string][]);

// ── Constants ───────────────────────────────────────

export const AdaptiveStandardName = {
  ASHRAE: "ASHRAE 55 Adaptive",
  EN: "EN 16798-1 Adaptive",
} as const;

export const MeanOutdoorTempLabel = {
  Prevailing: `Prevailing ${fieldMetaByKey[FieldKey.PrevailingMeanOutdoorTemperature].label}`,
  Running: `Running ${fieldMetaByKey[FieldKey.PrevailingMeanOutdoorTemperature].label}`,
} as const;

export const STANDARD_APPLICABILITY_LIMITS = {
  ASHRAE: { TRM_MIN: 10, TRM_MAX: 33.5 },
  EN: { TRM_MIN: 10, TRM_MAX: 30 },
} as const;

export const ADAPTIVE_COEFFICIENTS = {
  ASHRAE: {
    SLOPE: 0.31,
    INTERCEPT: 17.8,
    OFFSETS_WARM: [2.5, 3.5],
    OFFSETS_COOL: [-2.5, -3.5],
  },
  EN: {
    SLOPE: 0.33,
    INTERCEPT: 18.8,
    OFFSETS_WARM: [2, 3, 4],
    OFFSETS_COOL: [-2, -3, -4],
  },
} as const;

export const ADAPTIVE_CONTOURS = {
  coloring: "fill",
  showlines: true,
  type: "levels",
  start: 1.5,
  size: 1,
  smoothing: 1.3,
  line: { width: 1, color: "#333333" },
};

export const ADAPTIVE_DYNAMIC_POINTS = 240;
export const COOLING_EFFECT_SPEED_BREAKPOINTS = [0.6, 0.9, 1.2];

export const CHART_COLORS = {
  PAPER_BG: "#ffffff",
  PLOT_BG: "#f8fafc",
  LINE: "#334155",
} as const;

export const TRANSPARENT_COLORSCALE: [number, string][] = [[0, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0)"]];

// ── Data Transfer Object (DTOs) ──────────────────────────

export interface AdaptiveRequestDto {
  tdb: number;
  tr: number;
  trm: number;
  v: number;
  units: UnitSystemType;
}

export interface AdaptiveResponseDto {
  t_cmf: number;
  acceptability_80?: boolean;
  acceptability_90?: boolean;
  acceptability_cat_i?: boolean;
  acceptability_cat_ii?: boolean;
  acceptability_cat_iii?: boolean;
  status_80?: string;
  status_90?: string;
  status_cat_i?: string;
  status_cat_ii?: string;
  status_cat_iii?: string;
  tmp_cmf_80_low?: number;
  tmp_cmf_80_up?: number;
  tmp_cmf_90_low?: number;
  tmp_cmf_90_up?: number;
  tmp_cmf_cat_i_low?: number;
  tmp_cmf_cat_i_up?: number;
  tmp_cmf_cat_ii_low?: number;
  tmp_cmf_cat_ii_up?: number;
  tmp_cmf_cat_iii_low?: number;
  tmp_cmf_cat_iii_up?: number;
  isCompliant: boolean;
  standard: ComfortStandard;
  source: CalculationSource;
}

export interface AdaptiveChartInputsRequestDto {
  inputs: CompareInputMap<AdaptiveRequestDto>;
}

export interface AdaptiveChartSourceDto {
  chartRequest: AdaptiveChartInputsRequestDto;
  resultsByInput: Record<InputIdType, AdaptiveResponseDto | null>;
  standardMode: string;
  dynamicXAxis?: string;
  dynamicYAxis?: string;
  baselineInputId?: InputIdType;
}

// ── Math Calculations & Solver ──────────────────────

/**
 * Calculates the cooling effect (CE) based on air speed and operative temperature.
 * Formula (when to >= 25.0 °C and v >= 0.6 m/s):
 *  - 0.6 <= v < 0.9 m/s : CE = 1.2 °C
 *  - 0.9 <= v < 1.2 m/s : CE = 1.8 °C
 *  - v >= 1.2 m/s       : CE = 2.2 °C
 * Used to shift the upper comfort boundary in adaptive models according to ASHRAE 55 and EN 16798-1.
 */
export function getCe(v: number, to: number): number {
  let ce = 0;
  if (v >= 0.6 && to >= 25.0) {
    if (v < 0.9) {
      ce = 1.2;
    } else if (v < 1.2) {
      ce = 1.8;
    } else {
      ce = 2.2;
    }
  }
  return ce;
}

export function calculateAdaptive(
  payload: AdaptiveRequestDto,
  standardMode: AdaptiveStandardMode,
): AdaptiveResponseDto {
  const isAshrae = standardMode === AdaptiveStandardMode.Ashrae;
  const to = t_o(payload.tdb, payload.tr, payload.v, isAshrae ? JsThermalComfortStandard.ASHRAE : JsThermalComfortStandard.ISO);

  if (isAshrae) {
    const result = adaptive_ashrae(
      payload.tdb,
      payload.tr,
      payload.trm,
      payload.v,
      payload.units,
      true,
      false,
    );

    if (Number.isNaN(result.tmp_cmf)) {
      return {
        t_cmf: NaN,
        acceptability_80: false,
        acceptability_90: false,
        status_80: adaptiveAshraeZonesList[3].label,
        status_90: adaptiveAshraeZonesList[3].label,
        tmp_cmf_80_low: NaN,
        tmp_cmf_80_up: NaN,
        tmp_cmf_90_low: NaN,
        tmp_cmf_90_up: NaN,
        isCompliant: false,
        standard: ComfortStandard.Ashrae55Adaptive,
        source: CalculationSource.JsThermalComfort,
      };
    }

    // Align with jsthermalcomfort PR #176 implementation: Calculate cooling effect based on the
    // unadjusted base upper boundary to prevent premature boundary shifts and incorrect compliance states.
    let tdbSi = payload.tdb;
    let trSi = payload.tr;
    let trmSi = payload.trm;
    let vSi = payload.v;

    if (payload.units.toUpperCase() === "IP") {
      const siInputs = units_converter(
        {
          tdb: payload.tdb,
          tr: payload.tr,
          tmp_running_mean: payload.trm,
          v: payload.v,
        },
        "IP",
      );
      tdbSi = siInputs.tdb;
      trSi = siInputs.tr;
      trmSi = siInputs.tmp_running_mean;
      vSi = siInputs.v;
    }

    const toSi = t_o(tdbSi, trSi, vSi, JsThermalComfortStandard.ASHRAE);
    const tCmfSi = 0.31 * trmSi + 17.8;

    const baseUpper80 = tCmfSi + 3.5;
    const baseUpper90 = tCmfSi + 2.5;

    const ce80 = getCe(vSi, baseUpper80);
    const ce90 = getCe(vSi, baseUpper90);

    const tmp_cmf_80_low_si = tCmfSi - 3.5;
    const tmp_cmf_80_up_si = baseUpper80 + ce80;
    const tmp_cmf_90_low_si = tCmfSi - 2.5;
    const tmp_cmf_90_up_si = baseUpper90 + ce90;

    const acceptability_80 = toSi >= tmp_cmf_80_low_si && toSi <= tmp_cmf_80_up_si;
    const acceptability_90 = toSi >= tmp_cmf_90_low_si && toSi <= tmp_cmf_90_up_si;

    let t_cmf = tCmfSi;
    let tmp_cmf_80_low = tmp_cmf_80_low_si;
    let tmp_cmf_80_up = tmp_cmf_80_up_si;
    let tmp_cmf_90_low = tmp_cmf_90_low_si;
    let tmp_cmf_90_up = tmp_cmf_90_up_si;

    if (payload.units.toUpperCase() === "IP") {
      const converted = units_converter(
        {
          tmp_cmf: tCmfSi,
          tmp_cmf_80_low: tmp_cmf_80_low_si,
          tmp_cmf_80_up: tmp_cmf_80_up_si,
          tmp_cmf_90_low: tmp_cmf_90_low_si,
          tmp_cmf_90_up: tmp_cmf_90_up_si,
        },
        "SI",
      );
      t_cmf = converted.tmp_cmf;
      tmp_cmf_80_low = converted.tmp_cmf_80_low;
      tmp_cmf_80_up = converted.tmp_cmf_80_up;
      tmp_cmf_90_low = converted.tmp_cmf_90_low;
      tmp_cmf_90_up = converted.tmp_cmf_90_up;
    }

    const currentTo = t_o(payload.tdb, payload.tr, payload.v, JsThermalComfortStandard.ASHRAE);

    return {
      t_cmf,
      acceptability_80,
      acceptability_90,
      status_80: acceptability_80 ? adaptiveAshraeZonesList[1].label : (currentTo < t_cmf ? adaptiveAshraeZonesList[0].label : adaptiveAshraeZonesList[3].label),
      status_90: acceptability_90 ? adaptiveAshraeZonesList[2].label : (currentTo < t_cmf ? adaptiveAshraeZonesList[0].label : adaptiveAshraeZonesList[3].label),
      tmp_cmf_80_low,
      tmp_cmf_80_up,
      tmp_cmf_90_low,
      tmp_cmf_90_up,
      isCompliant: true,
      standard: ComfortStandard.Ashrae55Adaptive,
      source: CalculationSource.JsThermalComfort,
    };
  }

  const result = adaptive_en(
    payload.tdb,
    payload.tr,
    payload.trm,
    payload.v,
    payload.units,
    true,
    false,
  );

  if (Number.isNaN(result.tmp_cmf)) {
    return {
      t_cmf: NaN,
      acceptability_cat_i: false,
      acceptability_cat_ii: false,
      acceptability_cat_iii: false,
      status_cat_i: adaptiveEnZonesList[4].label,
      status_cat_ii: adaptiveEnZonesList[4].label,
      status_cat_iii: adaptiveEnZonesList[4].label,
      tmp_cmf_cat_i_low: NaN,
      tmp_cmf_cat_i_up: NaN,
      tmp_cmf_cat_ii_low: NaN,
      tmp_cmf_cat_ii_up: NaN,
      tmp_cmf_cat_iii_low: NaN,
      tmp_cmf_cat_iii_up: NaN,
      isCompliant: false,
      standard: ComfortStandard.En16798Adaptive,
      source: CalculationSource.JsThermalComfort,
    };
  }

  // Align with jsthermalcomfort PR #176 implementation: Calculate cooling effect based on the
  // unadjusted base upper boundary to prevent premature boundary shifts and incorrect compliance states.
  let tdbSi = payload.tdb;
  let trSi = payload.tr;
  let trmSi = payload.trm;
  let vSi = payload.v;

  if (payload.units.toUpperCase() === "IP") {
    const siInputs = units_converter(
      {
        tdb: payload.tdb,
        tr: payload.tr,
        tmp_running_mean: payload.trm,
        v: payload.v,
      },
      "IP",
    );
    tdbSi = siInputs.tdb;
    trSi = siInputs.tr;
    trmSi = siInputs.tmp_running_mean;
    vSi = siInputs.v;
  }

  const toSi = t_o(tdbSi, trSi, vSi, JsThermalComfortStandard.ISO);
  const tCmfSi = 0.33 * trmSi + 18.8;

  const baseUpperI = tCmfSi + 2.0;
  const baseUpperIi = tCmfSi + 3.0;
  const baseUpperIii = tCmfSi + 4.0;

  const ceCatI = getCe(vSi, baseUpperI);
  const ceCatIi = getCe(vSi, baseUpperIi);
  const ceCatIii = getCe(vSi, baseUpperIii);

  const tmp_cmf_cat_i_low_si = tCmfSi - 3.0;
  const tmp_cmf_cat_i_up_si = baseUpperI + ceCatI;
  const tmp_cmf_cat_ii_low_si = tCmfSi - 4.0;
  const tmp_cmf_cat_ii_up_si = baseUpperIi + ceCatIi;
  const tmp_cmf_cat_iii_low_si = tCmfSi - 5.0;
  const tmp_cmf_cat_iii_up_si = baseUpperIii + ceCatIii;

  const acceptability_cat_i = toSi >= tmp_cmf_cat_i_low_si && toSi <= tmp_cmf_cat_i_up_si;
  const acceptability_cat_ii = toSi >= tmp_cmf_cat_ii_low_si && toSi <= tmp_cmf_cat_ii_up_si;
  const acceptability_cat_iii = toSi >= tmp_cmf_cat_iii_low_si && toSi <= tmp_cmf_cat_iii_up_si;

  let t_cmf = tCmfSi;
  let tmp_cmf_cat_i_low = tmp_cmf_cat_i_low_si;
  let tmp_cmf_cat_i_up = tmp_cmf_cat_i_up_si;
  let tmp_cmf_cat_ii_low = tmp_cmf_cat_ii_low_si;
  let tmp_cmf_cat_ii_up = tmp_cmf_cat_ii_up_si;
  let tmp_cmf_cat_iii_low = tmp_cmf_cat_iii_low_si;
  let tmp_cmf_cat_iii_up = tmp_cmf_cat_iii_up_si;

  if (payload.units.toUpperCase() === "IP") {
    const convertedUp = units_converter(
      {
        tmp_cmf: tCmfSi,
        tmp_cmf_cat_i_up: tmp_cmf_cat_i_up_si,
        tmp_cmf_cat_ii_up: tmp_cmf_cat_ii_up_si,
        tmp_cmf_cat_iii_up: tmp_cmf_cat_iii_up_si,
      },
      "SI",
    );
    const convertedLow = units_converter(
      {
        tmp_cmf_cat_i_low: tmp_cmf_cat_i_low_si,
        tmp_cmf_cat_ii_low: tmp_cmf_cat_ii_low_si,
        tmp_cmf_cat_iii_low: tmp_cmf_cat_iii_low_si,
      },
      "SI",
    );
    t_cmf = convertedUp.tmp_cmf;
    tmp_cmf_cat_i_low = convertedLow.tmp_cmf_cat_i_low;
    tmp_cmf_cat_i_up = convertedUp.tmp_cmf_cat_i_up;
    tmp_cmf_cat_ii_low = convertedLow.tmp_cmf_cat_ii_low;
    tmp_cmf_cat_ii_up = convertedUp.tmp_cmf_cat_ii_up;
    tmp_cmf_cat_iii_low = convertedLow.tmp_cmf_cat_iii_low;
    tmp_cmf_cat_iii_up = convertedUp.tmp_cmf_cat_iii_up;
  }

  const currentTo = t_o(payload.tdb, payload.tr, payload.v, JsThermalComfortStandard.ISO);

  return {
    t_cmf,
    acceptability_cat_i,
    acceptability_cat_ii,
    acceptability_cat_iii,
    status_cat_i: acceptability_cat_i ? adaptiveEnZonesList[3].label : (currentTo < t_cmf ? adaptiveEnZonesList[0].label : adaptiveEnZonesList[4].label),
    status_cat_ii: acceptability_cat_ii ? adaptiveEnZonesList[2].label : (currentTo < t_cmf ? adaptiveEnZonesList[0].label : adaptiveEnZonesList[4].label),
    status_cat_iii: acceptability_cat_iii ? adaptiveEnZonesList[1].label : (currentTo < t_cmf ? adaptiveEnZonesList[0].label : adaptiveEnZonesList[4].label),
    tmp_cmf_cat_i_low,
    tmp_cmf_cat_i_up,
    tmp_cmf_cat_ii_low,
    tmp_cmf_cat_ii_up,
    tmp_cmf_cat_iii_low,
    tmp_cmf_cat_iii_up,
    isCompliant: true,
    standard: ComfortStandard.En16798Adaptive,
    source: CalculationSource.JsThermalComfort,
  };
}

// ── Option Normalization and Synchronizers ──────────────────────────

function normalizeAdaptiveOptionsSnapshot(value: unknown) {
  if (!isRecord(value)) {
    return Object.assign({}, defaultAdaptiveOptions);
  }

  const nextOptions = Object.assign({}, defaultAdaptiveOptions);

  if (value[OptionKey.TemperatureMode] === TemperatureMode.Air) {
    nextOptions[OptionKey.TemperatureMode] = TemperatureMode.Air;
  } else {
    nextOptions[OptionKey.TemperatureMode] = TemperatureMode.Operative;
  }

  return nextOptions;
}

function toAdaptiveRequest(state: any, inputId: InputIdType, modelId: ComfortModel): AdaptiveRequestDto {
  const inputs = state.inputsByInput[inputId];
  const options = normalizeAdaptiveOptionsSnapshot(state.ui.modelOptionsByModel[modelId]) || defaultAdaptiveOptions;

  const tdb = Number(inputs[FieldKey.DryBulbTemperature]);
  const tr = options[OptionKey.TemperatureMode] === TemperatureMode.Operative
    ? tdb
    : Number(inputs[FieldKey.MeanRadiantTemperature]);

  return {
    tdb,
    tr,
    trm: Number(inputs[FieldKey.PrevailingMeanOutdoorTemperature]),
    v: Number(inputs[FieldKey.RelativeAirSpeed]),
    units: UnitSystem.SI,
  };
}

function toAdaptiveChartInputsRequest(
  state: any,
  visibleInputIds: InputIdType[],
  modelId: ComfortModel,
): AdaptiveChartInputsRequestDto {
  return {
    inputs: visibleInputIds.reduce((accumulator, inputId) => {
      accumulator[inputId] = toAdaptiveRequest(state, inputId, modelId);
      return accumulator;
    }, {} as AdaptiveChartInputsRequestDto["inputs"]),
  };
}

const ashraeAirSpeedPresets: PresetInputOption[] = [
  { id: "0.3", value: 0.3, label: "0.3 m/s (59 fpm)" },
  { id: "0.6", value: 0.6, label: "0.6 m/s (118 fpm)" },
  { id: "0.9", value: 0.9, label: "0.9 m/s (177 fpm)" },
  { id: "1.2", value: 1.2, label: "1.2 m/s (236 fpm)" },
];

const enAirSpeedPresets: PresetInputOption[] = [
  { id: "0.1", value: 0.1, label: "lower than 0.6 m/s (118 fpm)" },
  { id: "0.6", value: 0.6, label: "0.6 m/s (118 fpm)" },
  { id: "0.9", value: 0.9, label: "0.9 m/s (177 fpm)" },
  { id: "1.2", value: 1.2, label: "1.2 m/s (236 fpm)" },
];// ── Chart Construction Utilities ────────────────────

/**
 * Restricts a value to be within the specified minimum and maximum boundaries.
 * - If the value is below the minimum, the minimum value is returned.
 * - If the value is above the maximum, the maximum value is returned.
 * - Otherwise, the value itself is returned.
 * Used for adaptive comfort calculations.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isTemperatureAxis(field: FieldKeyType): boolean {
  return field === FieldKey.DryBulbTemperature ||
    field === FieldKey.MeanRadiantTemperature ||
    field === FieldKey.OperativeTemperature;
}

function isAirSpeedAxis(field: FieldKeyType): boolean {
  return field === FieldKey.RelativeAirSpeed || field === FieldKey.WindSpeed;
}

function getAdaptiveHoverTemplate({
  xLabel,
  xUnits,
  yLabel,
  yUnits,
  standard,
  inputLabel,
}: {
  xLabel: string;
  xUnits: string;
  yLabel: string;
  yUnits: string;
  standard: AdaptiveStandardMode;
  inputLabel?: string;
}): string {
  const isAshrae = standard === AdaptiveStandardMode.Ashrae;
  const parts = [];

  if (inputLabel) parts.push(`<b>${inputLabel}</b>`);
  parts.push(`${xLabel}: %{x:.1f} ${xUnits}`);
  parts.push(`${yLabel}: %{y:.1f} ${yUnits}`);

  if (isAshrae) {
    parts.push(`${adaptiveAshraeZonesList[2].label}: %{customdata[3]:.1f} to %{customdata[4]:.1f} °C`);
    parts.push(`${adaptiveAshraeZonesList[1].label}: %{customdata[1]:.1f} to %{customdata[2]:.1f} °C`);
  } else {
    parts.push(`${adaptiveEnZonesList[3].label}: %{customdata[1]:.1f} to %{customdata[2]:.1f} °C`);
    parts.push(`${adaptiveEnZonesList[2].label}: %{customdata[3]:.1f} to %{customdata[4]:.1f} °C`);
    parts.push(`${adaptiveEnZonesList[1].label}: %{customdata[5]:.1f} to %{customdata[6]:.1f} °C`);
  }

  return parts.join("<br>") + "<extra></extra>";
}

function getAdaptiveHoverMetadata(
  result: AdaptiveResponseDto,
  to: number,
  standard: AdaptiveStandardMode,
  unitSystem: UnitSystemType
): any[] {
  const conv = (val: number | undefined) =>
    val !== undefined ? roundValue(convertFieldValueFromSi(FieldKey.DryBulbTemperature, val, unitSystem), 1) : NaN;

  if (standard === AdaptiveStandardMode.Ashrae) {
    const isCompliant = result.acceptability_80;
    return [
      isCompliant ? "Compliant" : "Non-Compliant",
      conv(result.tmp_cmf_80_low), conv(result.tmp_cmf_80_up),
      conv(result.tmp_cmf_90_low), conv(result.tmp_cmf_90_up)
    ];
  } else {
    const isCompliant = result.acceptability_cat_iii;
    return [
      isCompliant ? "Compliant" : "Non-Compliant",
      conv(result.tmp_cmf_cat_i_low), conv(result.tmp_cmf_cat_i_up),
      conv(result.tmp_cmf_cat_ii_low), conv(result.tmp_cmf_cat_ii_up),
      conv(result.tmp_cmf_cat_iii_low), conv(result.tmp_cmf_cat_iii_up)
    ];
  }
}

function getFieldValues(field: FieldKeyType, points: number, extraValues: number[] = []): number[] {
  const meta = fieldMetaByKey[field];
  const values = Array.from({ length: points }, (_, index) => (
    meta.minValue + ((meta.maxValue - meta.minValue) * index) / (points - 1)
  ));

  extraValues.forEach((value) => {
    if (value > meta.minValue && value < meta.maxValue) {
      values.push(value);
    }
  });

  return values
    .sort((a, b) => a - b)
    .filter((value, index, array) => index === 0 || Math.abs(value - array[index - 1]) > 1e-6);
}

function getAdaptiveBaseTemperature(trm: number, standardMode: AdaptiveStandardMode): number {
  const coeffs = standardMode === AdaptiveStandardMode.Ashrae ? ADAPTIVE_COEFFICIENTS.ASHRAE : ADAPTIVE_COEFFICIENTS.EN;
  return coeffs.SLOPE * trm + coeffs.INTERCEPT;
}

function withCoolingEffect(v: number, baseUpperBoundary: number): number {
  return baseUpperBoundary + getCe(v, baseUpperBoundary);
}

function addCoolingEffectTransitionPoints(
  standardMode: AdaptiveStandardMode,
  v: number,
  minTrm: number,
  maxTrm: number,
): number[] {
  if (v < 0.6) {
    return [];
  }

  const coeffs = standardMode === AdaptiveStandardMode.Ashrae ? ADAPTIVE_COEFFICIENTS.ASHRAE : ADAPTIVE_COEFFICIENTS.EN;
  const slope = coeffs.SLOPE;
  const intercept = coeffs.INTERCEPT;
  const warmOffsets = coeffs.OFFSETS_WARM;
  const epsilon = 0.001;

  return warmOffsets.flatMap((offset) => {
    const trm = (25 - offset - intercept) / slope;
    return trm > minTrm && trm < maxTrm ? [trm - epsilon, trm + epsilon] : [];
  });
}

function getAdaptiveTemperatureBoundaries(
  trm: number,
  v: number,
  standardMode: AdaptiveStandardMode,
): number[] {
  const tCmf = getAdaptiveBaseTemperature(trm, standardMode);

  if (standardMode === AdaptiveStandardMode.Ashrae) {
    const coeffs = ADAPTIVE_COEFFICIENTS.ASHRAE;
    return [
      tCmf + coeffs.OFFSETS_COOL[1],
      tCmf + coeffs.OFFSETS_COOL[0],
      withCoolingEffect(v, tCmf + coeffs.OFFSETS_WARM[0]),
      withCoolingEffect(v, tCmf + coeffs.OFFSETS_WARM[1]),
    ];
  }

  const coeffs = ADAPTIVE_COEFFICIENTS.EN;
  return [
    tCmf + coeffs.OFFSETS_COOL[2],
    tCmf + coeffs.OFFSETS_COOL[1],
    tCmf + coeffs.OFFSETS_COOL[0],
    withCoolingEffect(v, tCmf + coeffs.OFFSETS_WARM[0]),
    withCoolingEffect(v, tCmf + coeffs.OFFSETS_WARM[1]),
    withCoolingEffect(v, tCmf + coeffs.OFFSETS_WARM[2]),
  ];
}

function getOutdoorTemperatureBoundaries(
  to: number,
  v: number,
  standardMode: AdaptiveStandardMode,
): number[] {
  const ce = getCe(v, to);

  // Derived by solving the standard boundary equations for the prevailing/running mean outdoor temperature (trm)
  // given a target operative temperature (to). 
  // For upper boundaries with air speed, the cooling effect (ce) is subtracted:
  //   to = slope * trm + intercept + offset + ce  =>  trm = (to - offset - ce - intercept) / slope
  // For lower boundaries (no cooling effect):
  //   to = slope * trm + intercept + offset       =>  trm = (to - offset - intercept) / slope

  if (standardMode === AdaptiveStandardMode.Ashrae) {
    const coeffs = ADAPTIVE_COEFFICIENTS.ASHRAE;
    const slope = coeffs.SLOPE;
    const intercept = coeffs.INTERCEPT;
    return [
      (to + coeffs.OFFSETS_COOL[1] - ce - intercept) / slope,
      (to + coeffs.OFFSETS_COOL[0] - ce - intercept) / slope,
      (to - coeffs.OFFSETS_WARM[0] - intercept) / slope,
      (to - coeffs.OFFSETS_WARM[1] - intercept) / slope,
    ];
  }

  const coeffs = ADAPTIVE_COEFFICIENTS.EN;
  const slope = coeffs.SLOPE;
  const intercept = coeffs.INTERCEPT;
  return [
    (to + coeffs.OFFSETS_COOL[2] - ce - intercept) / slope,
    (to + coeffs.OFFSETS_COOL[1] - ce - intercept) / slope,
    (to + coeffs.OFFSETS_COOL[0] - ce - intercept) / slope,
    (to - coeffs.OFFSETS_WARM[0] - intercept) / slope,
    (to - coeffs.OFFSETS_WARM[1] - intercept) / slope,
    (to - coeffs.OFFSETS_WARM[2] - intercept) / slope,
  ];
}

function getTemperatureAxisValueForOperativeTemperature(
  targetTo: number,
  temperatureAxis: FieldKeyType,
  baseline: any,
  standardMode: AdaptiveStandardMode,
): number {
  if (!baseline || temperatureAxis === FieldKey.OperativeTemperature) {
    return targetTo;
  }

  const standard = standardMode === AdaptiveStandardMode.Ashrae ? JsThermalComfortStandard.ASHRAE : JsThermalComfortStandard.ISO;
  const meta = fieldMetaByKey[temperatureAxis];
  const getTo = (axisValue: number) => {
    const tdb = temperatureAxis === FieldKey.DryBulbTemperature ? axisValue : baseline.tdb;
    const tr = temperatureAxis === FieldKey.MeanRadiantTemperature ? axisValue : baseline.tr;
    return t_o(tdb, tr, baseline.v, standard);
  };
  const minTo = getTo(meta.minValue);
  const maxTo = getTo(meta.maxValue);

  // Prevents division-by-zero during linear interpolation if the operative temperatures 
  // evaluated at the boundary limits are equal (or extremely close due to floating-point precision).
  if (Math.abs(maxTo - minTo) < 1e-6) {
    return targetTo;
  }

  return meta.minValue + ((targetTo - minTo) * (meta.maxValue - meta.minValue)) / (maxTo - minTo);
}

function interpolateZoneValue(value: number, lower: number, upper: number, lowerZone: number, upperZone: number): number {
  if (upper <= lower) {
    return lowerZone;
  }
  return lowerZone + ((value - lower) / (upper - lower)) * (upperZone - lowerZone);
}

function mapAdaptiveBoundariesToZoneScale(to: number, boundaries: number[]): number {
  if (boundaries.some((boundary) => !Number.isFinite(boundary))) {
    return NaN;
  }

  if (to < boundaries[0]) {
    return 1.5 - Math.min(0.49, (boundaries[0] - to) / 4);
  }

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    if (to < boundaries[index + 1]) {
      // Maps the temperature to a normalized, continuous zone level scale (e.g. [1.5, 2.5] for the first zone) 
      // used to generate smooth, continuous contour boundaries in Plotly.
      return interpolateZoneValue(to, boundaries[index], boundaries[index + 1], index + 1.5, index + 2.5);
    }
  }

  const lastBoundary = boundaries[boundaries.length - 1];
  const lastBoundaryZone = boundaries.length + 0.5;
  return lastBoundaryZone + Math.min(0.49, Math.max(0, to - lastBoundary) / 4);
}

function buildAdaptiveBandTrace(
  name: string,
  color: string,
  polygonX: number[],
  polygonY: number[],
  xMetaLabel: string,
  yMetaLabel: string,
  xUnits: string,
  yUnits: string,
  standard: AdaptiveStandardMode,
  hoverMetadata: any[][],
): PlotTraceDto {
  return {
    type: "scatter",
    mode: "lines",
    name,
    x: polygonX,
    y: polygonY,
    showlegend: false,
    fill: "toself",
    fillcolor: color,
    line: { color: CHART_COLORS.LINE, width: 0.8 },
    marker: {},
    opacity: 0.72,
    hovertemplate: "",
    hoverinfo: "skip",
    hoverMetadata,
    isZone: true,
  };
}

function buildAdaptiveBandTraces(
  variableValues: number[],
  boundaryCurves: number[][],
  bands: { label: string; color: string }[],
  variableAxis: FieldKeyType,
  boundaryAxis: FieldKeyType,
  dynamicXAxis: FieldKeyType,
  dynamicYAxis: FieldKeyType,
  unitSystem: UnitSystemType,
  standardMode: AdaptiveStandardMode,
  activeInputPayload: any,
): PlotTraceDto[] {
  const boundaryMeta = fieldMetaByKey[boundaryAxis];
  const variableDisplayValues = variableValues.map((value) => convertFieldValueFromSi(variableAxis, value, unitSystem));
  const boundaryMin = boundaryMeta.minValue;
  const boundaryMax = boundaryMeta.maxValue;
  const traces: PlotTraceDto[] = [];

  bands.forEach((band, bandIndex) => {
    const lowerValues = bandIndex === 0
      ? variableValues.map(() => boundaryMin)
      : boundaryCurves[bandIndex - 1];
    const upperValues = bandIndex === boundaryCurves.length
      ? variableValues.map(() => boundaryMax)
      : boundaryCurves[bandIndex];
    const hasVisibleArea = lowerValues.some((lower, index) => lower < boundaryMax && upperValues[index] > boundaryMin);

    if (!hasVisibleArea) {
      return;
    }

    const lowerDisplayValues = lowerValues.map((value) => (
      convertFieldValueFromSi(boundaryAxis, clamp(value, boundaryMin, boundaryMax), unitSystem)
    ));
    const upperDisplayValues = upperValues.map((value) => (
      convertFieldValueFromSi(boundaryAxis, clamp(value, boundaryMin, boundaryMax), unitSystem)
    ));
    const variableIsXAxis = variableAxis === dynamicXAxis;
    const polygonX = variableIsXAxis
      ? variableDisplayValues.concat(variableDisplayValues.slice().reverse())
      : lowerDisplayValues.concat(upperDisplayValues.slice().reverse());
    const polygonY = variableIsXAxis
      ? lowerDisplayValues.concat(upperDisplayValues.slice().reverse())
      : variableDisplayValues.concat(variableDisplayValues.slice().reverse());

    const hoverMetadata: any[][] = [];
    polygonX.forEach((px, i) => {
      const py = polygonY[i];
      const xSi = convertFieldValueToSi(dynamicXAxis, px, unitSystem);
      const ySi = convertFieldValueToSi(dynamicYAxis, py, unitSystem);

      const args = { ...activeInputPayload };
      const setVal = (k: string, v: number) => {
        if (k === FieldKey.DryBulbTemperature) args.tdb = v;
        else if (k === FieldKey.MeanRadiantTemperature) args.tr = v;
        else if (k === FieldKey.PrevailingMeanOutdoorTemperature) args.trm = v;
        else if (k === FieldKey.RelativeAirSpeed || k === FieldKey.WindSpeed) args.v = v;
        else if (k === FieldKey.OperativeTemperature) { args.tdb = v; args.tr = v; }
      };
      setVal(dynamicXAxis, xSi);
      setVal(dynamicYAxis, ySi);

      const res = calculateAdaptive(args, standardMode);
      const toVal = t_o(args.tdb, args.tr, args.v, standardMode === AdaptiveStandardMode.Ashrae ? JsThermalComfortStandard.ASHRAE : JsThermalComfortStandard.ISO);
      hoverMetadata.push(getAdaptiveHoverMetadata(res, toVal, standardMode, unitSystem));
    });

    traces.push(buildAdaptiveBandTrace(
      band.label,
      band.color,
      polygonX,
      polygonY,
      fieldMetaByKey[dynamicXAxis].label,
      fieldMetaByKey[dynamicYAxis].label,
      fieldMetaByKey[dynamicXAxis].displayUnits[unitSystem],
      fieldMetaByKey[dynamicYAxis].displayUnits[unitSystem],
      standardMode,
      hoverMetadata,
    ));
  });

  return traces;
}

function buildOutdoorTemperatureDynamicBands(
  activeInputPayload: any,
  standardMode: AdaptiveStandardMode,
  unitSystem: UnitSystemType,
  dynamicXAxis: FieldKeyType,
  dynamicYAxis: FieldKeyType,
): PlotTraceDto[] {
  if (!activeInputPayload) {
    return [];
  }

  const hasOutdoorXAxis = dynamicXAxis === FieldKey.PrevailingMeanOutdoorTemperature;
  const hasOutdoorYAxis = dynamicYAxis === FieldKey.PrevailingMeanOutdoorTemperature;
  if (!hasOutdoorXAxis && !hasOutdoorYAxis) {
    return [];
  }

  const otherAxis = hasOutdoorXAxis ? dynamicYAxis : dynamicXAxis;
  const isAshrae = standardMode === AdaptiveStandardMode.Ashrae;

  const addTooltipLayer = (traces: PlotTraceDto[]) => {
    const xMeta = fieldMetaByKey[dynamicXAxis];
    const yMeta = fieldMetaByKey[dynamicYAxis];
    const gPoints = 40;
    const gX = Array.from({ length: gPoints }, (_, i) => xMeta.minValue + ((xMeta.maxValue - xMeta.minValue) * i) / (gPoints - 1));
    const gY = Array.from({ length: gPoints }, (_, i) => yMeta.minValue + ((yMeta.maxValue - yMeta.minValue) * i) / (gPoints - 1));
    const zValues: number[][] = [];
    const hoverMetadataGrid: any[][][] = [];

    for (let i = 0; i < gPoints; i++) {
      const row: number[] = [];
      const hoverMetadataRow: any[][] = [];
      const ySi = gY[i];
      for (let j = 0; j < gPoints; j++) {
        const xSi = gX[j];
        try {
          const args = { ...activeInputPayload };
          const setVal = (k: string, v: number) => {
            if (k === FieldKey.DryBulbTemperature) args.tdb = v;
            else if (k === FieldKey.MeanRadiantTemperature) args.tr = v;
            else if (k === FieldKey.PrevailingMeanOutdoorTemperature) args.trm = v;
            else if (k === FieldKey.RelativeAirSpeed || k === FieldKey.WindSpeed) args.v = v;
            else if (k === FieldKey.OperativeTemperature) { args.tdb = v; args.tr = v; }
          };
          setVal(dynamicXAxis, xSi);
          setVal(dynamicYAxis, ySi);

          const res = calculateAdaptive(args, standardMode);
          const toVal = t_o(args.tdb, args.tr, args.v, isAshrae ? JsThermalComfortStandard.ASHRAE : JsThermalComfortStandard.ISO);
          row.push(1);
          hoverMetadataRow.push(getAdaptiveHoverMetadata(res, toVal, standardMode, unitSystem));
        } catch {
          row.push(NaN);
          hoverMetadataRow.push([NaN]);
        }
      }
      zValues.push(row);
      hoverMetadataGrid.push(hoverMetadataRow);
    }

    const xLabel = dynamicXAxis === FieldKey.PrevailingMeanOutdoorTemperature
      ? (isAshrae ? MeanOutdoorTempLabel.Prevailing : MeanOutdoorTempLabel.Running)
      : xMeta.label;
    const yLabel = dynamicYAxis === FieldKey.PrevailingMeanOutdoorTemperature
      ? (isAshrae ? MeanOutdoorTempLabel.Prevailing : MeanOutdoorTempLabel.Running)
      : yMeta.label;

    traces.unshift(buildContourTrace({
      name: "Tooltip Layer",
      x: gX.map(x => convertFieldValueFromSi(dynamicXAxis, x, unitSystem)),
      y: gY.map(y => convertFieldValueFromSi(dynamicYAxis, y, unitSystem)),
      z: zValues,
      colorscale: TRANSPARENT_COLORSCALE,
      contours: { coloring: "none", showlines: false },
      showscale: false,
      hovertemplate: getAdaptiveHoverTemplate({
        xLabel,
        xUnits: xMeta.displayUnits[unitSystem],
        yLabel,
        yUnits: yMeta.displayUnits[unitSystem],
        standard: standardMode,
      }),
      hoverMetadata: hoverMetadataGrid,
    }));
  };

  if (isTemperatureAxis(otherAxis)) {
    const trmMeta = fieldMetaByKey[FieldKey.PrevailingMeanOutdoorTemperature];
    const trmValues = getFieldValues(
      FieldKey.PrevailingMeanOutdoorTemperature,
      ADAPTIVE_DYNAMIC_POINTS,
      addCoolingEffectTransitionPoints(standardMode, activeInputPayload.v, trmMeta.minValue, trmMeta.maxValue),
    );
    const firstBoundaries = getAdaptiveTemperatureBoundaries(trmValues[0], activeInputPayload.v, standardMode);
    const boundaryCurves = firstBoundaries.map((_, boundaryIndex) => (
      trmValues.map((trm) => {
        const targetTo = getAdaptiveTemperatureBoundaries(trm, activeInputPayload.v, standardMode)[boundaryIndex];
        return getTemperatureAxisValueForOperativeTemperature(targetTo, otherAxis, activeInputPayload, standardMode);
      })
    ));
    const bands = isAshrae ? adaptiveAshraeZonesList : adaptiveEnZonesList;

    const traces = buildAdaptiveBandTraces(
      trmValues,
      boundaryCurves,
      bands,
      FieldKey.PrevailingMeanOutdoorTemperature,
      otherAxis,
      dynamicXAxis,
      dynamicYAxis,
      unitSystem,
      standardMode,
      activeInputPayload,
    );

    addTooltipLayer(traces);
    return traces;
  }

  if (isAirSpeedAxis(otherAxis)) {
    const speedValues = getFieldValues(otherAxis, ADAPTIVE_DYNAMIC_POINTS, COOLING_EFFECT_SPEED_BREAKPOINTS);
    const standard = isAshrae ? JsThermalComfortStandard.ASHRAE : JsThermalComfortStandard.ISO;
    const firstTo = t_o(activeInputPayload.tdb, activeInputPayload.tr, speedValues[0], standard);
    const firstBoundaries = getOutdoorTemperatureBoundaries(firstTo, speedValues[0], standardMode);
    const boundaryCurves = firstBoundaries.map((_, boundaryIndex) => (
      speedValues.map((speed) => {
        const to = t_o(activeInputPayload.tdb, activeInputPayload.tr, speed, standard);
        return getOutdoorTemperatureBoundaries(to, speed, standardMode)[boundaryIndex];
      })
    ));
    const bands = isAshrae ? [
      adaptiveAshraeZonesList[3],
      adaptiveAshraeZonesList[1],
      adaptiveAshraeZonesList[2],
      adaptiveAshraeZonesList[1],
      adaptiveAshraeZonesList[0],
    ] : [
      adaptiveEnZonesList[4],
      adaptiveEnZonesList[1],
      adaptiveEnZonesList[2],
      adaptiveEnZonesList[3],
      adaptiveEnZonesList[2],
      adaptiveEnZonesList[1],
      adaptiveEnZonesList[0],
    ];

    const traces = buildAdaptiveBandTraces(
      speedValues,
      boundaryCurves,
      bands,
      otherAxis,
      FieldKey.PrevailingMeanOutdoorTemperature,
      dynamicXAxis,
      dynamicYAxis,
      unitSystem,
      standardMode,
      activeInputPayload,
    );

    addTooltipLayer(traces);
    return traces;
  }

  return [];
}

export function buildAdaptiveChart(
  payload: AdaptiveChartInputsRequestDto,
  standardMode: AdaptiveStandardMode,
  unitSystem: UnitSystemType = UnitSystem.SI,
  baselineInputId?: string,
): PlotlyChartResponseDto {
  const inputs = getCompareInputs(payload.inputs);
  const showInputLegend = inputs.length > 1;
  const temperatureDisplayUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
  const traces: PlotTraceDto[] = [];
  const isAshrae = standardMode === AdaptiveStandardMode.Ashrae;
  const trmMin = isAshrae ? STANDARD_APPLICABILITY_LIMITS.ASHRAE.TRM_MIN : STANDARD_APPLICABILITY_LIMITS.EN.TRM_MIN;
  const trmMax = isAshrae ? STANDARD_APPLICABILITY_LIMITS.ASHRAE.TRM_MAX : STANDARD_APPLICABILITY_LIMITS.EN.TRM_MAX;

  const baselineInput = inputs.find(i => i.inputId === baselineInputId) || inputs[0];

  if (baselineInput) {
    const v = baselineInput.payload.v;
    const baseTrmPoints = Array.from({ length: 500 }, (_, i) => trmMin + ((trmMax - trmMin) * i) / 499);
    const trmPoints = [
      ...baseTrmPoints,
      ...addCoolingEffectTransitionPoints(standardMode, v, trmMin, trmMax),
    ].sort((a, b) => a - b);

    let lower80: number[] = [];
    let upper80: number[] = [];
    let lower90: number[] = [];
    let upper90: number[] = [];
    let lowerI: number[] = [];
    let upperI: number[] = [];
    let lowerII: number[] = [];
    let upperII: number[] = [];
    let lowerIII: number[] = [];
    let upperIII: number[] = [];

    trmPoints.forEach((trm) => {
      if (isAshrae) {
        const [boundary80Low, boundary90Low, boundary90Up, boundary80Up] =
          getAdaptiveTemperatureBoundaries(trm, v, AdaptiveStandardMode.Ashrae);
        lower80.push(boundary80Low);
        upper80.push(boundary80Up);
        lower90.push(boundary90Low);
        upper90.push(boundary90Up);
      } else {
        const [boundaryIIILow, boundaryIILow, boundaryILow, boundaryIUp, boundaryIIUp, boundaryIIIUp] =
          getAdaptiveTemperatureBoundaries(trm, v, AdaptiveStandardMode.En);
        lowerI.push(boundaryILow);
        upperI.push(boundaryIUp);
        lowerII.push(boundaryIILow);
        upperII.push(boundaryIIUp);
        lowerIII.push(boundaryIIILow);
        upperIII.push(boundaryIIIUp);
      }
    });

    const addPolygon = (lower: number[], upper: number[], nameSuffix: string) => {
      const polygonX = trmPoints.concat(trmPoints.slice().reverse());
      const polygonY = lower.concat(upper.slice().reverse());

      const hoverMetadata: any[][] = [];
      polygonX.forEach((trm, i) => {
        const toVal = polygonY[i];
        const res = calculateAdaptive({ tdb: toVal, tr: toVal, trm, v, units: UnitSystem.SI }, standardMode);
        hoverMetadata.push(getAdaptiveHoverMetadata(res, toVal, standardMode, unitSystem));
      });

      const trace = buildComfortPolygonTrace({
        inputId: baselineInput.inputId,
        nameSuffix,
        polygonX: polygonX.map((x) => roundValue(convertFieldValueFromSi(FieldKey.PrevailingMeanOutdoorTemperature, x, unitSystem))),
        polygonY: polygonY.map((y) => roundValue(convertFieldValueFromSi(FieldKey.DryBulbTemperature, y, unitSystem))),
        hovertemplate: "",
        hoverinfo: "skip",
        isZone: true,
      });

      traces.push(trace);
    };

    if (isAshrae) {
      addPolygon(lower80, upper80, adaptiveAshraeZonesList[1].label);
      addPolygon(lower90, upper90, adaptiveAshraeZonesList[2].label);
    } else {
      addPolygon(lowerI, upperI, adaptiveEnZonesList[3].label);
      addPolygon(lowerII, upperII, adaptiveEnZonesList[2].label);
      addPolygon(lowerIII, upperIII, adaptiveEnZonesList[1].label);
    }
  }

  const gPoints = 40;
  const gTrm = Array.from({ length: gPoints }, (_, i) => 10 + ((trmMax - 10) * i) / (gPoints - 1));
  const gTo = Array.from({ length: gPoints }, (_, i) => 10 + (30 * i) / (gPoints - 1));
  const zValues: number[][] = [];
  const hoverMetadataGrid: any[][][] = [];
  const v_baseline = baselineInput.payload.v;

  for (let i = 0; i < gPoints; i++) {
    const row: number[] = [];
    const hoverMetadataRow: any[][] = [];
    const toVal = gTo[i];
    for (let j = 0; j < gPoints; j++) {
      const trmVal = gTrm[j];
      try {
        const res = calculateAdaptive({ tdb: toVal, tr: toVal, trm: trmVal, v: v_baseline, units: UnitSystem.SI }, standardMode);
        row.push(1);
        hoverMetadataRow.push(getAdaptiveHoverMetadata(res, toVal, standardMode, unitSystem));
      } catch {
        row.push(NaN);
        hoverMetadataRow.push([NaN]);
      }
    }
    zValues.push(row);
    hoverMetadataGrid.push(hoverMetadataRow);
  }

  const xLabel = `${isAshrae ? "Prevailing" : "Running"} ${fieldMetaByKey[FieldKey.PrevailingMeanOutdoorTemperature].label.toLowerCase()}`;
  const yLabel = fieldMetaByKey[FieldKey.OperativeTemperature].label;

  traces.unshift(buildContourTrace({
    name: "Tooltip Layer",
    x: gTrm.map(x => convertFieldValueFromSi(FieldKey.PrevailingMeanOutdoorTemperature, x, unitSystem)),
    y: gTo.map(y => convertFieldValueFromSi(FieldKey.DryBulbTemperature, y, unitSystem)),
    z: zValues,
    colorscale: [[0, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0)"]],
    contours: { coloring: "none", showlines: false },
    showscale: false,
    hovertemplate: getAdaptiveHoverTemplate({
      xLabel,
      xUnits: temperatureDisplayUnits,
      yLabel,
      yUnits: temperatureDisplayUnits,
      standard: standardMode,
    }),
    hoverMetadata: hoverMetadataGrid,
  }));

  inputs.forEach(({ inputId, payload: inputPayload }) => {
    let toValue = t_o(inputPayload.tdb, inputPayload.tr, inputPayload.v, isAshrae ? JsThermalComfortStandard.ASHRAE : JsThermalComfortStandard.ISO);
    let trmValue = inputPayload.trm;

    toValue = convertFieldValueFromSi(FieldKey.DryBulbTemperature, toValue, unitSystem);
    trmValue = convertFieldValueFromSi(FieldKey.PrevailingMeanOutdoorTemperature, trmValue, unitSystem);

    let hoverText = "";
    try {
      const res = calculateAdaptive(inputPayload, standardMode);
      const toValSi = t_o(inputPayload.tdb, inputPayload.tr, inputPayload.v, isAshrae ? JsThermalComfortStandard.ASHRAE : JsThermalComfortStandard.ISO);
      const metadata = getAdaptiveHoverMetadata(res, toValSi, standardMode, unitSystem);
      if (isAshrae) {
        hoverText = `<br>90% Acceptability: ${metadata[3]} to ${metadata[4]} ${temperatureDisplayUnits}<br>80% Acceptability: ${metadata[1]} to ${metadata[2]} ${temperatureDisplayUnits}`;
      } else {
        hoverText = `<br>Category I: ${metadata[1]} to ${metadata[2]} ${temperatureDisplayUnits}<br>Category II: ${metadata[3]} to ${metadata[4]} ${temperatureDisplayUnits}<br>Category III: ${metadata[5]} to ${metadata[6]} ${temperatureDisplayUnits}`;
      }
    } catch {
      // Ignore
    }

    traces.push(buildInputScatterTrace({
      inputId,
      x: roundValue(trmValue),
      y: roundValue(toValue),
      showLegend: showInputLegend,
      hovertemplate: `${inputDisplayMetaById[inputId]?.label ?? "Input"}<br>${xLabel}: %{x:.1f} ${temperatureDisplayUnits}<br>${yLabel}: %{y:.1f} ${temperatureDisplayUnits}${hoverText}<extra></extra>`,
    }));
  });

  return {
    traces,
    layout: {
      title: `${comfortModelMetaById[ComfortModel.AdaptiveAshrae].label} Comfort Chart`,
      paper_bgcolor: CHART_COLORS.PAPER_BG,
      plot_bgcolor: CHART_COLORS.PLOT_BG,
      showlegend: showInputLegend,
      margin: { l: 56, r: 24, t: 48, b: 80 },
      xaxis: {
        title: `${xLabel} (${temperatureDisplayUnits})`,
        range: [
          convertFieldValueFromSi(FieldKey.PrevailingMeanOutdoorTemperature, trmMin, unitSystem),
          convertFieldValueFromSi(FieldKey.PrevailingMeanOutdoorTemperature, trmMax, unitSystem),
        ],
        gridcolor: "#e2e8f0",
      },
      yaxis: {
        title: `${yLabel} (${temperatureDisplayUnits})`,
        range: [
          convertFieldValueFromSi(FieldKey.DryBulbTemperature, 10, unitSystem),
          convertFieldValueFromSi(FieldKey.DryBulbTemperature, 40, unitSystem),
        ],
        gridcolor: "#e2e8f0",
      },
      legend: { orientation: "h", x: 0, y: 1.1 },
      height: 480,
    },
    annotations: [],
    source: CalculationSource.FrontendGenerated,
  };
}

export function buildAdaptiveDynamicChart(
  payload: AdaptiveChartInputsRequestDto,
  standardMode: AdaptiveStandardMode,
  unitSystem: UnitSystemType = UnitSystem.SI,
  dynamicXAxis?: FieldKeyType,
  dynamicYAxis?: FieldKeyType,
  baselineInputId?: string,
): PlotlyChartResponseDto {
  const inputs = getCompareInputs(payload.inputs);
  const showInputLegend = inputs.length > 1;
  const modelId = standardMode === AdaptiveStandardMode.Ashrae ? ComfortModel.AdaptiveAshrae : ComfortModel.AdaptiveEn;

  if (!dynamicXAxis || !dynamicYAxis || dynamicXAxis === dynamicYAxis) {
    return {
      traces: [],
      layout: {
        title: "Invalid Axes Selection",
        paper_bgcolor: "#ffffff",
        plot_bgcolor: "#f8fafc",
        showlegend: false,
        margin: { l: 64, r: 24, t: 48, b: 64 },
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

  const xPoints = 50;
  const yPoints = 50;
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
  const isAshrae = standardMode === AdaptiveStandardMode.Ashrae;

  if (activeInputPayload) {
    const isOutdoorX = dynamicXAxis === FieldKey.PrevailingMeanOutdoorTemperature;
    const isOutdoorY = dynamicYAxis === FieldKey.PrevailingMeanOutdoorTemperature;

    if (isOutdoorX || isOutdoorY) {
      const traces = buildOutdoorTemperatureDynamicBands(activeInputPayload, standardMode, unitSystem, dynamicXAxis, dynamicYAxis);

      inputs.forEach(({ inputId, payload: inputPayload }) => {
        // Map each FieldKey to its corresponding SI value from the Adaptive request payload.
        const ADAPTIVE_FIELD_VALUES: Partial<Record<string, number>> = {
          [FieldKey.DryBulbTemperature]: inputPayload.tdb,
          [FieldKey.MeanRadiantTemperature]: inputPayload.tr,
          [FieldKey.PrevailingMeanOutdoorTemperature]: inputPayload.trm,
          [FieldKey.RelativeAirSpeed]: inputPayload.v,
          [FieldKey.WindSpeed]: inputPayload.v,
          [FieldKey.OperativeTemperature]: t_o(inputPayload.tdb, inputPayload.tr, inputPayload.v, isAshrae ? JsThermalComfortStandard.ASHRAE : JsThermalComfortStandard.ISO),
        };
        const getFieldValue = (key: string): number => ADAPTIVE_FIELD_VALUES[key] ?? 0;

        let inputX = getFieldValue(dynamicXAxis as string);
        let inputY = getFieldValue(dynamicYAxis as string);

        inputX = convertFieldValueFromSi(dynamicXAxis as FieldKey, inputX, unitSystem);
        inputY = convertFieldValueFromSi(dynamicYAxis as FieldKey, inputY, unitSystem);

        let hoverText = "";
        try {
          const res = calculateAdaptive(inputPayload, standardMode);
          const toValSi = t_o(inputPayload.tdb, inputPayload.tr, inputPayload.v, isAshrae ? JsThermalComfortStandard.ASHRAE : JsThermalComfortStandard.ISO);
          const metadata = getAdaptiveHoverMetadata(res, toValSi, standardMode, unitSystem);
          if (isAshrae) {
            hoverText = `<br>${adaptiveAshraeZonesList[2].label}: ${metadata[3]} to ${metadata[4]} °C<br>${adaptiveAshraeZonesList[1].label}: ${metadata[1]} to ${metadata[2]} °C`;
          } else {
            hoverText = `<br>${adaptiveEnZonesList[3].label}: ${metadata[1]} to ${metadata[2]} °C<br>${adaptiveEnZonesList[2].label}: ${metadata[3]} to ${metadata[4]} °C<br>${adaptiveEnZonesList[1].label}: ${metadata[5]} to ${metadata[6]} °C`;
          }
        } catch {
          // Ignore
        }

        traces.push(buildInputScatterTrace({
          inputId,
          x: roundValue(inputX),
          y: roundValue(inputY),
          showLegend: showInputLegend,
          hovertemplate: `${inputDisplayMetaById[inputId]?.label ?? "Input"}<br>${xMeta.label}: %{x:.2f} ${xMeta.displayUnits[unitSystem]}<br>${yMeta.label}: %{y:.2f} ${yMeta.displayUnits[unitSystem]}${hoverText}<extra></extra>`,
        }));
      });

      return {
        traces,
        layout: {
          title: `${comfortModelMetaById[modelId].label} Dynamic Chart (${xMeta.label} vs ${yMeta.label})`,
          paper_bgcolor: CHART_COLORS.PAPER_BG,
          plot_bgcolor: CHART_COLORS.PLOT_BG,
          showlegend: showInputLegend,
          margin: { l: 64, r: 24, t: 48, b: 64 },
          xaxis: {
            title: `${xMeta.label} (${xMeta.displayUnits[unitSystem]})`,
            range: [xMin, xMax],
            gridcolor: "#e2e8f0",
          },
          yaxis: {
            title: `${yMeta.label} (${yMeta.displayUnits[unitSystem]})`,
            range: [yMin, yMax],
            gridcolor: "#e2e8f0",
          },
          legend: { orientation: "h", x: 0, y: 1.1 },
          height: 480,
        },
        annotations: [],
        source: CalculationSource.FrontendGenerated,
      };
    }

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
          else if (key === FieldKey.PrevailingMeanOutdoorTemperature) { pointArgs.trm = val; }
          else if (key === FieldKey.RelativeAirSpeed || key === FieldKey.WindSpeed) { pointArgs.v = val; }
          else if (key === FieldKey.OperativeTemperature) { pointArgs.tdb = val; pointArgs.tr = val; }
        };

        updateParams(dynamicXAxis, xSi);
        updateParams(dynamicYAxis, ySi);

        try {
          const res = calculateAdaptive(pointArgs, standardMode);
          const toVal = t_o(pointArgs.tdb, pointArgs.tr, pointArgs.v, isAshrae ? JsThermalComfortStandard.ASHRAE : JsThermalComfortStandard.ISO);
          if (isAshrae) {
            const dynamicZone = getAshraeDynamicZone(res, toVal);
            row.push(dynamicZone.z);
            textRow.push(dynamicZone.label);
          } else {
            const dynamicZone = getEnDynamicZone(res, toVal);
            row.push(dynamicZone.z);
            textRow.push(dynamicZone.label);
          }
          hoverMetadataRow.push(getAdaptiveHoverMetadata(res, toVal, standardMode, unitSystem));
        } catch {
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
      name: "Adaptive Zones",
      x: xValues,
      y: yValues,
      z: zValues,
      text: textValues,
      colorscale: isAshrae ? ADAPTIVE_ASHRAE_COLORSCALE : ADAPTIVE_EN_COLORSCALE,
      contours: ADAPTIVE_CONTOURS,
      showscale: false,
      zmin: 1.5,
      zmax: isAshrae ? 5.5 : 7.5,
      hovertemplate: getAdaptiveHoverTemplate({
        xLabel: xMeta.label,
        xUnits: xMeta.displayUnits[unitSystem],
        yLabel: yMeta.label,
        yUnits: yMeta.displayUnits[unitSystem],
        standard: standardMode,
      }),
      hoverMetadata,
      opacity: 0.75,
      isBackgroundZone: true,
    }));
  }

  inputs.forEach(({ inputId, payload: inputPayload }) => {
    // Map each FieldKey to its corresponding SI value from the Adaptive request payload.
    const ADAPTIVE_FIELD_VALUES: Partial<Record<string, number>> = {
      [FieldKey.DryBulbTemperature]: inputPayload.tdb,
      [FieldKey.MeanRadiantTemperature]: inputPayload.tr,
      [FieldKey.PrevailingMeanOutdoorTemperature]: inputPayload.trm,
      [FieldKey.RelativeAirSpeed]: inputPayload.v,
      [FieldKey.WindSpeed]: inputPayload.v,
      [FieldKey.OperativeTemperature]: t_o(inputPayload.tdb, inputPayload.tr, inputPayload.v, isAshrae ? JsThermalComfortStandard.ASHRAE : JsThermalComfortStandard.ISO),
    };
    const getFieldValue = (key: string): number => ADAPTIVE_FIELD_VALUES[key] ?? 0;

    let inputX = getFieldValue(dynamicXAxis as string);
    let inputY = getFieldValue(dynamicYAxis as string);

    inputX = convertFieldValueFromSi(dynamicXAxis as FieldKey, inputX, unitSystem);
    inputY = convertFieldValueFromSi(dynamicYAxis as FieldKey, inputY, unitSystem);

    let hoverText = "";
    try {
      const res = calculateAdaptive(inputPayload, standardMode);
      const toValSi = t_o(inputPayload.tdb, inputPayload.tr, inputPayload.v, isAshrae ? JsThermalComfortStandard.ASHRAE : JsThermalComfortStandard.ISO);
      const metadata = getAdaptiveHoverMetadata(res, toValSi, standardMode, unitSystem);
      if (isAshrae) {
        hoverText = `<br>${adaptiveAshraeZonesList[2].label}: ${metadata[3]} to ${metadata[4]} °C<br>${adaptiveAshraeZonesList[1].label}: ${metadata[1]} to ${metadata[2]} °C`;
      } else {
        hoverText = `<br>${adaptiveEnZonesList[3].label}: ${metadata[1]} to ${metadata[2]} °C<br>${adaptiveEnZonesList[2].label}: ${metadata[3]} to ${metadata[4]} °C<br>${adaptiveEnZonesList[1].label}: ${metadata[5]} to ${metadata[6]} °C`;
      }
    } catch {
      // Ignore
    }

    traces.push(buildInputScatterTrace({
      inputId,
      x: roundValue(inputX),
      y: roundValue(inputY),
      showLegend: showInputLegend,
      hovertemplate: `${inputDisplayMetaById[inputId]?.label ?? "Input"}<br>${xMeta.label}: %{x:.2f} ${xMeta.displayUnits[unitSystem]}<br>${yMeta.label}: %{y:.2f} ${yMeta.displayUnits[unitSystem]}${hoverText}<extra></extra>`,
    }));
  });

  return {
    traces,
    layout: {
      title: `${comfortModelMetaById[modelId].label} Dynamic Chart (${xMeta.label} vs ${yMeta.label})`,
      paper_bgcolor: CHART_COLORS.PAPER_BG,
      plot_bgcolor: CHART_COLORS.PLOT_BG,
      showlegend: showInputLegend,
      margin: { l: 64, r: 24, t: 48, b: 64 },
      xaxis: {
        title: `${xMeta.label} (${xMeta.displayUnits[unitSystem]})`,
        range: [xMin, xMax],
        gridcolor: "#e2e8f0",
      },
      yaxis: {
        title: `${yMeta.label} (${yMeta.displayUnits[unitSystem]})`,
        range: [yMin, yMax],
        gridcolor: "#e2e8f0",
      },
      legend: { orientation: "h", x: 0, y: 1.1 },
      height: 480,
    },
    annotations: [],
    source: CalculationSource.FrontendGenerated,
  };
}

function getAshraeDynamicZone(result: AdaptiveResponseDto, to: number): { z: number; label: string } {
  const boundaries = [
    result.tmp_cmf_80_low,
    result.tmp_cmf_90_low,
    result.tmp_cmf_90_up,
    result.tmp_cmf_80_up,
  ];

  if (!boundaries.every(isFiniteNumber)) {
    return { z: NaN, label: "" };
  }

  if (result.acceptability_90) {
    return { z: mapAdaptiveBoundariesToZoneScale(to, boundaries), label: adaptiveAshraeZonesList[2].label };
  }
  if (result.acceptability_80) {
    return { z: mapAdaptiveBoundariesToZoneScale(to, boundaries), label: adaptiveAshraeZonesList[1].label };
  }

  return {
    z: mapAdaptiveBoundariesToZoneScale(to, boundaries),
    label: to > boundaries[3] ? adaptiveAshraeZonesList[3].label : adaptiveAshraeZonesList[0].label,
  };
}

function getEnDynamicZone(result: AdaptiveResponseDto, to: number): { z: number; label: string } {
  const boundaries = [
    result.tmp_cmf_cat_iii_low,
    result.tmp_cmf_cat_ii_low,
    result.tmp_cmf_cat_i_low,
    result.tmp_cmf_cat_i_up,
    result.tmp_cmf_cat_ii_up,
    result.tmp_cmf_cat_iii_up,
  ];

  if (!boundaries.every(isFiniteNumber)) {
    return { z: NaN, label: "" };
  }

  if (result.acceptability_cat_i) {
    return { z: mapAdaptiveBoundariesToZoneScale(to, boundaries), label: adaptiveEnZonesList[3].label };
  }
  if (result.acceptability_cat_ii) {
    return { z: mapAdaptiveBoundariesToZoneScale(to, boundaries), label: adaptiveEnZonesList[2].label };
  }
  if (result.acceptability_cat_iii) {
    return { z: mapAdaptiveBoundariesToZoneScale(to, boundaries), label: adaptiveEnZonesList[1].label };
  }

  return {
    z: mapAdaptiveBoundariesToZoneScale(to, boundaries),
    label: to > boundaries[5] ? adaptiveEnZonesList[4].label : adaptiveEnZonesList[0].label,
  };
}

// ── Model Config Builder ──────────────────────────

const adaptiveChartIds: ChartIdType[] = [ChartId.Adaptive, ChartId.AdaptiveDynamic];

function createAdaptiveModelConfig(modelId: ComfortModel, standardMode: AdaptiveStandardMode) {
  const isAshrae = standardMode === AdaptiveStandardMode.Ashrae;
  const temperatureBehavior = createTemperatureControlBehavior(InputControlId.Temperature);

  const adaptiveAirSpeedBehavior = createControlBehavior({
    controlId: InputControlId.AirSpeed,
    fieldKey: FieldKey.RelativeAirSpeed,
    presetOptions: isAshrae ? ashraeAirSpeedPresets : enAirSpeedPresets,
    getPresentation: (context, meta) => {
      const presentation = buildDefaultPresentation(context, meta);
      return {
        label: "Air speed",
        displayUnits: presentation.displayUnits,
        step: presentation.step,
        decimals: presentation.decimals,
        rangeText: presentation.rangeText,
        minValue: presentation.minValue,
        maxValue: presentation.maxValue,
      };
    },
  });

  const builder = new ComfortModelBuilder<AdaptiveResponseDto, AdaptiveChartSourceDto>(modelId);

  builder.addControl({
    id: InputControlId.Temperature,
    behavior: temperatureBehavior,
  });

  builder.addControl({
    id: InputControlId.RadiantTemperature,
    behavior: createControlBehavior({
      controlId: InputControlId.RadiantTemperature,
      fieldKey: FieldKey.MeanRadiantTemperature,
      hidden: (context) => {
        return context.options[OptionKey.TemperatureMode] !== TemperatureMode.Air;
      },
      getPresentation: (context, meta) => {
        const presentation = buildDefaultPresentation(context, meta);
        return {
          label: "Mean radiant temperature",
          displayUnits: presentation.displayUnits,
          step: presentation.step,
          decimals: presentation.decimals,
          rangeText: presentation.rangeText,
          minValue: presentation.minValue,
          maxValue: presentation.maxValue,
        };
      },
    }),
  });

  builder.addControl({
    id: InputControlId.PrevailingMeanOutdoorTemperature,
    behavior: createControlBehavior({
      controlId: InputControlId.PrevailingMeanOutdoorTemperature,
      fieldKey: FieldKey.PrevailingMeanOutdoorTemperature,
      getPresentation: (context, meta) => {
        const presentation = buildDefaultPresentation(context, meta);
        let label: string = MeanOutdoorTempLabel.Prevailing;
        if (!isAshrae) {
          label = MeanOutdoorTempLabel.Running;
        }
        return {
          label: label,
          displayUnits: presentation.displayUnits,
          step: presentation.step,
          decimals: presentation.decimals,
          rangeText: presentation.rangeText,
          minValue: presentation.minValue,
          maxValue: presentation.maxValue,
        };
      },
    }),
  });

  builder.addControl({
    id: InputControlId.AirSpeed,
    behavior: adaptiveAirSpeedBehavior,
  });

  builder.addOptionHandler(OptionKey.TemperatureMode, (context, nextValue) => {
    if (temperatureBehavior.applyOptionChange) {
      return temperatureBehavior.applyOptionChange(context, OptionKey.TemperatureMode, nextValue);
    }
    return null;
  });

  const nextDefaultOptions = Object.assign({}, defaultAdaptiveOptions);
  nextDefaultOptions[OptionKey.TemperatureMode] = TemperatureMode.Operative;
  builder.setDefaultOptions(nextDefaultOptions);

  if (isAshrae) {
    builder
      .setLabel(comfortModelMetaById[ComfortModel.AdaptiveAshrae].label)
      .setDescription(comfortModelMetaById[ComfortModel.AdaptiveAshrae].description);
  } else {
    builder
      .setLabel(comfortModelMetaById[ComfortModel.AdaptiveEn].label)
      .setDescription(comfortModelMetaById[ComfortModel.AdaptiveEn].description);
  }

  builder.setDefaultChart(ChartId.Adaptive, adaptiveChartIds);
  builder.setOptionNormalizer(normalizeAdaptiveOptionsSnapshot);

  builder.setDynamicAxisFields([
    FieldKey.DryBulbTemperature,
    FieldKey.MeanRadiantTemperature,
    FieldKey.OperativeTemperature,
    FieldKey.RelativeAirSpeed,
    FieldKey.PrevailingMeanOutdoorTemperature,
  ]);

  builder.setCalculator((state, visibleInputIds) => {
    const chartRequest = toAdaptiveChartInputsRequest(state, visibleInputIds, modelId);
    const resultsByInput = createEmptyResults<AdaptiveResponseDto>();

    visibleInputIds.forEach((inputId) => {
      const request = toAdaptiveRequest(state, inputId, modelId);
      resultsByInput[inputId] = calculateAdaptive(request, standardMode);
    });

    return {
      resultsByInput: resultsByInput,
      chartSource: {
        chartRequest: chartRequest,
        resultsByInput: resultsByInput,
        standardMode: standardMode,
        dynamicXAxis: state.ui.dynamicXAxis,
        dynamicYAxis: state.ui.dynamicYAxis,
        baselineInputId: state.ui.chartBaselineInputId,
      },
    };
  });

  builder.setResultBuilder((results, visibleInputIds, unitSystem, options, selectedChartId) => {
    const sections = [];

    sections.push(
      buildResultSection("Compliance", results, visibleInputIds, (result) => {
        let isComfortable = false;
        if (isAshrae) {
          isComfortable = result.acceptability_80 === true;
        } else {
          isComfortable = result.acceptability_cat_iii === true;
        }

        const isCompliant = result.isCompliant && isComfortable;

        let text: ComplianceStatus = ComplianceStatus.OutOfRange;
        if (isCompliant) {
          text = ComplianceStatus.Compliant;
        } else if (result.isCompliant) {
          text = ComplianceStatus.NonCompliant;
        }

        const compliantColor = isAshrae ? adaptiveAshraeZonesList[2].textColor : adaptiveEnZonesList[2].textColor;
        const nonCompliantColor = isAshrae ? adaptiveAshraeZonesList[3].textColor : adaptiveEnZonesList[4].textColor;

        return {
          text: text,
          color: isCompliant ? compliantColor : nonCompliantColor,
        };
      }),
    );

    if (isAshrae) {
      sections.push(
        buildResultSection(adaptiveAshraeZonesList[1].label, results, visibleInputIds, (result) => {
          if (!result.status_80) {
            return { text: "N/A", color: "" };
          }

          const tempUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
          let subtext = undefined;
          if (result.tmp_cmf_80_low !== undefined && result.tmp_cmf_80_up !== undefined) {
            const low = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.tmp_cmf_80_low, unitSystem);
            const up = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.tmp_cmf_80_up, unitSystem);
            subtext = `${low.toFixed(1)} ~ ${up.toFixed(1)} ${tempUnits}`;
          }

          const toVal = t_o(results[visibleInputIds[0]]?.t_cmf ?? 0, results[visibleInputIds[0]]?.t_cmf ?? 0, results[visibleInputIds[0]]?.acceptability_80 !== undefined ? 0.1 : 0.1, JsThermalComfortStandard.ASHRAE);

          return {
            text: result.status_80,
            subtext: subtext,
            color: result.acceptability_80 ? adaptiveAshraeZonesList[1].textColor : (result.t_cmf > 0 && result.tmp_cmf_80_low !== undefined && result.tmp_cmf_80_low > 0 ? (result.t_cmf < result.tmp_cmf_80_low ? adaptiveAshraeZonesList[0].textColor : adaptiveAshraeZonesList[3].textColor) : adaptiveAshraeZonesList[3].textColor),
          };
        }),
        buildResultSection(adaptiveAshraeZonesList[2].label, results, visibleInputIds, (result) => {
          if (!result.status_90) {
            return { text: "N/A", color: "" };
          }

          const tempUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
          let subtext = undefined;
          if (result.tmp_cmf_90_low !== undefined && result.tmp_cmf_90_up !== undefined) {
            const low = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.tmp_cmf_90_low, unitSystem);
            const up = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.tmp_cmf_90_up, unitSystem);
            subtext = `${low.toFixed(1)} ~ ${up.toFixed(1)} ${tempUnits}`;
          }

          return {
            text: result.status_90,
            subtext: subtext,
            color: result.acceptability_90 ? adaptiveAshraeZonesList[2].textColor : (result.t_cmf > 0 && result.tmp_cmf_90_low !== undefined && result.tmp_cmf_90_low > 0 ? (result.t_cmf < result.tmp_cmf_90_low ? adaptiveAshraeZonesList[0].textColor : adaptiveAshraeZonesList[3].textColor) : adaptiveAshraeZonesList[3].textColor),
          };
        }),
      );
    } else {
      sections.push(
        buildResultSection(adaptiveEnZonesList[3].label, results, visibleInputIds, (result) => {
          if (!result.status_cat_i) return { text: "N/A", color: "" };
          const tempUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
          let subtext = undefined;
          if (result.tmp_cmf_cat_i_low !== undefined && result.tmp_cmf_cat_i_up !== undefined) {
            const low = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.tmp_cmf_cat_i_low, unitSystem);
            const up = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.tmp_cmf_cat_i_up, unitSystem);
            subtext = `${low.toFixed(1)} ~ ${up.toFixed(1)} ${tempUnits}`;
          }
          return {
            text: result.status_cat_i,
            subtext: subtext,
            color: result.acceptability_cat_i ? adaptiveEnZonesList[3].textColor : (result.t_cmf > 0 && result.tmp_cmf_cat_i_low !== undefined && result.tmp_cmf_cat_i_low > 0 ? (result.t_cmf < result.tmp_cmf_cat_i_low ? adaptiveEnZonesList[0].textColor : adaptiveEnZonesList[4].textColor) : adaptiveEnZonesList[4].textColor),
          };
        }),
        buildResultSection(adaptiveEnZonesList[2].label, results, visibleInputIds, (result) => {
          if (!result.status_cat_ii) return { text: "N/A", color: "" };
          const tempUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
          let subtext = undefined;
          if (result.tmp_cmf_cat_ii_low !== undefined && result.tmp_cmf_cat_ii_up !== undefined) {
            const low = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.tmp_cmf_cat_ii_low, unitSystem);
            const up = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.tmp_cmf_cat_ii_up, unitSystem);
            subtext = `${low.toFixed(1)} ~ ${up.toFixed(1)} ${tempUnits}`;
          }
          return {
            text: result.status_cat_ii,
            subtext: subtext,
            color: result.acceptability_cat_ii ? adaptiveEnZonesList[2].textColor : (result.t_cmf > 0 && result.tmp_cmf_cat_ii_low !== undefined && result.tmp_cmf_cat_ii_low > 0 ? (result.t_cmf < result.tmp_cmf_cat_ii_low ? adaptiveEnZonesList[0].textColor : adaptiveEnZonesList[4].textColor) : adaptiveEnZonesList[4].textColor),
          };
        }),
        buildResultSection(adaptiveEnZonesList[1].label, results, visibleInputIds, (result) => {
          if (!result.status_cat_iii) return { text: "N/A", color: "" };
          const tempUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
          let subtext = undefined;
          if (result.tmp_cmf_cat_iii_low !== undefined && result.tmp_cmf_cat_iii_up !== undefined) {
            const low = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.tmp_cmf_cat_iii_low, unitSystem);
            const up = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.tmp_cmf_cat_iii_up, unitSystem);
            subtext = `${low.toFixed(1)} ~ ${up.toFixed(1)} ${tempUnits}`;
          }
          return {
            text: result.status_cat_iii,
            subtext: subtext,
            color: result.acceptability_cat_iii ? adaptiveEnZonesList[1].textColor : (result.t_cmf > 0 && result.tmp_cmf_cat_iii_low !== undefined && result.tmp_cmf_cat_iii_low > 0 ? (result.t_cmf < result.tmp_cmf_cat_iii_low ? adaptiveEnZonesList[0].textColor : adaptiveEnZonesList[4].textColor) : adaptiveEnZonesList[4].textColor),
          };
        }),
      );
    }

    return sections;
  });

  builder.setChartBuilder((chartId, chartSource, resultsByInput, unitSystem) => {
    if (!chartSource || !adaptiveChartIds.includes(chartId)) {
      return null;
    }

    if (chartId === ChartId.AdaptiveDynamic) {
      return buildAdaptiveDynamicChart(
        chartSource.chartRequest,
        standardMode,
        unitSystem,
        chartSource.dynamicXAxis as FieldKeyType,
        chartSource.dynamicYAxis as FieldKeyType,
        chartSource.baselineInputId,
      );
    }

    return buildAdaptiveChart(chartSource.chartRequest, standardMode, unitSystem, chartSource.baselineInputId);
  });

  builder.setZones(isAshrae ? adaptiveAshraeZonesList : adaptiveEnZonesList);
  builder.setLegendChartIds([ChartId.Adaptive, ChartId.AdaptiveDynamic]);
  builder.setLegendTitle("Adaptive Zones");
  builder.setLockYAxisChartIds([]);

  return builder.build();
}

export const adaptiveAshraeModelConfig = createAdaptiveModelConfig(ComfortModel.AdaptiveAshrae, AdaptiveStandardMode.Ashrae);
export const adaptiveEnModelConfig = createAdaptiveModelConfig(ComfortModel.AdaptiveEn, AdaptiveStandardMode.En);
