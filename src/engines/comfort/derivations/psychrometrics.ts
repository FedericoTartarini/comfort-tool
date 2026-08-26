import { psy_ta_rh, p_sat } from "jsthermalcomfort";
import {
  PhysicalQuantityId,
  type DerivedSlotQuantityState,
  type PrimaryInputState,
} from "../../../catalog/quantities";

const STANDARD_ATMOSPHERIC_PRESSURE_PA = 101325;
const WATER_VAPOR_MOLECULAR_WEIGHT_RATIO = 0.62198;

/** Forward psychrometric slot derivation from primary dry-bulb temperature and RH. */
export function derivePsychrometricSlots(inputState: PrimaryInputState): DerivedSlotQuantityState {
  const psychrometricState = psy_ta_rh(
    inputState[PhysicalQuantityId.DryBulbTemperature],
    inputState[PhysicalQuantityId.RelativeHumidity],
  );

  return {
    [PhysicalQuantityId.DewPoint]: psychrometricState.t_dp,
    [PhysicalQuantityId.DerivedHumidityRatio]: psychrometricState.hr,
    [PhysicalQuantityId.WetBulb]: psychrometricState.t_wb,
    [PhysicalQuantityId.VaporPressure]: psychrometricState.p_vap,
  };
}

/**
 * Derives the active Relative Humidity given the Dry Bulb Temperature and a target Dew Point temperature.
 *
 * @param dryBulbTemperature Active dry bulb.
 * @param dewPoint Target Dew Point to resolve against.
 * @returns The solved Relative Humidity.
 */
export function deriveRelativeHumidityFromDewPoint(dryBulbTemperature: number, dewPoint: number): number {
  if (dewPoint >= dryBulbTemperature) {
    return 100;
  }

  const pVap = p_sat(dewPoint);
  const pSatTdb = p_sat(dryBulbTemperature);

  return Math.min(100, Math.max(0, (pVap / pSatTdb) * 100));
}

/**
 * Derives the active Relative Humidity given the Dry Bulb Temperature and a target Humidity Ratio.
 * @param dryBulbTemperature Active dry bulb.
 * @param humidityRatio Target humidity ratio (kg/kg).
 * @returns The solved Relative Humidity.
 */
export function calculateRelativeHumidityFromHumidityRatio(
  dryBulbTemperature: number,
  humidityRatio: number,
): number {
  const pVap = (
    humidityRatio * STANDARD_ATMOSPHERIC_PRESSURE_PA
  ) / (WATER_VAPOR_MOLECULAR_WEIGHT_RATIO + humidityRatio);
  const pSatTdb = p_sat(dryBulbTemperature);

  return (pVap / pSatTdb) * 100;
}

export function deriveRelativeHumidityFromHumidityRatio(
  dryBulbTemperature: number,
  humidityRatio: number,
): number {
  return Math.min(
    100,
    Math.max(
      0,
      calculateRelativeHumidityFromHumidityRatio(dryBulbTemperature, humidityRatio),
    ),
  );
}

/**
 * Derives the active Relative Humidity given the Dry Bulb Temperature and a target Vapor Pressure.
 * @param dryBulbTemperature Active dry bulb.
 * @param vaporPressure Target vapor pressure (Pa).
 * @returns The solved Relative Humidity.
 */
export function deriveRelativeHumidityFromVaporPressure(dryBulbTemperature: number, vaporPressure: number): number {
  const pSatTdb = p_sat(dryBulbTemperature);

  return Math.min(100, Math.max(0, (vaporPressure / pSatTdb) * 100));
}

/**
 * Derives the active Relative Humidity given the Dry Bulb Temperature and a target Wet Bulb temperature.
 * Uses a numerical iterator since no closed-form analytical inverse exists for the Wet Bulb relationship.
 *
 * @param dryBulbTemperature Active dry bulb.
 * @param wetBulbTemperature Target wet bulb temperature.
 * @returns The solved Relative Humidity.
 */
export function deriveRelativeHumidityFromWetBulb(dryBulbTemperature: number, wetBulbTemperature: number): number {
  let low = 0.01;
  let high = 100;

  for (let index = 0; index < 40; index += 1) {
    const middle = (low + high) / 2;
    const middleValue = psy_ta_rh(dryBulbTemperature, middle).t_wb;

    if (Math.abs(middleValue - wetBulbTemperature) < 1e-4) {
      return middle;
    }

    if (middleValue < wetBulbTemperature) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return (low + high) / 2;
}
