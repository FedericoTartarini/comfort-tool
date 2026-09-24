import { describe, expect, it } from "vitest";
import { PhysicalQuantityId } from "../../catalog/quantities";

import { UnitSystem } from "../../catalog/units";
import {
  convertModifierFieldValueFromSi,
  convertModifierFieldValueToSi,
  getModifierFieldDisplayMeta,
} from "./modifierInputs";

describe("modifier input units", () => {
  it.each([
    [PhysicalQuantityId.MorningOutdoorTemperature, 20],
    [PhysicalQuantityId.MeasuredAirSpeed, 1],
    [PhysicalQuantityId.DirectSolarRadiation, 800],
  ] as const)("round-trips %s between SI and IP", (field, valueSi) => {
    const displayValue = convertModifierFieldValueFromSi(field, valueSi, UnitSystem.IP);
    expect(convertModifierFieldValueToSi(field, displayValue, UnitSystem.IP))
      .toBeCloseTo(valueSi, 8);
  });

  it.each([
    PhysicalQuantityId.SolarAltitude,
    PhysicalQuantityId.SolarHorizontalAngle,
    PhysicalQuantityId.SolarTransmittance,
    PhysicalQuantityId.SkyVaultViewFraction,
    PhysicalQuantityId.BodyExposureFraction,
  ])("keeps unit-invariant fields unchanged for %s", (field) => {
    expect(convertModifierFieldValueFromSi(field, 0.5, UnitSystem.IP)).toBe(0.5);
    expect(convertModifierFieldValueToSi(field, 0.5, UnitSystem.IP)).toBe(0.5);
  });

  it("converts display ranges and units centrally", () => {
    const temperatureMeta = getModifierFieldDisplayMeta(
      PhysicalQuantityId.MorningOutdoorTemperature,
      UnitSystem.IP,
    );
    const radiationMeta = getModifierFieldDisplayMeta(
      PhysicalQuantityId.DirectSolarRadiation,
      UnitSystem.IP,
    );

    expect(temperatureMeta.displayUnits).toBe("°F");
    expect(radiationMeta.displayUnits).toBe("Btu/(h·ft²)");
    expect(radiationMeta.minValue).toBeCloseTo(63.3997, 3);
    expect(radiationMeta.maxValue).toBeCloseTo(316.9983, 3);
  });

  it("reads SI ranges from the modifier catalogue", () => {
    const measured = getModifierFieldDisplayMeta(
      PhysicalQuantityId.MeasuredAirSpeed,
      UnitSystem.SI,
    );
    const altitude = getModifierFieldDisplayMeta(
      PhysicalQuantityId.SolarAltitude,
      UnitSystem.SI,
    );

    expect(measured.minValue).toBe(0);
    expect(measured.maxValue).toBe(2);
    expect(altitude.minValue).toBe(0);
    expect(altitude.maxValue).toBe(90);
  });
});
