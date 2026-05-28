/**
 * @file helpers.ts
 * @description Centralized utility functions and shared metadata for thermal comfort models.
 *
 * This file serves as the single source of truth for:
 * 1. Comfort zone definitions (labels, colors, and thresholds) for all models (PMV, UTCI, Heat Index, etc.).
 * 2. Mathematical utilities (rounding, finite checks).
 * 3. UI helpers (axis range padding, result formatting, input ordering).
 */

import {
  inputOrder,
  type InputId as InputIdType,
} from "../../models/inputSlots";
import { FieldKey } from "../../models/fieldKeys";
import { fieldMetaByKey } from "../../models/inputFieldsMeta";
import type {
  CompareInputMap,
  ComfortZoneResponseDto,
  UtciResponseDto,
} from "../../models/comfortDtos";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../models/units";
import { convertFieldValueFromSi } from "../units";
// todo AI This import goes from a service into the state layer, which breaks the architecture rule that services should only depend on models. ResultTone should either live in src/models/ or each model should define its own tone type locally and ResultTone should be derived from those.
import type { ResultTone } from "../../state/comfortTool/types";

// Heat Index thresholds in Celsius
export const HI_CAUTION = 27;
export const HI_EXTREME_CAUTION = 32;
export const HI_DANGER = 39;
export const HI_EXTREME_DANGER = 51;

// Humidex discomfort thresholds in Celsius
export const HUMIDEX_NOTICEABLE = 30;
export const HUMIDEX_EVIDENT = 35;
export const HUMIDEX_INTENSE = 40;
export const HUMIDEX_DANGEROUS = 45;
export const HUMIDEX_STROKE_PROBABLE = 54;

// Wind Chill frostbite thresholds in SI units (W/m2)
export const WCI_FROSTBITE_30 = 1400;
export const WCI_FROSTBITE_10 = 1600;
export const WCI_FROSTBITE_2 = 2300;

// ── PMV Zones ───────────────────────────────────────────────────────────────

export type PmvZoneId =
  | "cold"
  | "cool"
  | "slightlyCool"
  | "neutral"
  | "slightlyWarm"
  | "warm"
  | "hot";

export interface PmvZoneMeta {
  id: PmvZoneId;
  label: string;
  min: number;
  max: number;
  color: string;
}

export const pmvZones = [
  { id: "cold", label: "Cold", min: -Infinity, max: -2.5, color: "#0571b0" },
  { id: "cool", label: "Cool", min: -2.5, max: -1.5, color: "#4c78a8" },
  { id: "slightlyCool", label: "Slightly Cool", min: -1.5, max: -0.5, color: "#92c5de" },
  { id: "neutral", label: "Neutral", min: -0.5, max: 0.5, color: "#f2f2f2" },
  { id: "slightlyWarm", label: "Slightly Warm", min: 0.5, max: 1.5, color: "#f4a582" },
  { id: "warm", label: "Warm", min: 1.5, max: 2.5, color: "#e15759" },
  { id: "hot", label: "Hot", min: 2.5, max: Infinity, color: "#cc79a7" },
] as const satisfies readonly PmvZoneMeta[];

// ── UTCI Stress Zones ───────────────────────────────────────────────────────

export const UtciStressCategory = {
  ExtremeColdStress: "extreme cold stress",
  VeryStrongColdStress: "very strong cold stress",
  StrongColdStress: "strong cold stress",
  ModerateColdStress: "moderate cold stress",
  SlightColdStress: "slight cold stress",
  NoThermalStress: "no thermal stress",
  ModerateHeatStress: "moderate heat stress",
  StrongHeatStress: "strong heat stress",
  VeryStrongHeatStress: "very strong heat stress",
  ExtremeHeatStress: "extreme heat stress",
} as const;

export type UtciStressCategory = (typeof UtciStressCategory)[keyof typeof UtciStressCategory];

