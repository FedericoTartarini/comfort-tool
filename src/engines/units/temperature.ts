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

/** Convert a temperature difference. Do not apply the Fahrenheit offset. */
export function convertTemperatureDeltaFromSi(value: number): number {
  return Number.isFinite(value) ? value * FAHRENHEIT_MULTIPLIER : value;
}

export function convertTemperatureDeltaToSi(value: number): number {
  return Number.isFinite(value) ? value / FAHRENHEIT_MULTIPLIER : value;
}
