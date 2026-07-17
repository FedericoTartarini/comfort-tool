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
import type { PlotlyChartResponseDto, PlotTraceDto, CompareInputMap } from "../models/comfortDtos";

import { OptionKey, TemperatureMode, defaultAdaptiveOptions, AdaptiveStandardMode } from "../models/inputModes";
import {
  buildDefaultPresentation,
  createControlBehavior,
  createTemperatureControlBehavior,
} from "../services/comfort/controls/controlBehaviors";
import { convertFieldValueFromSi } from "../services/units";
import {
  ComfortModelBuilder,
  isRecord,
  createEmptyResults,
  buildResultSectionsFromRows,
  type ResultRowDefinition,
} from "../state/comfortTool/modelConfigs/builder";
import { roundValue, isFiniteNumber } from "../services/comfort/helpers";
import { buildComfortPolygonTrace } from "../services/comfort/charts/plotlyBuilders";
import { createFieldAxisScale } from "../services/comfort/charts/axis";
import { buildBoundaryRegionFieldChart, buildGridContourFieldChart } from "../services/comfort/charts/chartEngine";
import {
  resolveBaselineInputEntry,
  shouldShowInputLegend,
  type BuildInputTraceGroupsOptions,
} from "../services/comfort/charts/inputPoints";
import {
  buildClosedBoundaryPolygonTrace,
  buildBoundaryRegionTraces,
  buildFilledBoundaryRegionTrace,
  buildTooltipGridTrace,
} from "../services/comfort/charts/boundaryRegionEngine";
import { buildZoneContourLayers } from "../services/comfort/charts/zoneGrid";
import type { ChartAxisScale, ChartLayoutSpec } from "../services/comfort/charts/types";

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

const adaptiveAshraeBandSequence = [
  adaptiveAshraeZonesList[0], // Too cool
  adaptiveAshraeZonesList[1], // 80% Acceptability
  adaptiveAshraeZonesList[2], // 90% Acceptability
  adaptiveAshraeZonesList[1], // 80% Acceptability
  adaptiveAshraeZonesList[3], // Too warm
];

const adaptiveEnBandSequence = [
  adaptiveEnZonesList[0], // Too cool
  adaptiveEnZonesList[1], // Category III
  adaptiveEnZonesList[2], // Category II
  adaptiveEnZonesList[3], // Category I
  adaptiveEnZonesList[2], // Category II
  adaptiveEnZonesList[1], // Category III
  adaptiveEnZonesList[4], // Too warm
];

export const ADAPTIVE_ASHRAE_COLORSCALE = adaptiveAshraeBandSequence
  .map((zone) => zone.color)
  .reduce((acc, color, index, array) => {
    const step = 1 / array.length;
    acc.push([index * step, color]);
    acc.push([(index + 1) * step, color]);
    return acc;
  }, [] as [number, string][]);

