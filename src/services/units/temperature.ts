const FAHRENHEIT_MULTIPLIER = 9 / 5;
const FAHRENHEIT_OFFSET = 32;

export function convertTemperatureFromSi(value: number): number {
  return Number.isFinite(value)
    ? value * FAHRENHEIT_MULTIPLIER + FAHRENHEIT_OFFSET
    : value;
}

export function convertTemperatureToSi(value: number): number {
  return Number.isFinite(value)
    ? (value - FAHRENHEIT_OFFSET) / FAHRENHEIT_MULTIPLIER
    : value;
}