export const utciStressCategoryOrder: UtciStressCategory[] = [
  UtciStressCategory.ExtremeColdStress,
  UtciStressCategory.VeryStrongColdStress,
  UtciStressCategory.StrongColdStress,
  UtciStressCategory.ModerateColdStress,
  UtciStressCategory.SlightColdStress,
  UtciStressCategory.NoThermalStress,
  UtciStressCategory.ModerateHeatStress,
  UtciStressCategory.StrongHeatStress,
  UtciStressCategory.VeryStrongHeatStress,
  UtciStressCategory.ExtremeHeatStress,
];

interface UtciStressBand {
  minimum: number;
  maximum: number;
  category: UtciStressCategory;
  label: string;
  color: string;
}

export const utciStressBands: UtciStressBand[] = [
  { minimum: -50, maximum: -40, category: UtciStressCategory.ExtremeColdStress, label: "Extreme Cold Stress", color: "#0f172a" },
  { minimum: -40, maximum: -27, category: UtciStressCategory.VeryStrongColdStress, label: "Very Strong Cold Stress", color: "#1d4ed8" },
  { minimum: -27, maximum: -13, category: UtciStressCategory.StrongColdStress, label: "Strong Cold Stress", color: "#2563eb" },
  { minimum: -13, maximum: 0, category: UtciStressCategory.ModerateColdStress, label: "Moderate Cold Stress", color: "#3b82f6" },
  { minimum: 0, maximum: 9, category: UtciStressCategory.SlightColdStress, label: "Slight Cold Stress", color: "#7dd3fc" },
  { minimum: 9, maximum: 26, category: UtciStressCategory.NoThermalStress, label: "No Thermal Stress", color: "#34d399" },
  { minimum: 26, maximum: 32, category: UtciStressCategory.ModerateHeatStress, label: "Moderate Heat Stress", color: "#fbbf24" },
  { minimum: 32, maximum: 38, category: UtciStressCategory.StrongHeatStress, label: "Strong Heat Stress", color: "#fb923c" },
  { minimum: 38, maximum: 46, category: UtciStressCategory.VeryStrongHeatStress, label: "Very Strong Heat Stress", color: "#f97316" },
  { minimum: 46, maximum: 55, category: UtciStressCategory.ExtremeHeatStress, label: "Extreme Heat Stress", color: "#dc2626" },
];

export const utciStressShortLabelByCategory: Record<UtciStressCategory, string> = {
  [UtciStressCategory.ExtremeColdStress]: "Ext.<br>cold",
  [UtciStressCategory.VeryStrongColdStress]: "V strong<br>cold",
  [UtciStressCategory.StrongColdStress]: "Strong<br>cold",
  [UtciStressCategory.ModerateColdStress]: "Moderate<br>cold",
  [UtciStressCategory.SlightColdStress]: "Slight<br>cold",
  [UtciStressCategory.NoThermalStress]: "No<br>stress",
  [UtciStressCategory.ModerateHeatStress]: "Moderate<br>heat",
  [UtciStressCategory.StrongHeatStress]: "Strong<br>heat",
  [UtciStressCategory.VeryStrongHeatStress]: "V strong<br>heat",
  [UtciStressCategory.ExtremeHeatStress]: "Ext.<br>heat",
};

// todo AI This file mixes zone definitions for all models, math utilities, and UI formatting helpers. Once each model gets its own service file, the zone data (heatIndexZones, humidexZones, windChillZones, adaptiveAshraeZones, adaptiveEnZones) should move into those files. Only the shared math utilities (roundValue, ensureFiniteValue, getPaddedAxisRange, getCompareInputs) belong here long-term.

// ── Thermal Index Zones ─────────────────────────────────────────────────────
export const heatIndexZones = [
  { label: "Safe", color: "#e2e8f0" },
  { label: "Caution", color: "#fef08a" },
  { label: "Extreme Caution", color: "#fde047" },
  { label: "Danger", color: "#f97316" },
  { label: "Extreme Danger", color: "#dc2626" },
];

