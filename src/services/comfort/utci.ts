/**
 * UTCI Calculation Service
 *
 * Provides functions for calculating the Universal Thermal Climate Index (UTCI)
 * and mapping the raw results to the application's canonical stress categories.
 */
import { utci } from "jsthermalcomfort";

import { CalculationSource } from "../../models/calculationMetadata";
import {
  utciStressCategoryOrder,
  type UtciStressCategory as UtciStressCategoryType,
  ensureFiniteValue,
} from "./helpers";
import type { UtciRequestDto, UtciResponseDto } from "../../models/comfortDtos";

/**
 * Validates dynamic string outputs from the calculation engine against canonical 
 * stress categories, ensuring type safety and consistency.
 * @param value The raw category string from JSThermalComfort.
 * @returns The normalized UTCI stress category.
 */
function normalizeUtciStressCategory(value: string): UtciStressCategoryType {
  const matchedCategory = utciStressCategoryOrder.find((category) => category === value);
  if (!matchedCategory) {
    throw new Error(`Unexpected UTCI stress category: ${value}`);
  }

  return matchedCategory;
}

/**
 * Main entry point for UTCI (Universal Thermal Climate Index) calculations.
 * Returns the UTCI value and its associated stress category.
 * Note: UTCI is evaluated directly and does not require local minimum/maximum temperature search brackets 
 * for solving comfort zones, unlike PMV. Its visualization bounds are defined independently.
 * This function acts as the integration gateway used by the UTCI model config state layers to drive chart updates and dashboard displays.
 * @param payload The UTCI request parameters.
 * @returns An object containing the UTCI temperature and stress category.
 */
export function calculateUtci(payload: UtciRequestDto): UtciResponseDto {
  const result = utci(payload.tdb, payload.tr, payload.v, payload.rh, payload.units, true, false);

  if (typeof result === "number") {
    throw new Error("UTCI calculation did not return a stress category.");
  }

  return {
    utci: ensureFiniteValue("UTCI", result.utci),
    stressCategory: normalizeUtciStressCategory(String(result.stress_category)),
    source: CalculationSource.JsThermalComfort,
  };
}
