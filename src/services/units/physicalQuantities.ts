import { UnitSystem, type UnitSystem as UnitSystemType } from "../../models/units";

export const METERS_PER_FOOT = 0.3048;
export const GRAMS_PER_POUND = 453.59237;
export const BTU_PER_HOUR_SQUARE_FOOT_PER_WATT_SQUARE_METER =
  0.3169983306281505;
const GRAINS_PER_POUND = 7000;
const GRAMS_PER_KG = 1000;
const PASCALS_PER_INHG = 3386.389;
const PASCALS_PER_KPA = 1000;

export function convertSpeedFromSi(valueMetersPerSecond: number): number {
  return valueMetersPerSecond / METERS_PER_FOOT;
}

export function convertSpeedToSi(valueFeetPerSecond: number): number {
  return valueFeetPerSecond * METERS_PER_FOOT;
}

export function convertLengthFromSi(valueMeters: number): number {
  return valueMeters / METERS_PER_FOOT;
}

export function convertLengthToSi(valueFeet: number): number {
  return valueFeet * METERS_PER_FOOT;
}

export function convertMassFromSi(valueGrams: number): number {
  return valueGrams / GRAMS_PER_POUND;
}

export function convertMassToSi(valuePounds: number): number {
  return valuePounds * GRAMS_PER_POUND;
}

export function convertHeatFluxFromSi(valueWattsPerSquareMeter: number): number {
  return valueWattsPerSquareMeter
    * BTU_PER_HOUR_SQUARE_FOOT_PER_WATT_SQUARE_METER;
}

export function convertHeatFluxToSi(
  valueBtuPerHourSquareFoot: number,
): number {
  return valueBtuPerHourSquareFoot
    / BTU_PER_HOUR_SQUARE_FOOT_PER_WATT_SQUARE_METER;
}

/** Canonical humidity ratio is kg/kg. SI display is g/kg; IP display is gr/lb. */
export function convertHumidityRatioFromSi(
  valueKilogramPerKilogram: number,
  unitSystem: UnitSystemType,
): number {
  return unitSystem === UnitSystem.IP
    ? valueKilogramPerKilogram * GRAINS_PER_POUND
    : valueKilogramPerKilogram * GRAMS_PER_KG;
}

export function convertHumidityRatioToSi(
  value: number,
  unitSystem: UnitSystemType,
): number {
  return unitSystem === UnitSystem.IP
    ? value / GRAINS_PER_POUND
    : value / GRAMS_PER_KG;
}

/** Canonical vapor pressure is Pa. SI display is kPa; IP display is inHg. */
export function convertVaporPressureFromSi(
  valuePascals: number,
  unitSystem: UnitSystemType,
): number {
  return unitSystem === UnitSystem.IP
    ? valuePascals / PASCALS_PER_INHG
    : valuePascals / PASCALS_PER_KPA;
}

export function convertVaporPressureToSi(
  value: number,
  unitSystem: UnitSystemType,
): number {
  return unitSystem === UnitSystem.IP
    ? value * PASCALS_PER_INHG
    : value * PASCALS_PER_KPA;
}
