import { describe, expect, it } from "vitest";

import { PhysicalQuantityId } from "../../models/quantities";
import { UnitSystem } from "../../models/units";
import {
  convertModifierFieldValueFromSi,
  convertModifierFieldValueToSi,
  getModifierFieldDisplayMeta,
} from "./modifierInputs";

describe("modifier input units", () => {
  it.each([
    [PhysicalQuantityId.ModifierMorningOutdoorTemperature, 20],
    [PhysicalQuantityId.ModifierMeasuredAirSpeed, 1],
    [PhysicalQuantityId.ModifierDirectSolarRadiation, 800],
  ] as const)("round-trips %s between SI and IP", (field, valueSi) => {
    const displayValue = convertModifierFieldValueFromSi(field, valueSi, UnitSystem.IP);
    expect(convertModifierFieldValueToSi(field, displayValue, UnitSystem.IP))
      .toBeCloseTo(valueSi, 8);
  });

  it.each([
    PhysicalQuantityId.ModifierSolarAltitude,
    PhysicalQuantityId.ModifierSolarHorizontalAngle,
    PhysicalQuantityId.ModifierSolarTransmittance,
    PhysicalQuantityId.ModifierSkyVaultViewFraction,
    PhysicalQuantityId.ModifierBodyExposureFraction,
  ])("keeps unit-invariant fields unchanged for %s", (field) => {
    expect(convertModifierFieldValueFromSi(field, 0.5, UnitSystem.IP)).toBe(0.5);
    expect(convertModifierFieldValueToSi(field, 0.5, UnitSystem.IP)).toBe(0.5);
  });

  it("converts display ranges and units centrally", () => {
    const temperatureMeta = getModifierFieldDisplayMeta(
      PhysicalQuantityId.ModifierMorningOutdoorTemperature,
      UnitSystem.IP,
    );
    const radiationMeta = getModifierFieldDisplayMeta(
      PhysicalQuantityId.ModifierDirectSolarRadiation,
      UnitSystem.IP,
    );

    expect(temperatureMeta.displayUnits).toBe("°F");
    expect(radiationMeta.displayUnits).toBe("Btu/(h·ft²)");
    expect(radiationMeta.decimals).toBe(3);
    expect(radiationMeta.minValue).toBeCloseTo(63.3997, 3);
    expect(radiationMeta.maxValue).toBeCloseTo(316.9983, 3);

    for (const boundary of [radiationMeta.minValue, radiationMeta.maxValue]) {
      const committedDisplayValue = Number(boundary!.toFixed(radiationMeta.decimals));
      const roundTrippedSi = convertModifierFieldValueToSi(
        PhysicalQuantityId.ModifierDirectSolarRadiation,
        committedDisplayValue,
        UnitSystem.IP,
      );
      expect(roundTrippedSi).toBeGreaterThanOrEqual(200);
      expect(roundTrippedSi).toBeLessThanOrEqual(1000);
    }
  });
});
