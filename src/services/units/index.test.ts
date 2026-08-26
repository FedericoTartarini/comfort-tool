import { describe, expect, it } from "vitest";

import { PhysicalQuantityId } from "../../models/quantities";
import { PhsQuantityId } from "../../models/phs";
import { UnitSystem } from "../../models/units";
import {
  convertCanonicalSiUnitFromSi,
  convertFieldValueFromSi,
  convertFieldValueToSi,
  convertHumidityRatioFromSi,
  convertHumidityRatioToSi,
  convertLengthFromSi,
  convertLengthToSi,
  convertMassFromSi,
  convertMassToSi,
  convertMetersPerSecondToKilometersPerHour,
  convertModelQuantityFromSi,
  convertModelQuantityToSi,
  convertModifierFieldValueFromSi,
  convertQuantityFromSi,
  convertQuantityToSi,
  convertTemperatureDeltaFromSi,
  convertTemperatureDeltaToSi,
  convertVaporPressureFromSi,
  convertVaporPressureToSi,
  getHumidityRatioDisplayMeta,
  getVaporPressureDisplayMeta,
} from "./index";
import "../../state/comfortTool/modelConfigs";

describe("units helpers", () => {
  it("converts metres per second to kilometres per hour", () => {
    expect(convertMetersPerSecondToKilometersPerHour(0)).toBe(0);
    expect(convertMetersPerSecondToKilometersPerHour(1)).toBe(3.6);
    expect(convertMetersPerSecondToKilometersPerHour(10)).toBe(36);
  });

  it("round-trips field conversions between SI and IP through the catalog", () => {
    const displayTemperature = convertFieldValueFromSi(PhysicalQuantityId.DryBulbTemperature, 25, UnitSystem.IP);
    expect(displayTemperature).toBeCloseTo(77, 6);
    expect(convertFieldValueToSi(PhysicalQuantityId.DryBulbTemperature, displayTemperature, UnitSystem.IP)).toBeCloseTo(25, 6);

    const displayOperativeTemperature = convertFieldValueFromSi(
      PhysicalQuantityId.OperativeTemperature,
      25,
      UnitSystem.IP,
    );
    expect(displayOperativeTemperature).toBeCloseTo(77, 6);
    expect(convertFieldValueToSi(
      PhysicalQuantityId.OperativeTemperature,
      displayOperativeTemperature,
      UnitSystem.IP,
    )).toBeCloseTo(25, 6);

    const displayWindSpeed = convertFieldValueFromSi(PhysicalQuantityId.WindSpeed, 1.2, UnitSystem.IP);
    expect(displayWindSpeed).toBeCloseTo(3.937007874, 6);
    expect(convertFieldValueToSi(PhysicalQuantityId.WindSpeed, displayWindSpeed, UnitSystem.IP)).toBeCloseTo(1.2, 6);
  });

  it("converts dew point and solar radiation from catalog SI units, not quantity-id lists", () => {
    expect(convertQuantityFromSi(PhysicalQuantityId.DewPoint, 0, UnitSystem.IP)).toBe(32);
    expect(convertQuantityToSi(PhysicalQuantityId.DewPoint, 32, UnitSystem.IP)).toBeCloseTo(0, 10);

    const displayRadiation = convertQuantityFromSi(
      PhysicalQuantityId.ModifierDirectSolarRadiation,
      1000,
      UnitSystem.IP,
    );
    expect(displayRadiation).toBeCloseTo(316.9983306281505, 8);
    expect(convertQuantityToSi(
      PhysicalQuantityId.ModifierDirectSolarRadiation,
      displayRadiation,
      UnitSystem.IP,
    )).toBeCloseTo(1000, 8);
  });

  it("converts temperature differences without the Fahrenheit offset", () => {
    expect(convertTemperatureDeltaFromSi(1.64)).toBeCloseTo(2.952, 6);
    expect(convertTemperatureDeltaToSi(2.952)).toBeCloseTo(1.64, 6);
    expect(convertTemperatureDeltaFromSi(Number.NaN)).toBeNaN();
  });

  it("round-trips humidity ratio and vapor pressure display conversions", () => {
    const humidityRatioIp = convertHumidityRatioFromSi(0.0085, UnitSystem.IP);
    expect(convertHumidityRatioToSi(humidityRatioIp, UnitSystem.IP)).toBeCloseTo(0.0085, 8);

    const humidityRatioSi = convertHumidityRatioFromSi(0.0085, UnitSystem.SI);
    expect(humidityRatioSi).toBeCloseTo(8.5, 8);
    expect(convertHumidityRatioToSi(humidityRatioSi, UnitSystem.SI)).toBeCloseTo(0.0085, 8);

    const vaporPressureIp = convertVaporPressureFromSi(1600, UnitSystem.IP);
    expect(convertVaporPressureToSi(vaporPressureIp, UnitSystem.IP)).toBeCloseTo(1600, 6);

    const vaporPressureSi = convertVaporPressureFromSi(1600, UnitSystem.SI);
    expect(vaporPressureSi).toBeCloseTo(1.6, 8);
    expect(convertVaporPressureToSi(vaporPressureSi, UnitSystem.SI)).toBeCloseTo(1600, 6);
  });

  it("converts humidity ratio and vapor pressure through assembled catalog ids", () => {
    expect(convertQuantityFromSi(
      PhysicalQuantityId.DerivedHumidityRatio,
      0.0085,
      UnitSystem.SI,
    )).toBeCloseTo(8.5, 8);
    expect(convertQuantityFromSi(
      PhysicalQuantityId.HumidityRatio,
      0.009,
      UnitSystem.IP,
    )).toBeCloseTo(63, 8);
    expect(convertQuantityFromSi(
      PhysicalQuantityId.VaporPressure,
      1600,
      UnitSystem.SI,
    )).toBeCloseTo(1.6, 8);
    expect(convertQuantityToSi(
      PhysicalQuantityId.VaporPressure,
      1.8,
      UnitSystem.SI,
    )).toBeCloseTo(1800, 8);
  });

  it("uses the same catalog conversion for fields, modifiers, and model quantities", () => {
    const valueSi = 20;
    expect(convertFieldValueFromSi(PhysicalQuantityId.DryBulbTemperature, valueSi, UnitSystem.IP))
      .toBe(convertQuantityFromSi(PhysicalQuantityId.DryBulbTemperature, valueSi, UnitSystem.IP));
    expect(convertModifierFieldValueFromSi(
      PhysicalQuantityId.ModifierMorningOutdoorTemperature,
      valueSi,
      UnitSystem.IP,
    )).toBe(convertQuantityFromSi(
      PhysicalQuantityId.ModifierMorningOutdoorTemperature,
      valueSi,
      UnitSystem.IP,
    ));
    expect(convertModelQuantityFromSi(PhsQuantityId.BodyWeight, 75, UnitSystem.IP))
      .toBe(convertQuantityFromSi(PhsQuantityId.BodyWeight, 75, UnitSystem.IP));
  });

  it("round-trips PHS person length and mass quantities", () => {
    const feet = convertLengthFromSi(1.8);
    expect(convertLengthToSi(feet)).toBeCloseTo(1.8, 10);

    const pounds = convertMassFromSi(75000);
    expect(convertMassToSi(pounds)).toBeCloseTo(75000, 8);
  });

  it("converts model-scoped mass and length from catalog SI units", () => {
    const displayWeight = convertModelQuantityFromSi(
      PhsQuantityId.BodyWeight,
      75,
      UnitSystem.IP,
    );
    expect(displayWeight).toBeCloseTo(convertMassFromSi(75000), 8);
    expect(convertModelQuantityToSi(
      PhsQuantityId.BodyWeight,
      displayWeight,
      UnitSystem.IP,
    )).toBeCloseTo(75, 8);

    const displayHeight = convertModelQuantityFromSi(
      PhsQuantityId.Height,
      1.8,
      UnitSystem.IP,
    );
    expect(displayHeight).toBeCloseTo(convertLengthFromSi(1.8), 10);
    expect(convertModelQuantityToSi(
      PhsQuantityId.Height,
      displayHeight,
      UnitSystem.IP,
    )).toBeCloseTo(1.8, 10);

    expect(convertModelQuantityFromSi(
      PhsQuantityId.BodyWeight,
      75,
      UnitSystem.SI,
    )).toBe(75);
  });

  it("rejects unknown canonical SI units", () => {
    expect(() => convertCanonicalSiUnitFromSi("stone", 1, UnitSystem.IP))
      .toThrow(/Unknown SI unit "stone"/);
  });

  it("exposes display metadata for derived humidity quantities from the catalog", () => {
    expect(getHumidityRatioDisplayMeta(UnitSystem.SI)).toEqual({
      displayUnits: "g/kg",
      step: 0.1,
      decimals: 1,
    });

    expect(getHumidityRatioDisplayMeta(UnitSystem.IP)).toEqual({
      displayUnits: "gr/lb",
      step: 0.1,
      decimals: 0,
    });

    expect(getVaporPressureDisplayMeta(UnitSystem.SI)).toEqual({
      displayUnits: "kPa",
      step: 0.01,
      decimals: 2,
    });

    expect(getVaporPressureDisplayMeta(UnitSystem.IP)).toEqual({
      displayUnits: "inHg",
      step: 0.01,
      decimals: 2,
    });
  });
});
