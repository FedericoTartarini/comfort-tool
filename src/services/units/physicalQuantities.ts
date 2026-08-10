export const METERS_PER_FOOT = 0.3048;
export const BTU_PER_HOUR_SQUARE_FOOT_PER_WATT_SQUARE_METER =
  0.3169983306281505;

export function convertSpeedFromSi(valueMetersPerSecond: number): number {
  return valueMetersPerSecond / METERS_PER_FOOT;
}

export function convertSpeedToSi(valueFeetPerSecond: number): number {
  return valueFeetPerSecond * METERS_PER_FOOT;
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
