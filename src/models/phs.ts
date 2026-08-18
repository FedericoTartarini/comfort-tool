import type { CalculationSource } from "./calculationMetadata";

export const PHS_STANDARD_VERSION = "7933-2023";
export const PHS_MAX_DURATION_MINUTES = 480;
export const PHS_RECTAL_TEMPERATURE_LIMIT_C = 38;

export const PhsPosture = {
  Sitting: "sitting",
  Standing: "standing",
  Crouching: "crouching",
} as const;

export type PhsPosture = (typeof PhsPosture)[keyof typeof PhsPosture];

export interface PhsPersonSettingsSi {
  weightKg: number;
  heightM: number;
  posture: PhsPosture;
  acclimatized: boolean;
  drinkingAllowed: boolean;
}

export interface PhsEnvironmentSi {
  tdb: number;
  tr: number;
  v: number;
  rh: number;
  met: number;
  clo: number;
}

export interface PhsRequestDto extends PhsEnvironmentSi {
  durationMinutes: number;
  person: PhsPersonSettingsSi;
}

export const PhsLimitingCriterion = {
  RectalTemperature: "rectal-temperature",
  WaterLoss: "water-loss",
  None: "none",
} as const;

export type PhsLimitingCriterion =
  (typeof PhsLimitingCriterion)[keyof typeof PhsLimitingCriterion];

export interface PhsResponseDto {
  valid: boolean;
  issues: string[];
  tRe: number;
  tCr: number;
  tSk: number;
  dLimTreMinutes: number;
  dLimWaterLossMinutes: number;
  limitingExposureTimeMinutes: number;
  limitingCriterion: PhsLimitingCriterion;
  sweatLossG: number;
  sweatRateWatt: number;
  source: CalculationSource;
}

export interface PhsTimeSeriesSegment extends PhsEnvironmentSi {
  id: string;
  name: string;
  durationMinutes: number;
}

export interface PhsTimeSeriesPoint {
  minute: number;
  hours: number;
  segmentId: string;
  segmentName: string;
  tRe: number;
  tCr: number;
  sweatLossG: number;
}

export interface PhsTimeSeriesResult {
  points: PhsTimeSeriesPoint[];
  totalDurationMinutes: number;
  peakRectalTemperatureC: number;
  firstRectalLimitMinute: number | null;
  finalWaterLossG: number;
  waterLossLimitG: number;
  firstWaterLossLimitMinute: number | null;
  limitingCriterion: PhsLimitingCriterion;
  limitingMinute: number | null;
  source: CalculationSource;
}

export const phsReferencePerson: PhsPersonSettingsSi = {
  weightKg: 75,
  heightM: 1.8,
  posture: PhsPosture.Standing,
  acclimatized: true,
  drinkingAllowed: true,
};

export const phsReferenceEnvironment: PhsEnvironmentSi = {
  tdb: 35,
  tr: 35,
  v: 0.1,
  rh: 71,
  met: 2.6,
  clo: 0.5,
};