export const humidexZones = [
  { label: "Little/None", color: "#e2e8f0" },
  { label: "Noticeable", color: "#fef08a" },
  { label: "Evident", color: "#fde047" },
  { label: "Intense", color: "#facc15" },
  { label: "Dangerous", color: "#f97316" },
  { label: "Stroke Probable", color: "#dc2626" },
];

export const windChillZones = [
  { label: "Safe", color: "#e0f2fe" },
  { label: "30 mins to frostbite", color: "#64b5f5" },
  { label: "10 mins to frostbite", color: "#5c6bc0" },
  { label: "2 mins to frostbite", color: "#8e24aa" },
];

export const adaptiveAshraeZones = [
  { label: "Too Cool", color: "#3b82f6" },
  { label: "80% Acceptability", color: "#86efac" },
  { label: "90% Acceptability", color: "#22c55e" },
  { label: "Too Warm", color: "#ef4444" },
];

export const adaptiveEnZones = [
  { label: "Too Cool", color: "#3b82f6" },
  { label: "Category III", color: "#fde047" },
  { label: "Category II", color: "#86efac" },
  { label: "Category I", color: "#22c55e" },
  { label: "Too Warm", color: "#ef4444" },
];

/**
 * Determines the Heat Index risk category based on Celsius value.
 */
export function getHeatIndexCategory(hiSi: number): string {
  if (hiSi >= HI_EXTREME_DANGER) return heatIndexZones[4].label;
  if (hiSi >= HI_DANGER) return heatIndexZones[3].label;
  if (hiSi >= HI_EXTREME_CAUTION) return heatIndexZones[2].label;
  if (hiSi >= HI_CAUTION) return heatIndexZones[1].label;
  return heatIndexZones[0].label;
}
/**
 * Resolves the metadata for a PMV value.
 * @param pmv - The predicted mean vote value.
 * @returns The metadata for the matching thermal sensation zone.
 */
export function getPmvZoneMeta(pmv: number): PmvZoneMeta {
  if (isNaN(pmv)) return pmvZones[0];
  return pmvZones.find((zone) => pmv >= zone.min && pmv < zone.max) ?? pmvZones[0];
}

/**
 * Determines the PMV thermal sensation zone.
 */
export function getPmvZone(pmv: number): { text: string; tone: ResultTone } {
  const meta = getPmvZoneMeta(pmv);
  // Construct tone id from zone id (e.g., "cold" -> "pmvCold")
  const toneId = `pmv${meta.id.charAt(0).toUpperCase() + meta.id.slice(1)}` as ResultTone;
  return { text: meta.label, tone: toneId };
}

/**
 * Determines the UTCI stress category tone.
 */
export function getUtciStressTone(category: string): ResultTone {
  switch (category) {
    case UtciStressCategory.ExtremeColdStress: return "utciExtremeCold";
    case UtciStressCategory.VeryStrongColdStress: return "utciVeryStrongCold";
    case UtciStressCategory.StrongColdStress: return "utciStrongCold";
    case UtciStressCategory.ModerateColdStress: return "utciModerateCold";
    case UtciStressCategory.SlightColdStress: return "utciSlightCold";
    case UtciStressCategory.NoThermalStress: return "utciNoStress";
    case UtciStressCategory.ModerateHeatStress: return "utciModerateHeat";
    case UtciStressCategory.StrongHeatStress: return "utciStrongHeat";
    case UtciStressCategory.VeryStrongHeatStress: return "utciVeryStrongHeat";
    case UtciStressCategory.ExtremeHeatStress: return "utciExtremeHeat";
    default: return "default";
  }
}

/**
 * Determines the UTCI stress category display label.
 */
export function getUtciStressLabel(category: string): string {
  const band = utciStressBands.find((b) => b.category === category);
  return band ? band.label : category;
}

/**
 * Determines the Humidex discomfort level.
 */
