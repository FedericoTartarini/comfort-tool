import { pmv_ppd_ashrae, units_converter } from "jsthermalcomfort";
import { check_standard_compliance } from "jsthermalcomfort/lib/esm/utilities/utilities.js";

import type { PmvRequestDto } from "../../models/comfortDtos";
import { UnitSystem } from "../../models/units";

export { pmv_ppd_ashrae };
export const PMV_COMFORT_LIMIT = 0.5;

// The exact bounds are used primarily as a search bracket for finding PMV roots (comfort zone boundaries).
// They represent the limits of the comfort zone solver, not the actual mathematical limits of the PMV model.
const COMFORT_ZONE_MIN_DRY_BULB = 10;
const COMFORT_ZONE_MAX_DRY_BULB = 40;
const ROOT_SCAN_POINTS = 81;
const ROOT_REFINE_POINTS = 7;
const ROOT_MAX_REFINEMENTS = 9;
const ROOT_TOLERANCE = 5e-4;

type TemperatureBracket =
  | { exactTemperature: number } // Found a specific dry bulb temperature that meets the target PMV within expected tolerance.
  | { low: number; high: number }; // Found a temperature range bracket where the target PMV root exists.

/**
 * Scans a range of temperatures sequentially to locate a bracket where the target PMV root crosses zero.
 * Note: A simple bisection search cannot be used from the very beginning because the ASHRAE definition
 * bounds cause the PMV function to frequently return NaN at edge temperatures. The sequential scan
 * ensures we can safely walk over these "holes" (invalid compliance zones) in the domain.
 */
function findTemperatureBracket(
  targetPmv: number,
  rh: number,
  payload: PmvRequestDto,
  minimum: number,
  maximum: number,
  pointCount: number,
): TemperatureBracket | null {
  let previousTemperature: number | null = null;
  let previousDelta: number | null = null;

  for (let index = 0; index < pointCount; index += 1) {
    const temperature = minimum + ((maximum - minimum) * index) / (pointCount - 1);
    const evaluationPayload = {
      ...payload,
      tdb: temperature,
      rh,
    };
    const normalizedPayload = evaluationPayload.units === UnitSystem.SI
      ? evaluationPayload
      : {
          ...evaluationPayload,
          ...units_converter(
            {
              tdb: evaluationPayload.tdb,
              tr: evaluationPayload.tr,
              vr: evaluationPayload.vr,
            },
            evaluationPayload.units,
          ),
          units: UnitSystem.SI,
        };

    const complianceWarnings = check_standard_compliance("ASHRAE", {
      tdb: normalizedPayload.tdb,
      tr: normalizedPayload.tr,
      v: normalizedPayload.vr,
      met: normalizedPayload.met,
      clo: normalizedPayload.clo,
      airspeed_control: normalizedPayload.occupantHasAirSpeedControl,
    });

    if (complianceWarnings.length > 0) {
      previousTemperature = null;
      previousDelta = null;
      continue;
    }

    const pmv = pmv_ppd_ashrae(
      normalizedPayload.tdb,
      normalizedPayload.tr,
      normalizedPayload.vr,
      normalizedPayload.rh,
      normalizedPayload.met,
      normalizedPayload.clo,
      normalizedPayload.wme,
      {
        units: normalizedPayload.units,
        limit_inputs: false,
        airspeed_control: normalizedPayload.occupantHasAirSpeedControl,
      },
    ).pmv;
    const delta = Number.isFinite(pmv) ? pmv - targetPmv : null;

    if (delta === null) {
      previousTemperature = null;
      previousDelta = null;
      continue;
    }

    if (Math.abs(delta) < ROOT_TOLERANCE) {
      return { exactTemperature: temperature };
    }

    if (previousTemperature !== null && previousDelta !== null && previousDelta * delta <= 0) {
      return {
        low: previousTemperature,
        high: temperature,
      };
    }

    previousTemperature = temperature;
    previousDelta = delta;
  }

  return null;
}

/**
 * Solves for the dry bulb temperature that results in a target PMV value at a given RH.
 * Uses a recursive refinement strategy (bisection-like) for root finding tailored specifically for ASHRAE thresholds.
 * 
 * DESIGN DECISION (No External Solver/SciPy equivalent used here):
 * This function handles severe domain-specific edge cases. Standard third-party mathematical bisection 
 * libraries generically assume continuous domains and typically panic, hang, or evaluate inaccurately 
 * when the tested function returns `NaN`. Because the strict ASHRAE boundary conditions within 
 * `jsthermalcomfort` frequently returns `NaN` at edge
 * temperatures during the bracket scan phase, a generic solver cannot be safely utilized. We 
 * preserve this custom sequential boundary-scanning solver to safely "walk over" those `NaN` 
 * holes to find genuine mathematical roots without crashing the state application.
 * 
 * @param targetPmv The target PMV value to solve for (e.g., -0.5, +0.5).
 * @param rh The relative humidity (0-100).
 * @param payload The base comfort request parameters.
 * @returns The solved dry bulb temperature, or null if no solution is found within range.
 */
export function solveDryBulbForTargetPmv(
  targetPmv: number,
  rh: number,
  payload: PmvRequestDto,
): number | null {
  const initialBracket = findTemperatureBracket(
    targetPmv,
    rh,
    payload,
    COMFORT_ZONE_MIN_DRY_BULB,
    COMFORT_ZONE_MAX_DRY_BULB,
    ROOT_SCAN_POINTS,
  );

  if (!initialBracket) {
    return null;
  }

  if ("exactTemperature" in initialBracket) {
    return initialBracket.exactTemperature;
  }

  let currentBracket = initialBracket;

  for (let index = 0; index < ROOT_MAX_REFINEMENTS; index += 1) {
    const refinedBracket = findTemperatureBracket(
      targetPmv,
      rh,
      payload,
      currentBracket.low,
      currentBracket.high,
      ROOT_REFINE_POINTS,
    );

    if (!refinedBracket) {
      break;
    }

    if ("exactTemperature" in refinedBracket) {
      return refinedBracket.exactTemperature;
    }

    currentBracket = refinedBracket;
  }

  return (currentBracket.low + currentBracket.high) / 2;
}
