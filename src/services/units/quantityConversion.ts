import {
  getPhysicalQuantityMeta,
  type PhysicalQuantityId as PhysicalQuantityIdType,
} from "../../models/physicalQuantities";
import {
  SiUnit,
  UnitSystem,
  isSiUnit,
  type UnitSystem as UnitSystemType,
} from "../../models/units";
import { convertTemperatureFromSi, convertTemperatureToSi } from "./temperature";
import {
  convertHeatFluxFromSi,
  convertHeatFluxToSi,
  convertHumidityRatioFromSi,
  convertHumidityRatioToSi,
  convertLengthFromSi,
  convertLengthToSi,
  convertMassFromSi,
  convertMassToSi,
  convertSpeedFromSi,
  convertSpeedToSi,
  convertVaporPressureFromSi,
  convertVaporPressureToSi,
} from "./physicalQuantities";

/**
 * Convert a canonical SI storage value using the catalog SI unit token.
 * Control widgets must not branch on quantity ids or model ids.
 */
export function convertCanonicalSiUnitFromSi(
  siUnit: string,
  valueSi: number,
  unitSystem: UnitSystemType,
): number {
  if (!isSiUnit(siUnit)) {
    throw new Error(`Unknown SI unit "${siUnit}".`);
  }
  switch (siUnit) {
    case SiUnit.DegreeCelsius:
      return unitSystem === UnitSystem.IP ? convertTemperatureFromSi(valueSi) : valueSi;
    case SiUnit.MeterPerSecond:
      return unitSystem === UnitSystem.IP ? convertSpeedFromSi(valueSi) : valueSi;
    case SiUnit.WattPerSquareMeter:
      return unitSystem === UnitSystem.IP ? convertHeatFluxFromSi(valueSi) : valueSi;
    case SiUnit.Kilogram:
      return unitSystem === UnitSystem.IP ? convertMassFromSi(valueSi * 1000) : valueSi;
    case SiUnit.Meter:
      return unitSystem === UnitSystem.IP ? convertLengthFromSi(valueSi) : valueSi;
    case SiUnit.KilogramPerKilogram:
      return convertHumidityRatioFromSi(valueSi, unitSystem);
    case SiUnit.Pascal:
      return convertVaporPressureFromSi(valueSi, unitSystem);
    case SiUnit.Percent:
    case SiUnit.Met:
    case SiUnit.Clo:
    case SiUnit.Degree:
    case SiUnit.Dimensionless:
      return valueSi;
    default: {
      const exhaustive: never = siUnit;
      throw new Error(`Unknown SI unit "${exhaustive}".`);
    }
  }
}

export function convertCanonicalSiUnitToSi(
  siUnit: string,
  value: number,
  unitSystem: UnitSystemType,
): number {
  if (!isSiUnit(siUnit)) {
    throw new Error(`Unknown SI unit "${siUnit}".`);
  }
  switch (siUnit) {
    case SiUnit.DegreeCelsius:
      return unitSystem === UnitSystem.IP ? convertTemperatureToSi(value) : value;
    case SiUnit.MeterPerSecond:
      return unitSystem === UnitSystem.IP ? convertSpeedToSi(value) : value;
    case SiUnit.WattPerSquareMeter:
      return unitSystem === UnitSystem.IP ? convertHeatFluxToSi(value) : value;
    case SiUnit.Kilogram:
      return unitSystem === UnitSystem.IP ? convertMassToSi(value) / 1000 : value;
    case SiUnit.Meter:
      return unitSystem === UnitSystem.IP ? convertLengthToSi(value) : value;
    case SiUnit.KilogramPerKilogram:
      return convertHumidityRatioToSi(value, unitSystem);
    case SiUnit.Pascal:
      return convertVaporPressureToSi(value, unitSystem);
    case SiUnit.Percent:
    case SiUnit.Met:
    case SiUnit.Clo:
    case SiUnit.Degree:
    case SiUnit.Dimensionless:
      return value;
    default: {
      const exhaustive: never = siUnit;
      throw new Error(`Unknown SI unit "${exhaustive}".`);
    }
  }
}

export function convertQuantityFromSi(
  quantityId: PhysicalQuantityIdType,
  valueSi: number,
  unitSystem: UnitSystemType,
): number {
  return convertCanonicalSiUnitFromSi(
    getPhysicalQuantityMeta(quantityId).display.units.SI,
    valueSi,
    unitSystem,
  );
}

export function convertQuantityToSi(
  quantityId: PhysicalQuantityIdType,
  value: number,
  unitSystem: UnitSystemType,
): number {
  return convertCanonicalSiUnitToSi(
    getPhysicalQuantityMeta(quantityId).display.units.SI,
    value,
    unitSystem,
  );
}