export function getHumidexDiscomfort(h: number): string {
  if (h >= HUMIDEX_STROKE_PROBABLE) return humidexZones[5].label;
  if (h >= HUMIDEX_DANGEROUS) return humidexZones[4].label;
  if (h >= HUMIDEX_INTENSE) return humidexZones[3].label;
  if (h >= HUMIDEX_EVIDENT) return humidexZones[2].label;
  if (h >= HUMIDEX_NOTICEABLE) return humidexZones[1].label;
  return humidexZones[0].label;
}

/**
 * Determines the Wind Chill frostbite risk zone.
 */
export function getWindChillZone(wci: number): string {
  if (wci >= WCI_FROSTBITE_2) return windChillZones[3].label;
  if (wci >= WCI_FROSTBITE_10) return windChillZones[2].label;
  if (wci >= WCI_FROSTBITE_30) return windChillZones[1].label;
  return windChillZones[0].label;
}

export type ComfortZonesByInput = Partial<Record<InputIdType, ComfortZoneResponseDto>>;
export type UtciChartResultsByInput = Partial<Record<InputIdType, UtciResponseDto>>;

/**
 * Rounds a number to a specific number of decimal places.
 * @param value The number to round.
 * @param decimals The number of decimal places (default is 3).
 * @returns The rounded number.
 */
export function roundValue(value: number, decimals = 3): number {
  return Number(value.toFixed(decimals));
}

/**
 * Asserts that a value is finite, throwing an error for non-finite values such as NaN and Infinity.
 * @param label The label for the value (used in error messages).
 * @param value The number to check.
 * @returns The value if finite.
 */
export function ensureFiniteValue(label: string, value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} calculation returned an invalid value.`);
  }

  return value;
}

/**
 * Formats a temperature value for display, including a sign prefix and unit.
 * @param value The temperature in SI.
 * @param unitSystem The active unit system.
 * @returns A formatted string (e.g., "+25.0 °C").
 */
export function formatSignedTemperature(value: number, unitSystem: UnitSystemType = UnitSystem.SI): string {
  const convertedValue = convertFieldValueFromSi(FieldKey.DryBulbTemperature, value, unitSystem);
  const rounded = roundValue(convertedValue, 1);
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)} ${fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem]}`;
}

/**
 * Calculates a padded axis range for charts based on a set of values.
 * @param values The data points to cover.
 * @param fallback The default range if no values are provided.
 * @param padding The amount of padding to add to the edges.
 * @returns Buffer-padded [min, max] range.
 */
export function getPaddedAxisRange(
  values: number[],
  fallback: [number, number],
  padding = 4,
): [number, number] {
  if (values.length === 0) {
    return fallback;
  }

  const rawMin = values.reduce((min, current) => Math.min(min, current));
  const rawMax = values.reduce((max, current) => Math.max(max, current));

  const roundedMin = Math.floor((rawMin - padding) / 5) * 5;
  const roundedMax = Math.ceil((rawMax + padding) / 5) * 5;

  const paddedMinimum = Math.max(fallback[0], roundedMin);
  const paddedMaximum = Math.min(fallback[1], roundedMax);

  if (paddedMinimum === paddedMaximum) {
    return [
      Math.max(fallback[0], paddedMinimum - 5),
      Math.min(fallback[1], paddedMaximum + 5),
    ];
  }

  return [paddedMinimum, paddedMaximum];
}

/**
 * Helper function to get ordered inputs from a map of inputs.
 * @param inputsByInput The map of inputs keyed by InputIdType.
 * @returns An array of inputs in the correct order.
 */
export function getCompareInputs<T>(inputsByInput: CompareInputMap<T>): Array<{ inputId: InputIdType; payload: T }> {
  return inputOrder
    .filter((inputId) => !!inputsByInput[inputId])
    .map((inputId) => ({
      inputId,
      payload: inputsByInput[inputId] as T,
    }));
}

