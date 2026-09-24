import { psy_ta_rh } from "jsthermalcomfort";
import { PhysicalQuantityId } from "../../../catalog/quantities";
import { describe, expect, it } from "vitest";

import {
  calculateRelativeHumidityFromHumidityRatio,
  derivePsychrometricSlots,
  deriveRelativeHumidityFromHumidityRatio,
  displayRangeForHumidityQuantity,
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
    const primary = { [PhysicalQuantityId.DryBulbTemperature]: 25, [PhysicalQuantityId.RelativeHumidity]: 50 } as const;
    const psychrometric = psy_ta_rh(25, 50);
    const derived = derivePsychrometricSlots({ ...primary, [PhysicalQuantityId.MeanRadiantTemperature]: 24, [PhysicalQuantityId.RelativeAirSpeed]: 0.1, [PhysicalQuantityId.WindSpeed]: 1, [PhysicalQuantityId.MetabolicRate]: 1, [PhysicalQuantityId.ClothingInsulation]: 0.5, [PhysicalQuantityId.ExternalWork]: 0, [PhysicalQuantityId.PrevailingMeanOutdoorTemperature]: 20 });

    expect(derived[PhysicalQuantityId.DewPointTemperature]).toBeCloseTo(psychrometric.t_dp, 4);
    expect(derived[PhysicalQuantityId.HumidityRatio]).toBeCloseTo(psychrometric.hr, 6);
    expect(derived[PhysicalQuantityId.WetBulbTemperature]).toBeCloseTo(psychrometric.t_wb, 4);
    expect(derived[PhysicalQuantityId.VaporPressure]).toBeCloseTo(psychrometric.p_vap, 2);
  });

  it("exposes supersaturation while the input synchronizer remains bounded", () => {
    const humidityRatio = 0.03;

    expect(calculateRelativeHumidityFromHumidityRatio(25, humidityRatio))
      .toBeGreaterThan(100);
    expect(deriveRelativeHumidityFromHumidityRatio(25, humidityRatio)).toBe(100);
  });

  it("maps the model RH range through psychrometrics at the current tdb", () => {
    const rhRange = { min: 0, max: 100 };
    const at25 = displayRangeForHumidityQuantity(
      25,
      rhRange,
      PhysicalQuantityId.HumidityRatio,
    );
    const at35 = displayRangeForHumidityQuantity(
      35,
      rhRange,
      PhysicalQuantityId.HumidityRatio,
    );
    const dewPoint = displayRangeForHumidityQuantity(
      25,
      rhRange,
      PhysicalQuantityId.DewPointTemperature,
    );
    const wetBulb = displayRangeForHumidityQuantity(
      25,
      rhRange,
      PhysicalQuantityId.WetBulbTemperature,
    );

    expect(at25.min).toBeCloseTo(psy_ta_rh(25, 0).hr, 8);
    expect(at25.max).toBeCloseTo(psy_ta_rh(25, 100).hr, 8);
    expect(at35.max).toBeGreaterThan(at25.max);
    expect(dewPoint.max).toBeCloseTo(Math.min(psy_ta_rh(25, 100).t_dp, 25), 6);
    expect(dewPoint.min).toBeCloseTo(psy_ta_rh(25, 0.01).t_dp, 6);
    expect(wetBulb.max).toBeCloseTo(Math.min(psy_ta_rh(25, 100).t_wb, 25), 6);
    expect(
      displayRangeForHumidityQuantity(
        25,
        rhRange,
        PhysicalQuantityId.RelativeHumidity,
      ),
    ).toEqual(rhRange);
  });
});
