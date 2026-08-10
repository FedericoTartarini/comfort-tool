import {
  ModifierFieldKey,
  modifierFieldMetaByKey,
  type ModifierFieldKey as ModifierFieldKeyType,
} from "../../models/inputModifiers";
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

function isTemperatureField(key: ModifierFieldKeyType): boolean {
  return key === ModifierFieldKey.MorningOutdoorTemperature;
}

function isAirSpeedField(key: ModifierFieldKeyType): boolean {
  return key === ModifierFieldKey.MeasuredAirSpeed;
}

function isSolarRadiationField(key: ModifierFieldKeyType): boolean {
  return key === ModifierFieldKey.DirectSolarRadiation;
}

export function convertModifierFieldValueFromSi(
  key: ModifierFieldKeyType,
  value: number,
  unitSystem: UnitSystemType,
): number {
  if (unitSystem === UnitSystem.SI) return value;
  if (isTemperatureField(key)) return convertTemperatureFromSi(value);
  if (isAirSpeedField(key)) return convertSpeedFromSi(value);
  if (isSolarRadiationField(key)) {
    return convertHeatFluxFromSi(value);
  }
  return value;
}

export function convertModifierFieldValueToSi(
  key: ModifierFieldKeyType,
  value: number,
  unitSystem: UnitSystemType,
): number {
  if (unitSystem === UnitSystem.SI) return value;
  if (isTemperatureField(key)) return convertTemperatureToSi(value);
  if (isAirSpeedField(key)) return convertSpeedToSi(value);
  if (isSolarRadiationField(key)) {
    return convertHeatFluxToSi(value);
  }
  return value;
}

function getDisplayUnits(key: ModifierFieldKeyType, unitSystem: UnitSystemType): string {
  if (isTemperatureField(key)) return unitSystem === UnitSystem.SI ? "°C" : "°F";
  if (isAirSpeedField(key)) return unitSystem === UnitSystem.SI ? "m/s" : "ft/s";
  if (isSolarRadiationField(key)) {
    return unitSystem === UnitSystem.SI ? "W/m²" : "Btu/(h·ft²)";
  }
  if (
    key === ModifierFieldKey.SolarAltitude
    || key === ModifierFieldKey.SolarHorizontalAngle
  ) {
    return "°";
  }
  return "";
}

function getDisplayStep(key: ModifierFieldKeyType, unitSystem: UnitSystemType): number {
  const { step } = modifierFieldMetaByKey[key];
  if (unitSystem === UnitSystem.SI) return step;
  if (isTemperatureField(key)) return 1;
  if (isAirSpeedField(key)) return 0.05;
  if (isSolarRadiationField(key)) return 5;
  return step;
}

function getDisplayDecimals(
  key: ModifierFieldKeyType,
  unitSystem: UnitSystemType,
): number {
  if (unitSystem === UnitSystem.IP && isSolarRadiationField(key)) return 3;
  return modifierFieldMetaByKey[key].decimals;
}

export function getModifierFieldDisplayMeta(
  key: ModifierFieldKeyType,
  unitSystem: UnitSystemType,
): ModifierFieldDisplayMeta {
  const meta = modifierFieldMetaByKey[key];
  return {
    label: meta.label,
    displayUnits: getDisplayUnits(key, unitSystem),
    step: getDisplayStep(key, unitSystem),
    decimals: getDisplayDecimals(key, unitSystem),
    minValue: meta.minValue === undefined
      ? undefined
      : convertModifierFieldValueFromSi(key, meta.minValue, unitSystem),
    maxValue: meta.maxValue === undefined
      ? undefined
      : convertModifierFieldValueFromSi(key, meta.maxValue, unitSystem),
  };
}
