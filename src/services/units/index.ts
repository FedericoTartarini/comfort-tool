import {
  PhysicalQuantityId,
  type ChartAxisQuantityId,
  type PhysicalQuantityId as PhysicalQuantityIdType,
} from "../../models/physicalQuantities";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../models/units";
import { convertTemperatureFromSi, convertTemperatureToSi } from "./temperature";
import {
  convertLengthFromSi,
  convertLengthToSi,
  convertMassFromSi,
  convertMassToSi,
  convertSpeedFromSi,
  convertSpeedToSi,
} from "./physicalQuantities";
export * from "./modelOutputs";
export * from "./modifierInputs";
export {
  convertHeatFluxFromSi,
  convertHeatFluxToSi,
  convertLengthFromSi,
  convertLengthToSi,
  convertMassFromSi,
  convertMassToSi,
} from "./physicalQuantities";

/**
 * Centralized unit conversion helpers.
 * Canonical shared state stays in SI; these helpers map values to and from the active UI unit system.
 */
export type DisplayQuantityMeta = {
  displayUnits: string;
  step: number;
  decimals: number;
};

const humidityRatioDisplayMetaByUnitSystem: Record<UnitSystemType, DisplayQuantityMeta> = {
  [UnitSystem.SI]: {
    displayUnits: "g/kg",
    step: 0.1,
    decimals: 1,
  },
  [UnitSystem.IP]: {
    displayUnits: "gr/lb",
    step: 1,
    decimals: 0,
  },
};

const vaporPressureDisplayMetaByUnitSystem: Record<UnitSystemType, DisplayQuantityMeta> = {
  [UnitSystem.SI]: {
    displayUnits: "kPa",
    step: 0.01,
    decimals: 2,
  },
  [UnitSystem.IP]: {
    displayUnits: "inHg",
    step: 0.01,
    decimals: 2,
  },
};

const GRAINS_PER_POUND = 7000;
const GRAMS_PER_KG = 1000;
const PASCALS_PER_INHG = 3386.389;
const PASCALS_PER_KPA = 1000;

const KILOMETERS_PER_HOUR_PER_METER_PER_SECOND = 3.6;

export function convertMetersPerSecondToKilometersPerHour(value: number): number {
  return value * KILOMETERS_PER_HOUR_PER_METER_PER_SECOND;
}

export function convertModelQuantityFromSi(
  quantityId: PhysicalQuantityIdType,
  valueSi: number,
  unitSystem: UnitSystemType,
): number {
  if (unitSystem === UnitSystem.SI) {
    return valueSi;
  }
  if (quantityId === PhysicalQuantityId.PhsBodyWeight) {
    return convertMassFromSi(valueSi * 1000);
  }
  if (quantityId === PhysicalQuantityId.PhsHeight) {
    return convertLengthFromSi(valueSi);
  }
  return valueSi;
}

export function convertModelQuantityToSi(
  quantityId: PhysicalQuantityIdType,
  value: number,
  unitSystem: UnitSystemType,
): number {
  if (unitSystem === UnitSystem.SI) {
    return value;
  }
  if (quantityId === PhysicalQuantityId.PhsBodyWeight) {
    return convertMassToSi(value) / 1000;
  }
  if (quantityId === PhysicalQuantityId.PhsHeight) {
    return convertLengthToSi(value);
  }
  return value;
}

export function convertFieldValueFromSi(
  key: ChartAxisQuantityId,
  value: number,
  unitSystem: UnitSystemType,
): number {
  if (unitSystem === UnitSystem.SI) {
    return value;
  }

  if (
    key === PhysicalQuantityId.DryBulbTemperature ||
    key === PhysicalQuantityId.MeanRadiantTemperature ||
    key === PhysicalQuantityId.PrevailingMeanOutdoorTemperature ||
    key === PhysicalQuantityId.OperativeTemperature
  ) {
    return convertTemperatureFromSi(value);
  }

  if (key === PhysicalQuantityId.RelativeAirSpeed || key === PhysicalQuantityId.WindSpeed) {
    return convertSpeedFromSi(value);
  }

  return value;
}

export function convertFieldValueToSi(
  key: ChartAxisQuantityId,
  value: number,
  unitSystem: UnitSystemType,
): number {
  if (unitSystem === UnitSystem.SI) {
    return value;
  }

  if (
    key === PhysicalQuantityId.DryBulbTemperature ||
    key === PhysicalQuantityId.MeanRadiantTemperature ||
    key === PhysicalQuantityId.PrevailingMeanOutdoorTemperature ||
    key === PhysicalQuantityId.OperativeTemperature
  ) {
    return convertTemperatureToSi(value);
  }

  if (key === PhysicalQuantityId.RelativeAirSpeed || key === PhysicalQuantityId.WindSpeed) {
    return convertSpeedToSi(value);
  }

  return value;
}

export function convertHumidityRatioFromSi(value: number, unitSystem: UnitSystemType): number {
  return unitSystem === UnitSystem.IP ? value * GRAINS_PER_POUND : value * GRAMS_PER_KG;
}

export function convertHumidityRatioToSi(value: number, unitSystem: UnitSystemType): number {
  return unitSystem === UnitSystem.IP ? value / GRAINS_PER_POUND : value / GRAMS_PER_KG;
}

export function convertVaporPressureFromSi(value: number, unitSystem: UnitSystemType): number {
  return unitSystem === UnitSystem.IP ? value / PASCALS_PER_INHG : value / PASCALS_PER_KPA;
}

export function convertVaporPressureToSi(value: number, unitSystem: UnitSystemType): number {
  return unitSystem === UnitSystem.IP ? value * PASCALS_PER_INHG : value * PASCALS_PER_KPA;
}

export function getHumidityRatioDisplayMeta(unitSystem: UnitSystemType): DisplayQuantityMeta {
  return humidityRatioDisplayMetaByUnitSystem[unitSystem];
}

export function getVaporPressureDisplayMeta(unitSystem: UnitSystemType): DisplayQuantityMeta {
  return vaporPressureDisplayMetaByUnitSystem[unitSystem];
}

export function formatDisplayValue(value: number, decimals: number): string {
  return value.toFixed(decimals);
}