export const ADAPTIVE_EN_COLORSCALE = adaptiveEnBandSequence
  .map((zone) => zone.color)
  .reduce((acc, color, index, array) => {
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
    OFFSETS_COOL: [-3, -4, -5],
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

    // Match CBE comfort_tool issue #89 and PR #91: apply elevated-air-speed cooling per
    // unadjusted upper boundary once that boundary reaches 25 degC.
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
    const coefficients = ADAPTIVE_COEFFICIENTS.ASHRAE;
    const tCmfSi = coefficients.SLOPE * trmSi + coefficients.INTERCEPT;

    const baseUpper80 = tCmfSi + coefficients.OFFSETS_WARM[1];
    const baseUpper90 = tCmfSi + coefficients.OFFSETS_WARM[0];

    const ce80 = getCe(vSi, baseUpper80);
    const ce90 = getCe(vSi, baseUpper90);

    const tmp_cmf_80_low_si = tCmfSi + coefficients.OFFSETS_COOL[1];
    const tmp_cmf_80_up_si = baseUpper80 + ce80;
    const tmp_cmf_90_low_si = tCmfSi + coefficients.OFFSETS_COOL[0];
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

  // Match CBE comfort_tool issue #89 and PR #91: apply elevated-air-speed cooling per
  // unadjusted upper boundary once that boundary reaches 25 degC.
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
  const coefficients = ADAPTIVE_COEFFICIENTS.EN;
  const tCmfSi = coefficients.SLOPE * trmSi + coefficients.INTERCEPT;

  const baseUpperI = tCmfSi + coefficients.OFFSETS_WARM[0];
  const baseUpperIi = tCmfSi + coefficients.OFFSETS_WARM[1];
  const baseUpperIii = tCmfSi + coefficients.OFFSETS_WARM[2];

  const ceCatI = getCe(vSi, baseUpperI);
  const ceCatIi = getCe(vSi, baseUpperIi);
  const ceCatIii = getCe(vSi, baseUpperIii);

  const tmp_cmf_cat_i_low_si = tCmfSi + coefficients.OFFSETS_COOL[0];
  const tmp_cmf_cat_i_up_si = baseUpperI + ceCatI;
  const tmp_cmf_cat_ii_low_si = tCmfSi + coefficients.OFFSETS_COOL[1];
  const tmp_cmf_cat_ii_up_si = baseUpperIi + ceCatIi;
  const tmp_cmf_cat_iii_low_si = tCmfSi + coefficients.OFFSETS_COOL[2];
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

function isTemperatureAxis(field: FieldKeyType): boolean {
  return field === FieldKey.DryBulbTemperature ||
    field === FieldKey.MeanRadiantTemperature ||
    field === FieldKey.OperativeTemperature;
}

function isAirSpeedAxis(field: FieldKeyType): boolean {
  return field === FieldKey.RelativeAirSpeed || field === FieldKey.WindSpeed;
}

function getAdaptiveJtcStandard(standardMode: AdaptiveStandardMode): JsThermalComfortStandard {
  return standardMode === AdaptiveStandardMode.Ashrae
    ? JsThermalComfortStandard.ASHRAE
    : JsThermalComfortStandard.ISO;
}

function getAdaptiveModelId(standardMode: AdaptiveStandardMode): ComfortModel {
  return standardMode === AdaptiveStandardMode.Ashrae
    ? ComfortModel.AdaptiveAshrae
    : ComfortModel.AdaptiveEn;
}

type AdaptiveAxisPayloadKey = Exclude<keyof AdaptiveRequestDto, "units">;

const adaptiveAxisPayloadKeysByField: Partial<
  Record<FieldKeyType, ReadonlyArray<AdaptiveAxisPayloadKey>>
> = {
  [FieldKey.DryBulbTemperature]: ["tdb"],
  [FieldKey.MeanRadiantTemperature]: ["tr"],
  [FieldKey.PrevailingMeanOutdoorTemperature]: ["trm"],
  [FieldKey.RelativeAirSpeed]: ["v"],
  [FieldKey.WindSpeed]: ["v"],
  [FieldKey.OperativeTemperature]: ["tdb", "tr"],
};

function adaptiveAxesSharePayloadKey(xAxis: FieldKeyType, yAxis: FieldKeyType): boolean {
  const xKeys = adaptiveAxisPayloadKeysByField[xAxis] ?? [];
  const yKeys = adaptiveAxisPayloadKeysByField[yAxis] ?? [];
  return xKeys.some((key) => yKeys.includes(key));
}

function setAdaptiveAxisValue(payload: AdaptiveRequestDto, key: FieldKeyType, value: number): void {
  if (key === FieldKey.DryBulbTemperature) payload.tdb = value;
  else if (key === FieldKey.MeanRadiantTemperature) payload.tr = value;
  else if (key === FieldKey.PrevailingMeanOutdoorTemperature) payload.trm = value;
  else if (key === FieldKey.RelativeAirSpeed || key === FieldKey.WindSpeed) payload.v = value;
  else if (key === FieldKey.OperativeTemperature) {
    payload.tdb = value;
    payload.tr = value;
  }
}

function getAdaptiveAxisValue(payload: AdaptiveRequestDto, key: FieldKeyType, standardMode: AdaptiveStandardMode): number {
  const fieldValues: Partial<Record<FieldKeyType, number>> = {
    [FieldKey.DryBulbTemperature]: payload.tdb,
    [FieldKey.MeanRadiantTemperature]: payload.tr,
    [FieldKey.PrevailingMeanOutdoorTemperature]: payload.trm,
    [FieldKey.RelativeAirSpeed]: payload.v,
    [FieldKey.WindSpeed]: payload.v,
    [FieldKey.OperativeTemperature]: t_o(payload.tdb, payload.tr, payload.v, getAdaptiveJtcStandard(standardMode)),
  };

  return fieldValues[key] ?? 0;
}

interface AdaptiveChartEvaluation {
  result: AdaptiveResponseDto;
  operativeTemperature: number;
}

function evaluateAdaptiveChartPayload(
  payload: AdaptiveRequestDto,
  standardMode: AdaptiveStandardMode,
): AdaptiveChartEvaluation {
  const result = calculateAdaptive(payload, standardMode);
  const operativeTemperature = t_o(
    payload.tdb,
    payload.tr,
    payload.v,
    getAdaptiveJtcStandard(standardMode),
  );

  return { result, operativeTemperature };
}

function getAdaptiveHoverTemplate({
  xLabel,
  xUnits,
  yLabel,
  yUnits,
  boundaryUnits,
  standard,
  inputLabel,
}: {
  xLabel: string;
  xUnits: string;
  yLabel: string;
  yUnits: string;
  boundaryUnits: string;
  standard: AdaptiveStandardMode;
  inputLabel?: string;
}): string {
  const isAshrae = standard === AdaptiveStandardMode.Ashrae;
  const parts = [];

  if (inputLabel) parts.push(`<b>${inputLabel}</b>`);
  parts.push(`${xLabel}: %{x:.1f} ${xUnits}`);
  parts.push(`${yLabel}: %{y:.1f} ${yUnits}`);

  if (isAshrae) {
    parts.push(`${adaptiveAshraeZonesList[2].label}: %{customdata[3]:.1f} to %{customdata[4]:.1f} ${boundaryUnits}`);
    parts.push(`${adaptiveAshraeZonesList[1].label}: %{customdata[1]:.1f} to %{customdata[2]:.1f} ${boundaryUnits}`);
  } else {
    parts.push(`${adaptiveEnZonesList[3].label}: %{customdata[1]:.1f} to %{customdata[2]:.1f} ${boundaryUnits}`);
    parts.push(`${adaptiveEnZonesList[2].label}: %{customdata[3]:.1f} to %{customdata[4]:.1f} ${boundaryUnits}`);
    parts.push(`${adaptiveEnZonesList[1].label}: %{customdata[5]:.1f} to %{customdata[6]:.1f} ${boundaryUnits}`);
  }

  return parts.join("<br>") + "<extra></extra>";
}

function getAdaptiveBoundaryUnits(unitSystem: UnitSystemType): string {
  return fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
}

function getAdaptiveHoverMetadata(
  result: AdaptiveResponseDto,
  standard: AdaptiveStandardMode,
  unitSystem: UnitSystemType
): any[] {
  // Boundary metadata is converted once here; hover templates only append display units.
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

function getAdaptiveChartHoverMetadata(
  payload: AdaptiveRequestDto,
  standardMode: AdaptiveStandardMode,
  unitSystem: UnitSystemType,
): any[] {
  const { result } = evaluateAdaptiveChartPayload(payload, standardMode);
  return getAdaptiveHoverMetadata(result, standardMode, unitSystem);
}

function getAdaptiveDynamicZone(
  evaluation: AdaptiveChartEvaluation,
  standardMode: AdaptiveStandardMode,
): { z: number; label: string } {
  return standardMode === AdaptiveStandardMode.Ashrae
    ? getAshraeDynamicZone(evaluation.result, evaluation.operativeTemperature)
    : getEnDynamicZone(evaluation.result, evaluation.operativeTemperature);
}

function getAdaptiveBoundaryHoverText(
  metadata: any[],
  standardMode: AdaptiveStandardMode,
  boundaryUnits: string,
): string {
  if (standardMode === AdaptiveStandardMode.Ashrae) {
    return `<br>${adaptiveAshraeZonesList[2].label}: ${metadata[3]} to ${metadata[4]} ${boundaryUnits}<br>${adaptiveAshraeZonesList[1].label}: ${metadata[1]} to ${metadata[2]} ${boundaryUnits}`;
  }

  return `<br>${adaptiveEnZonesList[3].label}: ${metadata[1]} to ${metadata[2]} ${boundaryUnits}<br>${adaptiveEnZonesList[2].label}: ${metadata[3]} to ${metadata[4]} ${boundaryUnits}<br>${adaptiveEnZonesList[1].label}: ${metadata[5]} to ${metadata[6]} ${boundaryUnits}`;
}

function getAdaptiveInputHoverTemplate({
  inputLabel,
  inputPayload,
  xLabel,
  xUnits,
  yLabel,
  yUnits,
  coordinateDecimals,
  boundaryUnits,
  standardMode,
  unitSystem,
}: {
  inputLabel: string;
  inputPayload: AdaptiveRequestDto;
  xLabel: string;
  xUnits: string;
  yLabel: string;
  yUnits: string;
  coordinateDecimals: number;
  boundaryUnits: string;
  standardMode: AdaptiveStandardMode;
  unitSystem: UnitSystemType;
}): string {
  let hoverText = "";
  try {
    const metadata = getAdaptiveChartHoverMetadata(inputPayload, standardMode, unitSystem);
    hoverText = getAdaptiveBoundaryHoverText(metadata, standardMode, boundaryUnits);
  } catch {
    // Preserve existing scatter hover fallback when Adaptive evaluation fails.
  }

  return `${inputLabel}<br>${xLabel}: %{x:.${coordinateDecimals}f} ${xUnits}<br>${yLabel}: %{y:.${coordinateDecimals}f} ${yUnits}${hoverText}<extra></extra>`;
}

function buildAdaptiveTooltipLayer({
  xAxis,
  yAxis,
  xLabel,
  xUnits,
  yLabel,
  yUnits,
  boundaryUnits,
  standardMode,
  getHoverMetadata,
}: {
  xAxis: ReturnType<typeof createFieldAxisScale>;
  yAxis: ReturnType<typeof createFieldAxisScale>;
  xLabel: string;
  xUnits: string;
  yLabel: string;
  yUnits: string;
  boundaryUnits: string;
  standardMode: AdaptiveStandardMode;
  getHoverMetadata: (xSi: number, ySi: number, xIndex: number, yIndex: number) => any[];
}): PlotTraceDto {
  return buildTooltipGridTrace({
    xAxis,
    yAxis,
    colorscale: TRANSPARENT_COLORSCALE,
    hovertemplate: getAdaptiveHoverTemplate({
      xLabel,
      xUnits,
      yLabel,
      yUnits,
      boundaryUnits,
      standard: standardMode,
    }),
    getHoverMetadata: (xSi, ySi, xIndex, yIndex) => {
      try {
        return getHoverMetadata(xSi, ySi, xIndex, yIndex);
      } catch {
        return [NaN];
      }
    },
  });
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
  const solveBoundary = (
    slope: number,
    intercept: number,
    offset: number,
    appliesCoolingEffect: boolean,
  ) => {
    const solveWithoutCooling = (to - offset - intercept) / slope;

    if (!appliesCoolingEffect || getCe(v, to) === 0) {
      return solveWithoutCooling;
    }

    const coolingEffect = getCe(v, 25);
    const solveWithCooling = (to - offset - coolingEffect - intercept) / slope;
    const unadjustedUpperBoundary = (slope * solveWithCooling) + intercept + offset;

    // Dynamic outdoor-temperature bands invert the SI forward equations used by
    // getAdaptiveTemperatureBoundaries. CE is applied only to upper boundaries and
    // is keyed from the unadjusted upper boundary, leaving a jump at 25 degC.
    if (getCe(v, unadjustedUpperBoundary) === coolingEffect) {
      return solveWithCooling;
    }

    return (25 - offset - intercept) / slope;
  };

  if (standardMode === AdaptiveStandardMode.Ashrae) {
    const coeffs = ADAPTIVE_COEFFICIENTS.ASHRAE;
    const slope = coeffs.SLOPE;
    const intercept = coeffs.INTERCEPT;
    return [
      solveBoundary(slope, intercept, coeffs.OFFSETS_COOL[1], false),
      solveBoundary(slope, intercept, coeffs.OFFSETS_COOL[0], false),
      solveBoundary(slope, intercept, coeffs.OFFSETS_WARM[0], true),
      solveBoundary(slope, intercept, coeffs.OFFSETS_WARM[1], true),
    ];
  }

  const coeffs = ADAPTIVE_COEFFICIENTS.EN;
  const slope = coeffs.SLOPE;
  const intercept = coeffs.INTERCEPT;
  return [
    solveBoundary(slope, intercept, coeffs.OFFSETS_COOL[2], false),
    solveBoundary(slope, intercept, coeffs.OFFSETS_COOL[1], false),
    solveBoundary(slope, intercept, coeffs.OFFSETS_COOL[0], false),
    solveBoundary(slope, intercept, coeffs.OFFSETS_WARM[0], true),
    solveBoundary(slope, intercept, coeffs.OFFSETS_WARM[1], true),
    solveBoundary(slope, intercept, coeffs.OFFSETS_WARM[2], true),
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
  hoverMetadata: unknown[][],
): PlotTraceDto {
  return buildFilledBoundaryRegionTrace({
    name,
    color,
    polygonX,
    polygonY,
    lineColor: CHART_COLORS.LINE,
    hoverMetadata,
  });
}

function buildAdaptiveBandTraces(
  variableValues: number[],
  boundaryCurves: number[][],
  bands: { label: string; color: string }[],
  variableAxis: FieldKeyType,
  boundaryAxis: FieldKeyType,
  xAxis: ChartAxisScale,
  yAxis: ChartAxisScale,
  unitSystem: UnitSystemType,
  standardMode: AdaptiveStandardMode,
  activeInputPayload: any,
): PlotTraceDto[] {
  const variableScale = variableAxis === xAxis.field ? xAxis : yAxis;
  const boundaryScale = boundaryAxis === xAxis.field ? xAxis : yAxis;

  return buildBoundaryRegionTraces({
    variableValuesSi: variableValues,
    boundaryCurvesSi: boundaryCurves,
    bands,
    variableAxis: variableScale,
    boundaryAxis: boundaryScale,
    xAxis,
    yAxis,
    boundaryRangeSi: boundaryScale.rangeSi,
    getHoverMetadata: (xSi, ySi) => {
      const args = { ...activeInputPayload };
      setAdaptiveAxisValue(args, xAxis.field, xSi);
      setAdaptiveAxisValue(args, yAxis.field, ySi);

      return getAdaptiveChartHoverMetadata(args, standardMode, unitSystem);
    },
    buildTrace: ({ band, polygonX, polygonY, hoverMetadata }) => buildAdaptiveBandTrace(
      band.label,
      band.color,
      polygonX,
      polygonY,
      hoverMetadata,
    ),
  });
}

interface AdaptiveFieldLayoutOptions {
  title: string;
  xAxis: ChartAxisScale;
  yAxis: ChartAxisScale;
  showLegend: boolean;
  margin: Record<string, number>;
}

function buildAdaptiveFieldLayout({
  title,
  xAxis,
  yAxis,
  showLegend,
  margin,
}: AdaptiveFieldLayoutOptions): ChartLayoutSpec {
  return {
    title,
    xAxis,
    yAxis,
    paperBgColor: CHART_COLORS.PAPER_BG,
    plotBgColor: CHART_COLORS.PLOT_BG,
    showLegend,
    margin,
    gridColor: "#e2e8f0",
    legend: { orientation: "h", x: 0, y: 1.1 },
    height: 480,
  };
}

interface AdaptiveBoundaryChartOptions {
  layout: ChartLayoutSpec;
  inputGroups: Array<BuildInputTraceGroupsOptions<AdaptiveRequestDto, unknown>>;
  leadingTraces?: PlotTraceDto[];
  boundaryTraces?: PlotTraceDto[];
}

function buildAdaptiveBoundaryChart({
  layout,
  inputGroups,
  leadingTraces = [],
  boundaryTraces = [],
}: AdaptiveBoundaryChartOptions): PlotlyChartResponseDto {
  return buildBoundaryRegionFieldChart({
    leadingTraces,
    boundaryTraces,
    inputGroups,
    layout,
    source: CalculationSource.FrontendGenerated,
  });
}

interface AdaptiveBoundaryTraceSet {
  leadingTraces: PlotTraceDto[];
  boundaryTraces: PlotTraceDto[];
}

interface AdaptiveInputGroupOptions {
  payload: AdaptiveChartInputsRequestDto;
  xAxis: ChartAxisScale;
  yAxis: ChartAxisScale;
  getXSi: (inputPayload: AdaptiveRequestDto) => number;
  getYSi: (inputPayload: AdaptiveRequestDto) => number;
  xLabel: string;
  xUnits: string;
  yLabel: string;
  yUnits: string;
  coordinateDecimals: number;
  boundaryUnits: string;
  standardMode: AdaptiveStandardMode;
  unitSystem: UnitSystemType;
}

function createEmptyAdaptiveBoundaryTraceSet(): AdaptiveBoundaryTraceSet {
  return {
    leadingTraces: [],
    boundaryTraces: [],
  };
}

function buildAdaptiveInputGroup({
  payload,
  xAxis,
  yAxis,
  getXSi,
  getYSi,
  xLabel,
  xUnits,
  yLabel,
  yUnits,
  coordinateDecimals,
  boundaryUnits,
  standardMode,
  unitSystem,
}: AdaptiveInputGroupOptions): BuildInputTraceGroupsOptions<AdaptiveRequestDto, unknown> {
  return {
    inputsMap: payload.inputs,
    xAxis,
    yAxis,
    getXSi,
    getYSi,
    formatXDisplay: roundValue,
    formatYDisplay: roundValue,
    getHovertemplate: ({ inputLabel, payload: inputPayload }) => getAdaptiveInputHoverTemplate({
      inputLabel,
      inputPayload,
      xLabel,
      xUnits,
      yLabel,
      yUnits,
      coordinateDecimals,
      boundaryUnits,
      standardMode,
      unitSystem,
    }),
  };
}

function buildOutdoorTemperatureDynamicBoundaryTraces(
  activeInputPayload: any,
  standardMode: AdaptiveStandardMode,
  unitSystem: UnitSystemType,
  xAxis: ChartAxisScale,
  yAxis: ChartAxisScale,
): AdaptiveBoundaryTraceSet {
  if (!activeInputPayload) {
    return createEmptyAdaptiveBoundaryTraceSet();
  }

  const dynamicXAxis = xAxis.field;
  const dynamicYAxis = yAxis.field;
  const hasOutdoorXAxis = dynamicXAxis === FieldKey.PrevailingMeanOutdoorTemperature;
  const hasOutdoorYAxis = dynamicYAxis === FieldKey.PrevailingMeanOutdoorTemperature;
  if (!hasOutdoorXAxis && !hasOutdoorYAxis) {
    return createEmptyAdaptiveBoundaryTraceSet();
  }

  const otherAxis = hasOutdoorXAxis ? dynamicYAxis : dynamicXAxis;
  const isAshrae = standardMode === AdaptiveStandardMode.Ashrae;
  const xMeta = fieldMetaByKey[dynamicXAxis];
  const yMeta = fieldMetaByKey[dynamicYAxis];
  const xLabel = dynamicXAxis === FieldKey.PrevailingMeanOutdoorTemperature
    ? (isAshrae ? MeanOutdoorTempLabel.Prevailing : MeanOutdoorTempLabel.Running)
    : xMeta.label;
  const yLabel = dynamicYAxis === FieldKey.PrevailingMeanOutdoorTemperature
    ? (isAshrae ? MeanOutdoorTempLabel.Prevailing : MeanOutdoorTempLabel.Running)
    : yMeta.label;

  const buildTooltipLayer = () => {
    const tooltipXAxis = { ...xAxis, points: 40 };
    const tooltipYAxis = { ...yAxis, points: 40 };

    return buildAdaptiveTooltipLayer({
      xAxis: tooltipXAxis,
      yAxis: tooltipYAxis,
      xLabel,
      xUnits: xMeta.displayUnits[unitSystem],
      yLabel,
      yUnits: yMeta.displayUnits[unitSystem],
      boundaryUnits: getAdaptiveBoundaryUnits(unitSystem),
      standardMode,
      getHoverMetadata: (xSi, ySi) => {
        const args = { ...activeInputPayload };
        setAdaptiveAxisValue(args, dynamicXAxis, xSi);
        setAdaptiveAxisValue(args, dynamicYAxis, ySi);

        return getAdaptiveChartHoverMetadata(args, standardMode, unitSystem);
      },
    });
  };
  const buildTraceSet = (boundaryTraces: PlotTraceDto[]): AdaptiveBoundaryTraceSet => ({
    leadingTraces: [buildTooltipLayer()],
    boundaryTraces,
  });

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
    const bands = isAshrae ? adaptiveAshraeBandSequence : adaptiveEnBandSequence;

    const traces = buildAdaptiveBandTraces(
      trmValues,
      boundaryCurves,
      bands,
      FieldKey.PrevailingMeanOutdoorTemperature,
      otherAxis,
      xAxis,
      yAxis,
      unitSystem,
      standardMode,
      activeInputPayload,
    );

    return buildTraceSet(traces);
  }

  if (isAirSpeedAxis(otherAxis)) {
    const speedValues = getFieldValues(otherAxis, ADAPTIVE_DYNAMIC_POINTS, COOLING_EFFECT_SPEED_BREAKPOINTS);
    const standard = isAshrae ? JsThermalComfortStandard.ASHRAE : JsThermalComfortStandard.ISO;
    const firstTo = t_o(activeInputPayload.tdb, activeInputPayload.tr, speedValues[0], standard);
    const firstBoundaries = getOutdoorTemperatureBoundaries(firstTo, speedValues[0], standardMode);
    // Inverting operative-temperature boundaries reverses their order on the
    // outdoor-temperature axis, so curves and their matching bands move together.
    const boundaryCurves = firstBoundaries.map((_, boundaryIndex) => (
      speedValues.map((speed) => {
        const to = t_o(activeInputPayload.tdb, activeInputPayload.tr, speed, standard);
        return getOutdoorTemperatureBoundaries(to, speed, standardMode)[boundaryIndex];
      })
    )).reverse();
    const bands = (isAshrae ? adaptiveAshraeBandSequence : adaptiveEnBandSequence)
      .slice()
      .reverse();

    const traces = buildAdaptiveBandTraces(
      speedValues,
      boundaryCurves,
      bands,
      otherAxis,
      FieldKey.PrevailingMeanOutdoorTemperature,
      xAxis,
      yAxis,
      unitSystem,
      standardMode,
      activeInputPayload,
    );

    return buildTraceSet(traces);
  }

  return createEmptyAdaptiveBoundaryTraceSet();
}

export function buildAdaptiveChart(
  payload: AdaptiveChartInputsRequestDto,
  standardMode: AdaptiveStandardMode,
  unitSystem: UnitSystemType = UnitSystem.SI,
  baselineInputId?: InputIdType,
): PlotlyChartResponseDto {
  const showInputLegend = shouldShowInputLegend(payload.inputs);
  const temperatureDisplayUnits = getAdaptiveBoundaryUnits(unitSystem);
  const boundaryTraces: PlotTraceDto[] = [];
  const isAshrae = standardMode === AdaptiveStandardMode.Ashrae;
  const modelId = getAdaptiveModelId(standardMode);
  const trmMin = isAshrae ? STANDARD_APPLICABILITY_LIMITS.ASHRAE.TRM_MIN : STANDARD_APPLICABILITY_LIMITS.EN.TRM_MIN;
  const trmMax = isAshrae ? STANDARD_APPLICABILITY_LIMITS.ASHRAE.TRM_MAX : STANDARD_APPLICABILITY_LIMITS.EN.TRM_MAX;
  const baselineInput = resolveBaselineInputEntry(payload.inputs, baselineInputId);
  const xLabel = `${isAshrae ? "Prevailing" : "Running"} ${fieldMetaByKey[FieldKey.PrevailingMeanOutdoorTemperature].label.toLowerCase()}`;
  const yLabel = fieldMetaByKey[FieldKey.OperativeTemperature].label;
  const xAxis = createFieldAxisScale({
    field: FieldKey.PrevailingMeanOutdoorTemperature,
    unitSystem,
    rangeSi: { min: trmMin, max: trmMax },
    points: 2,
    label: xLabel,
    units: temperatureDisplayUnits,
  });
  const yAxis = createFieldAxisScale({
    field: FieldKey.DryBulbTemperature,
    unitSystem,
    rangeSi: { min: 10, max: 40 },
    points: 2,
    label: yLabel,
    units: temperatureDisplayUnits,
  });

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
      boundaryTraces.push(buildClosedBoundaryPolygonTrace({
        lowerXValuesSi: trmPoints,
        lowerYValuesSi: lower,
        upperXValuesSi: trmPoints,
        upperYValuesSi: upper,
        xAxis,
        yAxis,
        buildTrace: ({ polygonX, polygonY }) => buildComfortPolygonTrace({
          inputId: baselineInput.inputId,
          nameSuffix,
          polygonX: polygonX.map((value) => roundValue(value)),
          polygonY: polygonY.map((value) => roundValue(value)),
          hovertemplate: "",
          hoverinfo: "skip",
          isZone: true,
        }),
      }));
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

  const vBaseline = baselineInput?.payload.v ?? 0;
  const tooltipXAxis = { ...xAxis, points: 40 };
  const tooltipYAxis = { ...yAxis, points: 40 };

  const tooltipTrace = buildAdaptiveTooltipLayer({
    xAxis: tooltipXAxis,
    yAxis: tooltipYAxis,
    xLabel,
    xUnits: temperatureDisplayUnits,
    yLabel,
    yUnits: temperatureDisplayUnits,
    boundaryUnits: temperatureDisplayUnits,
    standardMode,
    getHoverMetadata: (trmVal, toVal) => {
      return getAdaptiveChartHoverMetadata(
        { tdb: toVal, tr: toVal, trm: trmVal, v: vBaseline, units: UnitSystem.SI },
        standardMode,
        unitSystem,
      );
    },
  });
  const layout = buildAdaptiveFieldLayout({
    title: `${comfortModelMetaById[modelId].label} Comfort Chart`,
    xAxis,
    yAxis,
    showLegend: showInputLegend,
    margin: { l: 56, r: 24, t: 48, b: 80 },
  });

  return buildAdaptiveBoundaryChart({
    layout,
    leadingTraces: [tooltipTrace],
    boundaryTraces,
    inputGroups: [buildAdaptiveInputGroup({
      payload,
      xAxis,
      yAxis,
      getXSi: (inputPayload) => inputPayload.trm,
      getYSi: (inputPayload) => t_o(inputPayload.tdb, inputPayload.tr, inputPayload.v, getAdaptiveJtcStandard(standardMode)),
      xLabel,
      xUnits: temperatureDisplayUnits,
      yLabel,
      yUnits: temperatureDisplayUnits,
      coordinateDecimals: 1,
      boundaryUnits: temperatureDisplayUnits,
      standardMode,
      unitSystem,
    })],
  });
}

function buildAdaptiveDynamicInputGroup(
  payload: AdaptiveChartInputsRequestDto,
  xAxis: ChartAxisScale,
  yAxis: ChartAxisScale,
  dynamicXAxis: FieldKeyType,
  dynamicYAxis: FieldKeyType,
  standardMode: AdaptiveStandardMode,
  unitSystem: UnitSystemType,
): BuildInputTraceGroupsOptions<AdaptiveRequestDto, unknown> {
  const xMeta = fieldMetaByKey[dynamicXAxis];
  const yMeta = fieldMetaByKey[dynamicYAxis];

  return buildAdaptiveInputGroup({
    payload,
    xAxis,
    yAxis,
    getXSi: (inputPayload) => getAdaptiveAxisValue(inputPayload, dynamicXAxis, standardMode),
    getYSi: (inputPayload) => getAdaptiveAxisValue(inputPayload, dynamicYAxis, standardMode),
    xLabel: xMeta.label,
    xUnits: xMeta.displayUnits[unitSystem],
    yLabel: yMeta.label,
    yUnits: yMeta.displayUnits[unitSystem],
    coordinateDecimals: 2,
    boundaryUnits: getAdaptiveBoundaryUnits(unitSystem),
    standardMode,
    unitSystem,
  });
}

export function buildAdaptiveDynamicChart(
  payload: AdaptiveChartInputsRequestDto,
  standardMode: AdaptiveStandardMode,
  unitSystem: UnitSystemType = UnitSystem.SI,
  dynamicXAxis?: FieldKeyType,
  dynamicYAxis?: FieldKeyType,
  baselineInputId?: InputIdType,
): PlotlyChartResponseDto {
  const showInputLegend = shouldShowInputLegend(payload.inputs);
  const modelId = getAdaptiveModelId(standardMode);

  if (
    !dynamicXAxis ||
    !dynamicYAxis ||
    dynamicXAxis === dynamicYAxis ||
    adaptiveAxesSharePayloadKey(dynamicXAxis, dynamicYAxis)
  ) {
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

  const activeInputPayload = resolveBaselineInputEntry(payload.inputs, baselineInputId)?.payload;
  const xMeta = fieldMetaByKey[dynamicXAxis];
  const yMeta = fieldMetaByKey[dynamicYAxis];
  const isAshrae = standardMode === AdaptiveStandardMode.Ashrae;
  const xAxis = createFieldAxisScale({
    field: dynamicXAxis,
    unitSystem,
    rangeSi: { min: xMeta.minValue, max: xMeta.maxValue },
    points: 50,
  });
  const yAxis = createFieldAxisScale({
    field: dynamicYAxis,
    unitSystem,
    rangeSi: { min: yMeta.minValue, max: yMeta.maxValue },
    points: 50,
  });
  const dynamicInputGroup = buildAdaptiveDynamicInputGroup(
    payload,
    xAxis,
    yAxis,
    dynamicXAxis,
    dynamicYAxis,
    standardMode,
    unitSystem,
  );
  const layout = buildAdaptiveFieldLayout({
    title: `${comfortModelMetaById[modelId].label} Dynamic Chart (${xMeta.label} vs ${yMeta.label})`,
    xAxis,
    yAxis,
    showLegend: showInputLegend,
    margin: { l: 64, r: 24, t: 48, b: 64 },
  });

  if (activeInputPayload) {
    const isOutdoorX = dynamicXAxis === FieldKey.PrevailingMeanOutdoorTemperature;
    const isOutdoorY = dynamicYAxis === FieldKey.PrevailingMeanOutdoorTemperature;

    if (isOutdoorX || isOutdoorY) {
      const { leadingTraces, boundaryTraces } = buildOutdoorTemperatureDynamicBoundaryTraces(
        activeInputPayload,
        standardMode,
        unitSystem,
        xAxis,
        yAxis,
      );

      return buildAdaptiveBoundaryChart({
        layout,
        leadingTraces,
        boundaryTraces,
        inputGroups: [dynamicInputGroup],
      });
    }

    return buildGridContourFieldChart({
      xAxis,
      yAxis,
      grid: {
        evaluatePoint: (xSi: number, ySi: number) => {
          const pointArgs = { ...activeInputPayload };
          setAdaptiveAxisValue(pointArgs, dynamicXAxis, xSi);
          setAdaptiveAxisValue(pointArgs, dynamicYAxis, ySi);

          try {
            const evaluation = evaluateAdaptiveChartPayload(pointArgs, standardMode);
            const dynamicZone = getAdaptiveDynamicZone(evaluation, standardMode);
            return {
              z: dynamicZone.z,
              text: dynamicZone.label,
              hoverMetadata: getAdaptiveHoverMetadata(
                evaluation.result,
                standardMode,
                unitSystem,
              ),
            };
          } catch {
            return { z: NaN, text: "", hoverMetadata: [NaN] };
          }
        },
        layers: buildZoneContourLayers({
          name: "Adaptive Zones",
          colorscale: isAshrae ? ADAPTIVE_ASHRAE_COLORSCALE : ADAPTIVE_EN_COLORSCALE,
          contours: ADAPTIVE_CONTOURS,
          zmin: 1.5,
          zmax: isAshrae ? 5.5 : 7.5,
          hovertemplate: getAdaptiveHoverTemplate({
            xLabel: xMeta.label,
            xUnits: xMeta.displayUnits[unitSystem],
            yLabel: yMeta.label,
            yUnits: yMeta.displayUnits[unitSystem],
            boundaryUnits: getAdaptiveBoundaryUnits(unitSystem),
            standard: standardMode,
          }),
          opacity: 0.75,
          isBackgroundZone: true,
        }),
      },
      inputGroups: [dynamicInputGroup],
      layout,
      source: CalculationSource.FrontendGenerated,
    });
  }

  return buildAdaptiveBoundaryChart({
    layout,
    inputGroups: [dynamicInputGroup],
  });
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

type AdaptiveBandResultRow = {
  title: string;
  getStatus: (result: AdaptiveResponseDto) => string | undefined;
  getAccepted: (result: AdaptiveResponseDto) => boolean | undefined;
  getLowerBoundary: (result: AdaptiveResponseDto) => number | undefined;
  getUpperBoundary: (result: AdaptiveResponseDto) => number | undefined;
  acceptedColor: string;
  coolColor: string;
  warmColor: string;
};

const adaptiveAshraeBandResultRows: AdaptiveBandResultRow[] = [
  {
    title: adaptiveAshraeZonesList[1].label,
    getStatus: (result) => result.status_80,
    getAccepted: (result) => result.acceptability_80,
    getLowerBoundary: (result) => result.tmp_cmf_80_low,
    getUpperBoundary: (result) => result.tmp_cmf_80_up,
    acceptedColor: adaptiveAshraeZonesList[1].textColor,
    coolColor: adaptiveAshraeZonesList[0].textColor,
    warmColor: adaptiveAshraeZonesList[3].textColor,
  },
  {
    title: adaptiveAshraeZonesList[2].label,
    getStatus: (result) => result.status_90,
    getAccepted: (result) => result.acceptability_90,
    getLowerBoundary: (result) => result.tmp_cmf_90_low,
    getUpperBoundary: (result) => result.tmp_cmf_90_up,
    acceptedColor: adaptiveAshraeZonesList[2].textColor,
    coolColor: adaptiveAshraeZonesList[0].textColor,
    warmColor: adaptiveAshraeZonesList[3].textColor,
  },
];

const adaptiveEnBandResultRows: AdaptiveBandResultRow[] = [
  {
    title: adaptiveEnZonesList[3].label,
    getStatus: (result) => result.status_cat_i,
    getAccepted: (result) => result.acceptability_cat_i,
    getLowerBoundary: (result) => result.tmp_cmf_cat_i_low,
    getUpperBoundary: (result) => result.tmp_cmf_cat_i_up,
    acceptedColor: adaptiveEnZonesList[3].textColor,
    coolColor: adaptiveEnZonesList[0].textColor,
    warmColor: adaptiveEnZonesList[4].textColor,
  },
  {
    title: adaptiveEnZonesList[2].label,
    getStatus: (result) => result.status_cat_ii,
    getAccepted: (result) => result.acceptability_cat_ii,
    getLowerBoundary: (result) => result.tmp_cmf_cat_ii_low,
    getUpperBoundary: (result) => result.tmp_cmf_cat_ii_up,
    acceptedColor: adaptiveEnZonesList[2].textColor,
    coolColor: adaptiveEnZonesList[0].textColor,
    warmColor: adaptiveEnZonesList[4].textColor,
  },
  {
    title: adaptiveEnZonesList[1].label,
    getStatus: (result) => result.status_cat_iii,
    getAccepted: (result) => result.acceptability_cat_iii,
    getLowerBoundary: (result) => result.tmp_cmf_cat_iii_low,
    getUpperBoundary: (result) => result.tmp_cmf_cat_iii_up,
    acceptedColor: adaptiveEnZonesList[1].textColor,
    coolColor: adaptiveEnZonesList[0].textColor,
    warmColor: adaptiveEnZonesList[4].textColor,
  },
];

function buildAdaptiveComplianceResultRow(isAshrae: boolean): ResultRowDefinition<AdaptiveResponseDto> {
  return {
    title: "Compliance",
    formatter: (result) => {
      const isComfortable = isAshrae
        ? result.acceptability_80 === true
        : result.acceptability_cat_iii === true;
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
        text,
        color: isCompliant ? compliantColor : nonCompliantColor,
      };
    },
  };
}

function getAdaptiveBoundaryFallbackColor(
  result: AdaptiveResponseDto,
  lowerBoundary: number | undefined,
  coolColor: string,
  warmColor: string,
): string {
  // Preserve the pre-refactor display contract: only positive comfort and boundary
  // values may select the cool tone; missing or non-positive values fall back to warm.
  return result.t_cmf > 0 && lowerBoundary !== undefined && lowerBoundary > 0
    ? (result.t_cmf < lowerBoundary ? coolColor : warmColor)
    : warmColor;
}

function formatAdaptiveBandResultCell(
  row: AdaptiveBandResultRow,
  result: AdaptiveResponseDto,
  unitSystem: UnitSystemType,
) {
  const status = row.getStatus(result);
  if (!status) {
    return { text: "N/A", color: "" };
  }

  const lowerBoundary = row.getLowerBoundary(result);
  const upperBoundary = row.getUpperBoundary(result);
  const tempUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
  let subtext: string | undefined;

  if (lowerBoundary !== undefined && upperBoundary !== undefined) {
    const low = convertFieldValueFromSi(FieldKey.DryBulbTemperature, lowerBoundary, unitSystem);
    const up = convertFieldValueFromSi(FieldKey.DryBulbTemperature, upperBoundary, unitSystem);
    subtext = `${low.toFixed(1)} ~ ${up.toFixed(1)} ${tempUnits}`;
  }

  return {
    text: status,
    subtext,
    color: row.getAccepted(result)
      ? row.acceptedColor
      : getAdaptiveBoundaryFallbackColor(result, lowerBoundary, row.coolColor, row.warmColor),
  };
}

function buildAdaptiveBandResultRows(
  isAshrae: boolean,
  unitSystem: UnitSystemType,
): ResultRowDefinition<AdaptiveResponseDto>[] {
  const bandRows = isAshrae ? adaptiveAshraeBandResultRows : adaptiveEnBandResultRows;

  return bandRows.map((row) => ({
    title: row.title,
    formatter: (result) => formatAdaptiveBandResultCell(row, result, unitSystem),
  }));
}

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
  builder.setDynamicAxisPairValidator((xAxis, yAxis) => (
    !adaptiveAxesSharePayloadKey(xAxis, yAxis)
  ));

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

  builder.setResultBuilder((results, visibleInputIds, unitSystem) => {
    const rows: ResultRowDefinition<AdaptiveResponseDto>[] = [
      buildAdaptiveComplianceResultRow(isAshrae),
      ...buildAdaptiveBandResultRows(isAshrae, unitSystem),
    ];

    return buildResultSectionsFromRows(rows, results, visibleInputIds);
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
