import { phs, p_sat } from "jsthermalcomfort";

import { CalculationSource } from "../../catalog/calculationMetadata";
import { getPhysicalQuantityMeta, PhysicalQuantityId } from "../../catalog/quantities";
import {
  PHS_RECTAL_TEMPERATURE_LIMIT_C,
  PHS_STANDARD_VERSION,
  PhsLimitingCriterion,
  defaultPhsSimulationFlags,
  type PhsEnvironmentSi,
  type PhsHistorySample,
  type PhsPersonSettingsSi,
  type PhsRequest,
  type PhsResponse,
  type PhsSimulationCallbacks,
  type PhsSimulationRequest,
  type PhsSimulationResult,
  type PhsTimeSeriesResult,
  type PhsTimeSeriesSegment,
} from "../../catalog/phs";

const WATTS_PER_MET = 58.15;
const MIN_VAPOR_PRESSURE_KPA = 0.5;
const MAX_VAPOR_PRESSURE_KPA = 4.5;
const INITIAL_SKIN_TEMPERATURE_C = 34.1;
const INITIAL_CORE_TEMPERATURE_C = 36.8;

interface RawPhsResult {
  t_re: number;
  t_sk: number;
  t_cr: number;
  t_cr_eq: number;
  t_sk_t_cr_wg: number;
  d_lim_loss_50: number;
  d_lim_loss_95: number;
  d_lim_t_re: number;
  sweat_rate_watt: number;
  sweat_loss_g: number;
  evap_load_wm2_min: number;
}

interface PhsCarryState {
  tSk: number;
  tCr: number;
  tRe: number;
  tCrEq: number;
  tSkTCrWeight: number;
  sweatRateWatt: number;
  evaporativeLoadWm2Min: number;
  sweatLossG: number;
}

export class PhsSimulationCancelledError extends Error {
  constructor() {
    super("PHS simulation cancelled.");
    this.name = "PhsSimulationCancelledError";
  }
}

function getPhsWaterLossLimitPercent(
  person: PhsPersonSettingsSi,
): 3 | 5 {
  return person.drinkingAllowed ? 5 : 3;
}

function bodySurfaceAreaM2(person: PhsPersonSettingsSi): number { const weightKg = person[PhysicalQuantityId.BodyWeight];
  const heightM = person[PhysicalQuantityId.Height];
  return 0.202
    * Math.pow(weightKg, 0.425)
    * Math.pow(heightM, 0.725); }

export function getPhsWaterLossLimitG(person: PhsPersonSettingsSi): number {
  return (getPhsWaterLossLimitPercent(person) / 100)
    * person[PhysicalQuantityId.BodyWeight]
    * 1000;
}

export function personFromModelInputs(
  modelInputs: Readonly<Partial<Record<PhysicalQuantityId, number>>>,
): PhsPersonSettingsSi {
  const weightMeta = getPhysicalQuantityMeta(PhysicalQuantityId.BodyWeight);
  const heightMeta = getPhysicalQuantityMeta(PhysicalQuantityId.Height);

  return { [PhysicalQuantityId.BodyWeight]:
      modelInputs[PhysicalQuantityId.BodyWeight] ?? weightMeta.defaultSi, [PhysicalQuantityId.Height]:
      modelInputs[PhysicalQuantityId.Height] ?? heightMeta.defaultSi, ...defaultPhsSimulationFlags };
}

export function getPhsVaporPressureKpa(environment: PhsEnvironmentSi): number {
  return (p_sat(environment.tdb) / 1000) * (environment.rh / 100);
}

