import { phs } from "jsthermalcomfort";

import { CalculationSource } from "../models/calculationMetadata";
import {
  PHS_MAX_DURATION_MINUTES,
  PHS_RECTAL_TEMPERATURE_LIMIT_C,
  PHS_STANDARD_VERSION,
  PhsLimitingCriterion,
  type PhsEnvironmentSi,
  type PhsPersonSettingsSi,
  type PhsRequestDto,
  type PhsResponseDto,
  type PhsTimeSeriesPoint,
  type PhsTimeSeriesResult,
  type PhsTimeSeriesSegment,
} from "../models/phs";

const WATTS_PER_MET = 58.15;
const MIN_VAPOR_PRESSURE_KPA = 0.5;
const MAX_VAPOR_PRESSURE_KPA = 4.5;

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
}

function bodySurfaceAreaM2(person: PhsPersonSettingsSi): number {
  return 0.202
    * Math.pow(person.weightKg, 0.425)
    * Math.pow(person.heightM, 0.725);
}

export function getPhsWaterLossLimitG(person: PhsPersonSettingsSi): number {
  const fraction = person.drinkingAllowed ? 0.05 : 0.03;
  return fraction * person.weightKg * 1000;
}

export function getPhsVaporPressureKpa(environment: PhsEnvironmentSi): number {
  return 0.6105
    * Math.exp((17.27 * environment.tdb) / (environment.tdb + 237.3))
    * (environment.rh / 100);
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
  if (!Number.isFinite(person.weightKg) || person.weightKg <= 0) {
    issues.push("Body weight must be greater than zero.");
  }
  if (!Number.isFinite(person.heightM) || person.heightM <= 0) {
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

  if (person.weightKg > 0 && person.heightM > 0) {
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
      weight: person.weightKg,
      height: person.heightM,
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

function invalidResponse(issues: string[]): PhsResponseDto {
  return {
    valid: false,
    issues,
    tRe: Number.NaN,
    tCr: Number.NaN,
    tSk: Number.NaN,
    dLimTreMinutes: Number.NaN,
    dLimWaterLossMinutes: Number.NaN,
    limitingExposureTimeMinutes: Number.NaN,
    limitingCriterion: PhsLimitingCriterion.None,
    sweatLossG: Number.NaN,
    sweatRateWatt: Number.NaN,
    source: CalculationSource.JsThermalComfort,
  };
}

export function calculatePhs(request: PhsRequestDto): PhsResponseDto {
  const issues = validatePhsEnvironment(request, request.person);
  if (
    !Number.isInteger(request.durationMinutes)
    || request.durationMinutes < 1
    || request.durationMinutes > PHS_MAX_DURATION_MINUTES
  ) {
    issues.push("Exposure duration must be an integer from 1 to 480 minutes.");
  }
  if (issues.length > 0) return invalidResponse(issues);

  const result = runRawPhs(
    request,
    request.person,
    request.durationMinutes,
  );
  const dLimWaterLossMinutes = Math.min(
    result.d_lim_loss_50,
    result.d_lim_loss_95,
  );
  const limitingExposureTimeMinutes = Math.min(
    result.d_lim_t_re,
    dLimWaterLossMinutes,
  );
  const limitingCriterion: PhsLimitingCriterion =
    limitingExposureTimeMinutes >= request.durationMinutes
      ? PhsLimitingCriterion.None
      : result.d_lim_t_re <= dLimWaterLossMinutes
        ? PhsLimitingCriterion.RectalTemperature
        : PhsLimitingCriterion.WaterLoss;

  return {
    valid: true,
    issues: [],
    tRe: result.t_re,
    tCr: result.t_cr,
    tSk: result.t_sk,
    dLimTreMinutes: result.d_lim_t_re,
    dLimWaterLossMinutes,
    limitingExposureTimeMinutes,
    limitingCriterion,
    sweatLossG: result.sweat_loss_g,
    sweatRateWatt: result.sweat_rate_watt,
    source: CalculationSource.JsThermalComfort,
  };
}

export function validatePhsTimeSeries(
  segments: readonly PhsTimeSeriesSegment[],
  person: PhsPersonSettingsSi,
): string[] {
  const issues: string[] = [];
  if (segments.length === 0) {
    return ["Add at least one scenario segment."];
  }
  if (person.weightKg < 30 || person.weightKg > 200) {
    issues.push("Body weight must be between 30 and 200 kg.");
  }
  if (person.heightM < 1.2 || person.heightM > 2.2) {
    issues.push("Body height must be between 1.2 and 2.2 m.");
  }

  let totalDurationMinutes = 0;
  segments.forEach((segment, index) => {
    const prefix = segment.name.trim() || `Segment ${index + 1}`;
    if (!Number.isInteger(segment.durationMinutes) || segment.durationMinutes < 1) {
      issues.push(`${prefix}: duration must be a positive whole number of minutes.`);
    } else {
      totalDurationMinutes += segment.durationMinutes;
    }
    for (const issue of validatePhsEnvironment(segment, person)) {
      issues.push(`${prefix}: ${issue}`);
    }
  });
  if (totalDurationMinutes > PHS_MAX_DURATION_MINUTES) {
    issues.push("Total scenario duration cannot exceed 480 minutes.");
  }
  return issues;
}

export function calculatePhsTimeSeries(
  segments: readonly PhsTimeSeriesSegment[],
  person: PhsPersonSettingsSi,
): PhsTimeSeriesResult {
  const issues = validatePhsTimeSeries(segments, person);
  if (issues.length > 0) {
    throw new Error(issues.join(" "));
  }

  const firstSegment = segments[0];
  const points: PhsTimeSeriesPoint[] = [{
    minute: 0,
    hours: 0,
    segmentId: firstSegment.id,
    segmentName: firstSegment.name,
    tRe: 36.8,
    tCr: 36.8,
    sweatLossG: 0,
  }];
  let carry: PhsCarryState | undefined;
  let elapsedMinutes = 0;
  let peakRectalTemperatureC = 36.8;
  let firstRectalLimitMinute: number | null = null;
  let firstWaterLossLimitMinute: number | null = null;
  const waterLossLimitG = getPhsWaterLossLimitG(person);

  for (const segment of segments) {
    for (let minute = 0; minute < segment.durationMinutes; minute += 1) {
      const result = runRawPhs(segment, person, 1, carry);
      carry = {
        tSk: result.t_sk,
        tCr: result.t_cr,
        tRe: result.t_re,
        tCrEq: result.t_cr_eq,
        tSkTCrWeight: result.t_sk_t_cr_wg,
        sweatRateWatt: result.sweat_rate_watt,
        evaporativeLoadWm2Min: result.evap_load_wm2_min,
      };
      elapsedMinutes += 1;
      peakRectalTemperatureC = Math.max(
        peakRectalTemperatureC,
        result.t_re,
      );
      if (
        firstRectalLimitMinute === null
        && result.t_re >= PHS_RECTAL_TEMPERATURE_LIMIT_C
      ) {
        firstRectalLimitMinute = elapsedMinutes;
      }
      if (
        firstWaterLossLimitMinute === null
        && result.sweat_loss_g >= waterLossLimitG
      ) {
        firstWaterLossLimitMinute = elapsedMinutes;
      }
      points.push({
        minute: elapsedMinutes,
        hours: elapsedMinutes / 60,
        segmentId: segment.id,
        segmentName: segment.name,
        tRe: result.t_re,
        tCr: result.t_cr,
        sweatLossG: result.sweat_loss_g,
      });
    }
  }

  const limitingMinute = firstRectalLimitMinute === null
    ? firstWaterLossLimitMinute
    : firstWaterLossLimitMinute === null
      ? firstRectalLimitMinute
      : Math.min(firstRectalLimitMinute, firstWaterLossLimitMinute);
  const limitingCriterion: PhsLimitingCriterion = limitingMinute === null
    ? PhsLimitingCriterion.None
    : firstRectalLimitMinute !== null
      && firstRectalLimitMinute <= (firstWaterLossLimitMinute ?? Infinity)
      ? PhsLimitingCriterion.RectalTemperature
      : PhsLimitingCriterion.WaterLoss;

  return {
    points,
    totalDurationMinutes: elapsedMinutes,
    peakRectalTemperatureC,
    firstRectalLimitMinute,
    finalWaterLossG: points[points.length - 1]?.sweatLossG ?? 0,
    waterLossLimitG,
    firstWaterLossLimitMinute,
    limitingCriterion,
    limitingMinute,
    source: CalculationSource.JsThermalComfort,
  };
}
