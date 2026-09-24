/** ASHRAE 55 elevated air-speed limits when occupants have no local control. */

const STILL_AIR_LIMIT = 0.2;
const HIGH_TEMPERATURE_LIMIT = 0.8;
const QUADRATIC_MIN_TO = 23;
const QUADRATIC_MAX_TO = 25.5;

export function maxRelativeAirSpeedWithoutOccupantControl(
  operativeTemperatureSi: number,
): number {
  if (operativeTemperatureSi < QUADRATIC_MIN_TO) return STILL_AIR_LIMIT;
  if (operativeTemperatureSi > QUADRATIC_MAX_TO) return HIGH_TEMPERATURE_LIMIT;
  const quadratic = 50.49
    - 4.4047 * operativeTemperatureSi
    + 0.096425 * operativeTemperatureSi * operativeTemperatureSi;
  return Math.min(HIGH_TEMPERATURE_LIMIT, Math.max(STILL_AIR_LIMIT, quadratic));
}

export function clipRelativeAirSpeedWithoutOccupantControl(
  operativeTemperatureSi: number,
  relativeAirSpeedSi: number,
): number {
  return Math.min(
    relativeAirSpeedSi,
    maxRelativeAirSpeedWithoutOccupantControl(operativeTemperatureSi),
  );
}