export function validatePhsEnvironment(
  environment: PhsEnvironmentSi,
  person: PhsPersonSettingsSi,
): string[] {
  const issues: string[] = [];
  const values = [
    environment.tdb,
    environment.tr,
    environment.v,
    environment.rh,
    environment.met,
    environment.clo,
  ];
  if (!values.every(Number.isFinite)) {
    return ["All PHS inputs must be finite numbers."];
  }
  if (!Number.isFinite(person[PhysicalQuantityId.BodyWeight])
    || person[PhysicalQuantityId.BodyWeight] <= 0) {
    issues.push("Body weight must be greater than zero.");
  }
  if (!Number.isFinite(person[PhysicalQuantityId.Height])
    || person[PhysicalQuantityId.Height] <= 0) {
    issues.push("Body height must be greater than zero.");
  }
  if (environment.tdb < 15 || environment.tdb > 50) {
    issues.push("Air temperature must be between 15 and 50 °C.");
  }
  if (environment.tr < 0 || environment.tr > 60) {
    issues.push("Mean radiant temperature must be between 0 and 60 °C.");
  }
  if (environment.v < 0 || environment.v > 3) {
    issues.push("Air speed must be between 0 and 3 m/s.");
  }
  if (environment.rh < 0 || environment.rh > 100) {
    issues.push("Relative humidity must be between 0 and 100%.");
  }
  if (environment.clo < 0.1 || environment.clo > 1) {
    issues.push("Clothing insulation must be between 0.1 and 1.0 clo.");
  }

  if (
    person[PhysicalQuantityId.BodyWeight] > 0
    && person[PhysicalQuantityId.Height] > 0
  ) {
    const metabolicPowerW = environment.met
      * WATTS_PER_MET
      * bodySurfaceAreaM2(person);
    if (metabolicPowerW < 100 || metabolicPowerW > 450) {
      issues.push("Total metabolic power must be between 100 and 450 W.");
    }
  }

  const vaporPressureKpa = getPhsVaporPressureKpa(environment);
  if (
    Number.isFinite(vaporPressureKpa)
    && (vaporPressureKpa < MIN_VAPOR_PRESSURE_KPA
      || vaporPressureKpa > MAX_VAPOR_PRESSURE_KPA)
  ) {
    issues.push("Water-vapour pressure must be between 0.5 and 4.5 kPa.");
  }
  return issues;
}

function runRawPhs(
  environment: PhsEnvironmentSi,
  person: PhsPersonSettingsSi,
  durationMinutes: number,
  carry?: PhsCarryState,
): RawPhsResult {
  return phs(
    environment.tdb,
    environment.tr,
    environment.v,
    environment.rh,
    environment.met,
    environment.clo,
    person.posture,
    0,
    PHS_STANDARD_VERSION,
    {
      duration: durationMinutes,
      weight: person[PhysicalQuantityId.BodyWeight],
      height: person[PhysicalQuantityId.Height],
      acclimatized: person.acclimatized ? 100 : 0,
      drink: person.drinkingAllowed ? 1 : 0,
      round: false,
      limit_inputs: false,
      ...(carry
        ? {
            t_sk: carry.tSk,
            t_cr: carry.tCr,
            t_re: carry.tRe,
            t_cr_eq: carry.tCrEq,
            t_sk_t_cr_wg: carry.tSkTCrWeight,
            sweat_rate_watt: carry.sweatRateWatt,
            evap_load_wm2_min: carry.evaporativeLoadWm2Min,
          }
        : {}),
    },
  ) as RawPhsResult;
}

function toCarry(result: RawPhsResult): PhsCarryState {
  return {
    tSk: result.t_sk,
    tCr: result.t_cr,
    tRe: result.t_re,
    tCrEq: result.t_cr_eq,
    tSkTCrWeight: result.t_sk_t_cr_wg,
    sweatRateWatt: result.sweat_rate_watt,
    evaporativeLoadWm2Min: result.evap_load_wm2_min,
    sweatLossG: result.sweat_loss_g,
  };
}

function validateSegments(
  segments: readonly PhsTimeSeriesSegment[],
  person: PhsPersonSettingsSi,
): string[] {
  if (segments.length === 0) {
    return ["Add at least one scenario segment."];
  }

  const issues: string[] = [];
  segments.forEach((segment, index) => {
    const prefix = segment.name.trim() || `Segment ${index + 1}`;
    if (!Number.isInteger(segment.durationMinutes) || segment.durationMinutes < 1) {
      issues.push(`${prefix}: duration must be a positive whole number of minutes.`);
    }
    for (const issue of validatePhsEnvironment(segment, person)) {
      issues.push(`${prefix}: ${issue}`);
    }
  });
  return issues;
}

