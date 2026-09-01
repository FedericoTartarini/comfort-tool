import {
  getPhysicalQuantityMeta,
  type PhysicalQuantityId as PhysicalQuantityIdType,
} from "../../catalog/quantities";
import { modifierExtraInputRangeSi } from "../../catalog/inputModifiers";
import { unitLabel, type UnitSystem as UnitSystemType } from "../../catalog/units";
import { convertQuantityFromSi, convertQuantityToSi } from "./quantityConversion";

export interface ModifierFieldDisplayMeta {
  label: string;
  displayUnits: string;
  step: number;
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
  const range = modifierExtraInputRangeSi[key];
  return {
    label: meta.label,
    displayUnits: unitLabel(meta.siUnit, unitSystem),
    step: meta.step,
    minValue: range
      ? convertModifierFieldValueFromSi(key, range.min, unitSystem)
      : undefined,
    maxValue: range
      ? convertModifierFieldValueFromSi(key, range.max, unitSystem)
      : undefined,
  };
}
