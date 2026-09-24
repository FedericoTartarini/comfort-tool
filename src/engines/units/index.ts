import {
  PhysicalQuantityId,
  getPhysicalQuantityMeta,
} from "../../catalog/quantities";
import { unitLabel, type UnitSystem as UnitSystemType } from "../../catalog/units";
export * from "./modifierInputs";
export {
  convertTemperatureDeltaFromSi,
  convertTemperatureDeltaToSi,
  convertTemperatureFromSi,
  convertTemperatureToSi,
} from "./temperature";
export {
  convertHeatFluxFromSi,
  convertHeatFluxToSi,
  convertHumidityRatioFromSi,
  convertHumidityRatioToSi,
  convertLengthFromSi,
  convertLengthToSi,
  convertMassFromSi,
  convertMassToSi,
  convertVaporPressureFromSi,
  convertVaporPressureToSi,
} from "./physicalQuantities";
export {
  convertCanonicalSiUnitFromSi,
  convertCanonicalSiUnitToSi,
  convertQuantityFromSi,
  convertQuantityToSi,
  convertQuantityFromSi as convertFieldValueFromSi,
  convertQuantityToSi as convertFieldValueToSi,
} from "./quantityConversion";
/**
 * Centralized unit conversion helpers.
 * Canonical shared state stays in SI; these helpers map values to and from the active UI unit system.
 * Quantity conversion reads `siUnit` from the closed quantity catalog.
 * Rounding happens only at the display boundary (`formatDisplayValue` / `roundToDisplay`).
 */
export type DisplayQuantityMeta = {
  displayUnits: string;
  step: number;
};

export const DISPLAY_MAX_FRACTION_DIGITS = 2;

/** Plotly/d3-format: at most two fraction digits, trailing zeros trimmed. */
export const PLOTLY_DISPLAY_NUMBER_FORMAT = ".2~f";

export function plotlyHoverNumber(ref: string): string {
  return `%{${ref}:${PLOTLY_DISPLAY_NUMBER_FORMAT}}`;
}

const KILOMETERS_PER_HOUR_PER_METER_PER_SECOND = 3.6;

export function convertMetersPerSecondToKilometersPerHour(value: number): number {
  return value * KILOMETERS_PER_HOUR_PER_METER_PER_SECOND;
}

export function getHumidityRatioDisplayMeta(unitSystem: UnitSystemType): DisplayQuantityMeta {
  const meta = getPhysicalQuantityMeta(PhysicalQuantityId.HumidityRatio);
  return {
    displayUnits: unitLabel(meta.siUnit, unitSystem),
    step: meta.step,
  };
}

export function getVaporPressureDisplayMeta(unitSystem: UnitSystemType): DisplayQuantityMeta {
  const meta = getPhysicalQuantityMeta(PhysicalQuantityId.VaporPressure);
  return {
    displayUnits: unitLabel(meta.siUnit, unitSystem),
    step: meta.step,
  };
}

export function roundToDisplay(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  const digits = DISPLAY_MAX_FRACTION_DIGITS;
  return Number(`${Math.round(Number(`${value}e${digits}`))}e-${digits}`);
}

/** At most two fraction digits; trailing zeros are omitted (`25.50` → `25.5`). */
export function formatDisplayValue(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  const rounded = roundToDisplay(value);
  if (Object.is(rounded, -0)) {
    return "0";
  }
  return String(rounded);
}