export function validatePhsTimeSeries(
  segments: readonly PhsTimeSeriesSegment[],
  person: PhsPersonSettingsSi,
): string[] {
  const issues: string[] = [];
  const weightMeta = getPhysicalQuantityMeta(PhysicalQuantityId.BodyWeight);
  const heightMeta = getPhysicalQuantityMeta(PhysicalQuantityId.Height);
  const weight = person[PhysicalQuantityId.BodyWeight];
  const height = person[PhysicalQuantityId.Height];
  if (!Number.isFinite(weight) || weight < weightMeta.minSi || weight > weightMeta.maxSi) {
    issues.push(
      `${weightMeta.label} must be between ${weightMeta.minSi} and ${weightMeta.maxSi} ${weightMeta.display.units.SI}.`,
    );
  }
  if (!Number.isFinite(height) || height < heightMeta.minSi || height > heightMeta.maxSi) {
    issues.push(
      `${heightMeta.label} must be between ${heightMeta.minSi} and ${heightMeta.maxSi} ${heightMeta.display.units.SI}.`,
    );
  }
  issues.push(...validateSegments(segments, person));
  return issues;
}

function invalidResponse(
  issues: string[],
  totalDurationMinutes: number,
  waterLossLimitG: number,
  waterLossLimitPercent: 3 | 5,
): PhsSimulationResult {
  return {
    valid: false,
    issues,
    tRe: Number.NaN,
    tCr: Number.NaN,
    tSk: Number.NaN,
    sweatLossG: Number.NaN,
    sweatRateWatt: Number.NaN,
    totalDurationMinutes,
    peakRectalTemperatureC: Number.NaN,
    waterLossLimitG,
    waterLossLimitPercent,
    firstRectalLimitMinute: null,
    firstWaterLossLimitMinute: null,
    limitingMinute: null,
    limitingCriterion: PhsLimitingCriterion.None,
    dLimTreMinutes: Number.NaN,
    dLimWaterLossMinutes: Number.NaN,
    limitingExposureTimeMinutes: Number.NaN,
    source: CalculationSource.JsThermalComfort,
  };
}

function getLimitingCriterion(
  firstRectalLimitMinute: number | null,
  firstWaterLossLimitMinute: number | null,
): PhsLimitingCriterion {
  if (firstRectalLimitMinute === null && firstWaterLossLimitMinute === null) {
    return PhsLimitingCriterion.None;
  }
  return firstRectalLimitMinute !== null
    && firstRectalLimitMinute <= (firstWaterLossLimitMinute ?? Infinity)
    ? PhsLimitingCriterion.RectalTemperature
    : PhsLimitingCriterion.WaterLoss;
}

function createInitialSample(segment: PhsTimeSeriesSegment): PhsHistorySample {
  return {
    minute: 0,
    hours: 0,
    segmentId: segment.id,
    segmentName: segment.name,
    tRe: INITIAL_CORE_TEMPERATURE_C,
    tCr: INITIAL_CORE_TEMPERATURE_C,
    tSk: INITIAL_SKIN_TEMPERATURE_C,
    sweatLossG: 0,
  };
}

/**
 * Runs the ISO 7933 state machine for ordered segments. History-disabled calls
 * advance a whole segment at once; history calls retain each one-minute state.
 */
