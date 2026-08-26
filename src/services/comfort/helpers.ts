import {
  inputOrder,
  type InputId as InputIdType,
} from "../../models/inputSlots";
import type { CompareInputMap } from "../../models/chartSource";
import type { ThermalZone } from "../../models/thermalZone";

export function roundValue(value: number, decimals = 3): number {
  return Number(value.toFixed(decimals));
}

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

export function getCompareInputs<T>(compareInputsByInput: CompareInputMap<T>): Array<{ inputId: InputIdType; payload: T }> {
  return inputOrder.flatMap((inputId) => {
    const payload = compareInputsByInput[inputId];
    return payload === undefined ? [] : [{ inputId, payload }];
  });
}

export function getBaselineInputEntry<T>(
  compareInputsByInput: CompareInputMap<T>,
  baselineInputId: InputIdType,
): { inputId: InputIdType; payload: T } {
  const payload = compareInputsByInput[baselineInputId];
  if (payload === undefined) {
    throw new Error(`Missing chart baseline payload for ${baselineInputId}.`);
  }
  return { inputId: baselineInputId, payload };
}
