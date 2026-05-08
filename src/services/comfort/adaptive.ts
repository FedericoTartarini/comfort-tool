import { adaptive_ashrae, adaptive_en, t_o } from "jsthermalcomfort";

import { CalculationSource, ComfortStandard } from "../../models/calculationMetadata";
import type { AdaptiveRequestDto, AdaptiveResponseDto } from "../../models/comfortDtos";
import { AdaptiveStandardMode } from "../../models/inputModes";
import { UnitSystem } from "../../models/units";

/**
 * Calculates the cooling effect (CE) based on air speed and operative temperature.
 * Used to shift the upper comfort boundary in adaptive models according to ASHRAE 55 and EN 16798-1.
 *
 * @param v Air speed in m/s.
 * @param to Operative temperature in Celsius.
 * @returns The cooling effect value in Celsius.
 */
export function getCe(v: number, to: number): number {
  let ce = 0;
  if (v >= 0.6 && to >= 25.0) {
    if (v < 0.9) {
      ce = 1.2;
    } else if (v < 1.2) {
      ce = 1.8;
    } else {
      ce = 2.2;
    }
  }
  return ce;
}

// Gets the status of the comfort based on the operative temperature and the comfort limits defined by the standard used.
function getStatus(to: number, low: number, up: number): string {
  if (to < low) return "Too cool";
  if (to > up) return "Too warm";
  return "Comfortable";
}

// Calculates the adaptive comfort based on the standard mode.
export function calculateAdaptive(
  payload: AdaptiveRequestDto,
  standardMode: AdaptiveStandardMode,
): AdaptiveResponseDto {
  const isAshrae = standardMode === AdaptiveStandardMode.Ashrae;
  // Operative temperature (to).
  const to = t_o(payload.tdb, payload.tr, payload.v, isAshrae ? "ASHRAE" : "ISO");

  // ASHRAE 55 Adaptive Comfort Standard.
  if (isAshrae) {
    const result = adaptive_ashrae(
      // Dry-bulb temperature (tdb).
      payload.tdb,
      // Radiant temperature (tr).
      payload.tr,
      // Mean radiant temperature (trm).
      payload.trm,
      // Air speed (v).
      payload.v,
      // Units of measurement.
      payload.units === UnitSystem.SI ? "SI" : "IP",
      // Flag to indicate if the calculation should be performed.
      true,
      { round_output: false },
    );

    // Return the results.
    return {
      t_cmf: result.tmp_cmf,
      acceptability_80: result.acceptability_80,
      acceptability_90: result.acceptability_90,
      status_80: result.acceptability_80 ? "Comfortable" : (to < result.tmp_cmf ? "Too cool" : "Too warm"),
      status_90: result.acceptability_90 ? "Comfortable" : (to < result.tmp_cmf ? "Too cool" : "Too warm"),
      tmp_cmf_80_low: result.tmp_cmf_80_low,
      tmp_cmf_80_up: result.tmp_cmf_80_up,
      tmp_cmf_90_low: result.tmp_cmf_90_low,
      tmp_cmf_90_up: result.tmp_cmf_90_up,
      isCompliant: !Number.isNaN(result.tmp_cmf),
      standard: ComfortStandard.Ashrae55Adaptive,
      source: CalculationSource.JsThermalComfort,
    };
  }

  // EN 16798-1 Adaptive Comfort Standard.
  const result = adaptive_en(
    // Dry-bulb temperature (tdb).
    payload.tdb,
    // Radiant temperature (tr).
    payload.tr,
    // Mean radiant temperature (trm).
    payload.trm,
    // Air speed (v).
    payload.v,
    // Units of measurement.
    payload.units === UnitSystem.SI ? "SI" : "IP",
    // Flag to indicate if the calculation should be performed.
    true,
    { round_output: false },
  );

  // Return the results.
  return {
    t_cmf: result.tmp_cmf,
    acceptability_cat_i: result.acceptability_cat_i,
    acceptability_cat_ii: result.acceptability_cat_ii,
    acceptability_cat_iii: result.acceptability_cat_iii,
    status_cat_i: result.acceptability_cat_i ? "Comfortable" : (to < result.tmp_cmf ? "Too cool" : "Too warm"),
    status_cat_ii: result.acceptability_cat_ii ? "Comfortable" : (to < result.tmp_cmf ? "Too cool" : "Too warm"),
    status_cat_iii: result.acceptability_cat_iii ? "Comfortable" : (to < result.tmp_cmf ? "Too cool" : "Too warm"),
    tmp_cmf_cat_i_low: result.tmp_cmf_cat_i_low,
    tmp_cmf_cat_i_up: result.tmp_cmf_cat_i_up,
    tmp_cmf_cat_ii_low: result.tmp_cmf_cat_ii_low,
    tmp_cmf_cat_ii_up: result.tmp_cmf_cat_ii_up,
    tmp_cmf_cat_iii_low: result.tmp_cmf_cat_iii_low,
    tmp_cmf_cat_iii_up: result.tmp_cmf_cat_iii_up,
    isCompliant: !Number.isNaN(result.tmp_cmf),
    standard: ComfortStandard.En16798Adaptive,
    source: CalculationSource.JsThermalComfort,
  };
}
