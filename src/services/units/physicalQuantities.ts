export const METERS_PER_FOOT = 0.3048;
export const GRAMS_PER_POUND = 453.59237;
export const BTU_PER_HOUR_SQUARE_FOOT_PER_WATT_SQUARE_METER =
  0.3169983306281505;

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
