import { describe, expect, it } from "vitest";

import { FieldKey } from "../../models/fieldKeys";
import { UnitSystem } from "../../models/units";
import {
  convertFieldValueFromSi,
  convertFieldValueToSi,
  convertHumidityRatioFromSi,
  convertHumidityRatioToSi,
  convertMetersPerSecondToKilometersPerHour,
  convertLengthFromSi,
  convertLengthToSi,
  convertMassFromSi,
  convertMassToSi,
  convertVaporPressureFromSi,
  convertVaporPressureToSi,
  getHumidityRatioDisplayMeta,
  getVaporPressureDisplayMeta,
} from "./index";

describe("units helpers", () => {
  it("converts metres per second to kilometres per hour", () => {
    expect(convertMetersPerSecondToKilometersPerHour(0)).toBe(0);
    expect(convertMetersPerSecondToKilometersPerHour(1)).toBe(3.6);
    expect(convertMetersPerSecondToKilometersPerHour(10)).toBe(36);
  });

  it("round-trips field conversions between SI and IP", () => {
    const displayTemperature = convertFieldValueFromSi(FieldKey.DryBulbTemperature, 25, UnitSystem.IP);
    expect(displayTemperature).toBeCloseTo(77, 6);
    expect(convertFieldValueToSi(FieldKey.DryBulbTemperature, displayTemperature, UnitSystem.IP)).toBeCloseTo(25, 6);

    const displayOperativeTemperature = convertFieldValueFromSi(
      FieldKey.OperativeTemperature,
      25,
      UnitSystem.IP,
    );
    expect(displayOperativeTemperature).toBeCloseTo(77, 6);
    expect(convertFieldValueToSi(
      FieldKey.OperativeTemperature,
      displayOperativeTemperature,
      UnitSystem.IP,
    )).toBeCloseTo(25, 6);

    const displayWindSpeed = convertFieldValueFromSi(FieldKey.WindSpeed, 1.2, UnitSystem.IP);
    expect(displayWindSpeed).toBeCloseTo(3.937007874, 6);
    expect(convertFieldValueToSi(FieldKey.WindSpeed, displayWindSpeed, UnitSystem.IP)).toBeCloseTo(1.2, 6);
  });

  it("round-trips humidity ratio and vapor pressure display conversions", () => {
    const humidityRatioIp = convertHumidityRatioFromSi(0.0085, UnitSystem.IP);
    expect(convertHumidityRatioToSi(humidityRatioIp, UnitSystem.IP)).toBeCloseTo(0.0085, 8);

    const humidityRatioSi = convertHumidityRatioFromSi(0.0085, UnitSystem.SI);
    expect(convertHumidityRatioToSi(humidityRatioSi, UnitSystem.SI)).toBeCloseTo(0.0085, 8);

    const vaporPressureIp = convertVaporPressureFromSi(1600, UnitSystem.IP);
    expect(convertVaporPressureToSi(vaporPressureIp, UnitSystem.IP)).toBeCloseTo(1600, 6);

    const vaporPressureSi = convertVaporPressureFromSi(1600, UnitSystem.SI);
    expect(convertVaporPressureToSi(vaporPressureSi, UnitSystem.SI)).toBeCloseTo(1600, 6);
  });

  it("round-trips PHS person length and mass quantities", () => {
    const feet = convertLengthFromSi(1.8);
    expect(convertLengthToSi(feet)).toBeCloseTo(1.8, 10);

    const pounds = convertMassFromSi(75000);
    expect(convertMassToSi(pounds)).toBeCloseTo(75000, 8);
  });

  it("exposes display metadata for derived humidity quantities", () => {
    expect(getHumidityRatioDisplayMeta(UnitSystem.SI)).toEqual({
      displayUnits: "g/kg",
      step: 0.1,
      decimals: 1,
    });

    expect(getHumidityRatioDisplayMeta(UnitSystem.IP)).toEqual({
      displayUnits: "gr/lb",
      step: 1,
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
