import { psy_ta_rh } from "jsthermalcomfort";
import { describe, expect, it } from "vitest";

import { PhysicalQuantityId } from "../../../models/physicalQuantities";
import {
  calculateRelativeHumidityFromHumidityRatio,
  derivePsychrometricSlots,
  deriveRelativeHumidityFromHumidityRatio,
} from "./psychrometrics";

describe("psychrometric derivations", () => {
  it("preserves an ordinary humidity-ratio conversion", () => {
    const humidityRatio = psy_ta_rh(25, 50).hr;

    expect(calculateRelativeHumidityFromHumidityRatio(25, humidityRatio))
      .toBeCloseTo(50, 8);
    expect(deriveRelativeHumidityFromHumidityRatio(25, humidityRatio))
      .toBeCloseTo(50, 8);
  });

  it("keeps derivePsychrometricSlots aligned with psy_ta_rh for RH mode", () => {
    const primary = {
      [PhysicalQuantityId.DryBulbTemperature]: 25,
      [PhysicalQuantityId.RelativeHumidity]: 50,
    } as const;
    const psychrometric = psy_ta_rh(25, 50);
    const derived = derivePsychrometricSlots({
      ...primary,
      [PhysicalQuantityId.MeanRadiantTemperature]: 24,
      [PhysicalQuantityId.RelativeAirSpeed]: 0.1,
      [PhysicalQuantityId.WindSpeed]: 1,
      [PhysicalQuantityId.MetabolicRate]: 1,
      [PhysicalQuantityId.ClothingInsulation]: 0.5,
      [PhysicalQuantityId.ExternalWork]: 0,
      [PhysicalQuantityId.PrevailingMeanOutdoorTemperature]: 20,
    });

    expect(derived[PhysicalQuantityId.DewPoint]).toBeCloseTo(psychrometric.t_dp, 4);
    expect(derived[PhysicalQuantityId.DerivedHumidityRatio]).toBeCloseTo(psychrometric.hr, 6);
    expect(derived[PhysicalQuantityId.WetBulb]).toBeCloseTo(psychrometric.t_wb, 4);
    expect(derived[PhysicalQuantityId.VaporPressure]).toBeCloseTo(psychrometric.p_vap, 2);
  });

  it("exposes supersaturation while the input synchronizer remains bounded", () => {
    const humidityRatio = 0.03;

    expect(calculateRelativeHumidityFromHumidityRatio(25, humidityRatio))
      .toBeGreaterThan(100);
    expect(deriveRelativeHumidityFromHumidityRatio(25, humidityRatio)).toBe(100);
  });
});
