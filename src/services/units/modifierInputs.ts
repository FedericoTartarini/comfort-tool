import {
  PhysicalQuantityId,
  getPhysicalQuantityMeta,
  getQuantityDisplayMeta,
  type PhysicalQuantityId as PhysicalQuantityIdType,
} from "../../models/physicalQuantities";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../models/units";
import { convertTemperatureFromSi, convertTemperatureToSi } from "./temperature";
import {
  convertHeatFluxFromSi,
  convertHeatFluxToSi,
  convertSpeedFromSi,
  convertSpeedToSi,
} from "./physicalQuantities";
export interface ModifierFieldDisplayMeta {
  label: string;
  displayUnits: string;
  step: number;
  decimals: number;
  minValue?: number;
  maxValue?: number;
}

function isTemperatureQuantity(key: PhysicalQuantityIdType): boolean {
  return key === PhysicalQuantityId.ModifierMorningOutdoorTemperature;
}

function isAirSpeedQuantity(key: PhysicalQuantityIdType): boolean {
  return key === PhysicalQuantityId.ModifierMeasuredAirSpeed;
}

function isSolarRadiationQuantity(key: PhysicalQuantityIdType): boolean {
  return key === PhysicalQuantityId.ModifierDirectSolarRadiation;
}

export function convertModifierFieldValueFromSi(
  key: PhysicalQuantityIdType,
  value: number,
  unitSystem: UnitSystemType,
): number {
  if (unitSystem === UnitSystem.SI) return value;
  if (isTemperatureQuantity(key)) return convertTemperatureFromSi(value);
  if (isAirSpeedQuantity(key)) return convertSpeedFromSi(value);
  if (isSolarRadiationQuantity(key)) {
    return convertHeatFluxFromSi(value);
  }
  return value;
}

export function convertModifierFieldValueToSi(
  key: PhysicalQuantityIdType,
  value: number,
  unitSystem: UnitSystemType,
): number {
  if (unitSystem === UnitSystem.SI) return value;
  if (isTemperatureQuantity(key)) return convertTemperatureToSi(value);
  if (isAirSpeedQuantity(key)) return convertSpeedToSi(value);
  if (isSolarRadiationQuantity(key)) {
    return convertHeatFluxToSi(value);
  }
  return value;
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
