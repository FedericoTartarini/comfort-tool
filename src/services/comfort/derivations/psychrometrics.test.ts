import { psy_ta_rh } from "jsthermalcomfort";
import { describe, expect, it } from "vitest";

import {
  calculateRelativeHumidityFromHumidityRatio,
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

  it("exposes supersaturation while the input synchronizer remains bounded", () => {
    const humidityRatio = 0.03;

    expect(calculateRelativeHumidityFromHumidityRatio(25, humidityRatio))
      .toBeGreaterThan(100);
    expect(deriveRelativeHumidityFromHumidityRatio(25, humidityRatio)).toBe(100);
  });
});
