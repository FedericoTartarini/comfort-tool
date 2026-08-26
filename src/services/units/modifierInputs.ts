import {
  getPhysicalQuantityMeta,
  getQuantityDisplayMeta,
  type PhysicalQuantityId as PhysicalQuantityIdType,
} from "../../models/quantities";
import { type UnitSystem as UnitSystemType } from "../../models/units";
import { convertQuantityFromSi, convertQuantityToSi } from "./quantityConversion";

export interface ModifierFieldDisplayMeta {
  label: string;
  displayUnits: string;
  step: number;
  decimals: number;
  minValue?: number;
  maxValue?: number;
}

export function convertModifierFieldValueFromSi(
  key: PhysicalQuantityIdType,
  value: number,
  unitSystem: UnitSystemType,
): number {
  return convertQuantityFromSi(key, value, unitSystem);
}

export function convertModifierFieldValueToSi(
  key: PhysicalQuantityIdType,
  value: number,
  unitSystem: UnitSystemType,
): number {
  return convertQuantityToSi(key, value, unitSystem);
}

export function getModifierFieldDisplayMeta(
  key: PhysicalQuantityIdType,
  unitSystem: UnitSystemType,
): ModifierFieldDisplayMeta {
  const meta = getPhysicalQuantityMeta(key);
  const display = getQuantityDisplayMeta(key, unitSystem);
  return {
    label: meta.label,
    displayUnits: display.displayUnits,
    step: display.step,
    decimals: display.decimals,
    minValue: convertModifierFieldValueFromSi(key, meta.minSi, unitSystem),
    maxValue: convertModifierFieldValueFromSi(key, meta.maxSi, unitSystem),
  };
}
