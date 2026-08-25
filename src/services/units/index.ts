import {
  PhysicalQuantityId,
  getQuantityDisplayMeta,
} from "../../models/physicalQuantities";
import { type UnitSystem as UnitSystemType } from "../../models/units";
export * from "./modelOutputs";
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
  convertQuantityFromSi as convertModelQuantityFromSi,
  convertQuantityToSi as convertModelQuantityToSi,
} from "./quantityConversion";

/**
 * Centralized unit conversion helpers.
 * Canonical shared state stays in SI; these helpers map values to and from the active UI unit system.
 * Quantity conversion reads `display.units.SI` from the assembled catalog.
 */
export type DisplayQuantityMeta = {
  displayUnits: string;
  step: number;
  decimals: number;
};

const KILOMETERS_PER_HOUR_PER_METER_PER_SECOND = 3.6;

export function convertMetersPerSecondToKilometersPerHour(value: number): number {
  return value * KILOMETERS_PER_HOUR_PER_METER_PER_SECOND;
}

export function getHumidityRatioDisplayMeta(unitSystem: UnitSystemType): DisplayQuantityMeta {
  return getQuantityDisplayMeta(PhysicalQuantityId.DerivedHumidityRatio, unitSystem);
}

export function getVaporPressureDisplayMeta(unitSystem: UnitSystemType): DisplayQuantityMeta {
  return getQuantityDisplayMeta(PhysicalQuantityId.VaporPressure, unitSystem);
}

export function formatDisplayValue(value: number, decimals: number): string {
  return value.toFixed(decimals);
}
