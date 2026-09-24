import type { CalculationSource } from "./calculationMetadata";
import { PhysicalQuantityId } from "./quantities";

export const PHS_STANDARD_VERSION = "7933-2023";
export const PHS_COMPLIANCE_HORIZON_MINUTES = 480;

export const PhsPosture = {
  Sitting: "sitting",
  Standing: "standing",
  Crouching: "crouching",
} as const;

export type PhsPosture = (typeof PhsPosture)[keyof typeof PhsPosture];

export const PhsSegmentPreset = {
  Work: "work",
  Rest: "rest",
} as const;

export type PhsSegmentPreset =
  (typeof PhsSegmentPreset)[keyof typeof PhsSegmentPreset];

export const phsPersonQuantityIds = [
  PhysicalQuantityId.BodyWeight,
  PhysicalQuantityId.Height,
] as const;

export type PhsPersonQuantityId = (typeof phsPersonQuantityIds)[number];

export type PhsPersonQuantities = Record<PhsPersonQuantityId, number>;

export interface PhsPersonSettingsSi extends PhsPersonQuantities {
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

export interface PhsRequest extends PhsEnvironmentSi {
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

export interface PhsTimeSeriesSegment extends PhsEnvironmentSi {
  id: string;
  name: string;
  durationMinutes: number;
}

export interface PhsTimeSeriesDraft {
  segments: PhsTimeSeriesSegment[];
  person: PhsPersonSettingsSi;
}

export interface PhsHistorySample {
  minute: number;
  hours: number;
  segmentId: string;
  segmentName: string;
  tRe: number;
  tCr: number;
  tSk: number;
  sweatLossG: number;
}

export interface PhsSimulationRequest {
  segments: readonly PhsTimeSeriesSegment[];
  person: PhsPersonSettingsSi;
  recordHistory: boolean;
}

export interface PhsSimulationCallbacks {
  isCancelled?: () => boolean;
  onProgress?: (completedMinutes: number, totalMinutes: number) => void;
}

/** One result shape is shared by Analysis and the Time-series workspace. */
export interface PhsSimulationResult {
  valid: boolean;
  issues: string[];
  tRe: number;
  tCr: number;
  tSk: number;
  sweatLossG: number;
  sweatRateWatt: number;
  totalDurationMinutes: number;
  peakRectalTemperatureC: number;
  waterLossLimitG: number;
  waterLossLimitPercent: 3 | 5;
  firstRectalLimitMinute: number | null;
  firstWaterLossLimitMinute: number | null;
  limitingMinute: number | null;
  limitingCriterion: PhsLimitingCriterion;
  /** Compatibility values used by the existing Analysis result sections. */
  dLimTreMinutes: number;
  dLimWaterLossMinutes: number;
  limitingExposureTimeMinutes: number;
  /** Present only when the caller asks the simulator to retain its trajectory. */
  samples?: PhsHistorySample[];
  source: CalculationSource;
}

export type PhsResponse = PhsSimulationResult;
export type PhsTimeSeriesResult = PhsSimulationResult;

export const defaultPhsSimulationFlags = {
  posture: PhsPosture.Standing,
  acclimatized: true,
  drinkingAllowed: true,
} as const;

export const defaultPhsPersonSettings: PhsPersonSettingsSi = { [PhysicalQuantityId.BodyWeight]: 75, [PhysicalQuantityId.Height]: 1.8, ...defaultPhsSimulationFlags };

export const phsPersonRangeSi: Record<PhsPersonQuantityId, { min: number; max: number }> = {
  [PhysicalQuantityId.BodyWeight]: { min: 30, max: 200 },
  [PhysicalQuantityId.Height]: { min: 1.2, max: 2.2 },
};

export const phsReferenceEnvironment: PhsEnvironmentSi = {
  tdb: 35,
  tr: 35,
  v: 0.1,
  rh: 71,
  met: 2.6,
  clo: 0.5,
};
