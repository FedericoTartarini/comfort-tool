/**
 * @file helpers.ts
 * @description Centralized utility functions for thermal comfort models.
 *
 * This file serves as the single source of truth for:
 * 1. Mathematical utilities (rounding, finite checks).
 * 2. UI helpers (ordered input mapping).
 */

import {
  inputOrder,
  type InputId as InputIdType,
} from "../../models/inputSlots";
import type {
  CompareInputMap,
} from "../../models/comfortDtos";
import type { ThermalZone } from "../../models/thermalZone";

/**
 * Rounds a number to a specific number of decimal places.
 * @param value The number to round.
 * @param decimals The number of decimal places (default is 3).
 * @returns The rounded number.
 */
export function roundValue(value: number, decimals = 3): number {
  return Number(value.toFixed(decimals));
}

/**
 * Checks if a value is a finite number.
 * @param value The value to check.
 * @returns True if the value is a number and is finite.
 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Resolves the first array-ordered, half-open thermal zone or fails explicitly. */
export function requireThermalZone(
  zones: readonly ThermalZone[],
  value: number,
  modelLabel: string,
): ThermalZone {
  if (!Number.isFinite(value)) {
    throw new Error(`${modelLabel} produced a non-finite thermal-zone value: ${value}.`);
  }

  const zone = zones.find((candidate) => candidate.contains(value));
  if (!zone) {
    throw new Error(
      `${modelLabel} value ${value} does not match any declared thermal zone.`,
    );
  }
  return zone;
}

/**
 * Helper function to get ordered inputs from a map of inputs.
 * @param inputsByInput The map of inputs keyed by InputIdType.
 * @returns An array of inputs in the correct order.
 */
export function getCompareInputs<T>(inputsByInput: CompareInputMap<T>): Array<{ inputId: InputIdType; payload: T }> {
  return inputOrder
    .filter((inputId) => !!inputsByInput[inputId])
    .map((inputId) => ({
      inputId,
      payload: inputsByInput[inputId] as T,
    }));
}

export function getBaselineInputEntry<T>(
  inputsByInput: CompareInputMap<T>,
  baselineInputId: InputIdType,
): { inputId: InputIdType; payload: T } {
  const payload = inputsByInput[baselineInputId];
  if (payload === undefined) {
    throw new Error(`Missing chart baseline payload for ${baselineInputId}.`);
  }
  return { inputId: baselineInputId, payload };
}