export function simulatePhs(
  request: PhsSimulationRequest,
  callbacks: PhsSimulationCallbacks = {},
): PhsSimulationResult {
  const totalDurationMinutes = request.segments.reduce(
    (total, segment) => total + (
      Number.isFinite(segment.durationMinutes) ? segment.durationMinutes : 0
    ),
    0,
  );
  const waterLossLimitG = getPhsWaterLossLimitG(request.person);
  const waterLossLimitPercent = getPhsWaterLossLimitPercent(request.person);
  const issues = validateSegments(request.segments, request.person);
  if (issues.length > 0) {
    return invalidResponse(
      issues,
      totalDurationMinutes,
      waterLossLimitG,
      waterLossLimitPercent,
    );
  }

  const samples = request.recordHistory
    ? [createInitialSample(request.segments[0])]
    : undefined;
  let carry: PhsCarryState | undefined;
  let elapsedMinutes = 0;
  let peakRectalTemperatureC = INITIAL_CORE_TEMPERATURE_C;
  let firstRectalLimitMinute: number | null = null;
  let firstWaterLossLimitMinute: number | null = null;

  const recordResult = (
    result: RawPhsResult,
    segment: PhsTimeSeriesSegment,
    durationMinutes: number,
  ) => {
    const segmentStartMinute = elapsedMinutes;
    elapsedMinutes += durationMinutes;
    carry = toCarry(result);
    peakRectalTemperatureC = Math.max(peakRectalTemperatureC, result.t_re);

    if (
      firstRectalLimitMinute === null
      && result.t_re >= PHS_RECTAL_TEMPERATURE_LIMIT_C
    ) {
      firstRectalLimitMinute = segmentStartMinute + result.d_lim_t_re;
    }
    if (
      firstWaterLossLimitMinute === null
      && result.sweat_loss_g >= waterLossLimitG
    ) {
      firstWaterLossLimitMinute = segmentStartMinute
        + Math.min(result.d_lim_loss_50, result.d_lim_loss_95);
    }

    if (samples) {
      samples.push({
        minute: elapsedMinutes,
        hours: elapsedMinutes / 60,
        segmentId: segment.id,
        segmentName: segment.name,
        tRe: result.t_re,
        tCr: result.t_cr,
        tSk: result.t_sk,
        sweatLossG: result.sweat_loss_g,
      });
    }
    callbacks.onProgress?.(elapsedMinutes, totalDurationMinutes);
  };

  for (const segment of request.segments) {
    if (request.recordHistory) {
      for (let minute = 0; minute < segment.durationMinutes; minute += 1) {
        if (callbacks.isCancelled?.()) throw new PhsSimulationCancelledError();
        recordResult(runRawPhs(segment, request.person, 1, carry), segment, 1);
      }
    } else {
      if (callbacks.isCancelled?.()) throw new PhsSimulationCancelledError();
      recordResult(
        runRawPhs(segment, request.person, segment.durationMinutes, carry),
        segment,
        segment.durationMinutes,
      );
    }
  }

  const limitingMinute = firstRectalLimitMinute === null
    ? firstWaterLossLimitMinute
    : firstWaterLossLimitMinute === null
      ? firstRectalLimitMinute
      : Math.min(firstRectalLimitMinute, firstWaterLossLimitMinute);
  const limitingCriterion = getLimitingCriterion(
    firstRectalLimitMinute,
    firstWaterLossLimitMinute,
  );
  const finalState = carry!;
  const dLimTreMinutes = firstRectalLimitMinute ?? elapsedMinutes;
  const dLimWaterLossMinutes = firstWaterLossLimitMinute ?? elapsedMinutes;

  return {
    valid: true,
    issues: [],
    tRe: finalState.tRe,
    tCr: finalState.tCr,
    tSk: finalState.tSk,
    sweatLossG: finalState.sweatLossG,
    sweatRateWatt: finalState.sweatRateWatt,
    totalDurationMinutes: elapsedMinutes,
    peakRectalTemperatureC,
    waterLossLimitG,
    waterLossLimitPercent,
    firstRectalLimitMinute,
    firstWaterLossLimitMinute,
    limitingMinute,
    limitingCriterion,
    dLimTreMinutes,
    dLimWaterLossMinutes,
    limitingExposureTimeMinutes: limitingMinute ?? elapsedMinutes,
    ...(samples ? { samples } : {}),
    source: CalculationSource.JsThermalComfort,
  };
}

export function calculatePhs(request: PhsRequest): PhsResponse {
  return simulatePhs({
    segments: [{
      id: "analysis-exposure",
      name: "Analysis exposure",
      durationMinutes: request.durationMinutes,
      tdb: request.tdb,
      tr: request.tr,
      v: request.v,
      rh: request.rh,
      met: request.met,
      clo: request.clo,
    }],
    person: request.person,
    recordHistory: false,
  });
}

export function calculatePhsTimeSeries(
  segments: readonly PhsTimeSeriesSegment[],
  person: PhsPersonSettingsSi,
): PhsTimeSeriesResult {
  const issues = validatePhsTimeSeries(segments, person);
  if (issues.length > 0) throw new Error(issues.join(" "));
  return simulatePhs({ segments, person, recordHistory: true });
}
