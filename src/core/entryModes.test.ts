import { describe, expect, it } from "vitest";
import { humidityMode } from "./entryModes";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities } from "./quantities";

describe("humidityMode", () => {
  it("names the library quantity each mode enters", () => {
    expect(humidityMode.relativeHumidity.quantity).toBe(quantities.rh);
    expect(humidityMode.humidityRatio.quantity).toBe(quantities.hr);
    expect(humidityMode.dewPoint.quantity).toBe(quantities.dew_point_tmp);
    expect(humidityMode.wetBulb.quantity).toBe(quantities.wet_bulb_tmp);
    expect(humidityMode.vapourPressure.quantity).toBe(quantities.pa);
  });

  it("enters humidity ratio in the library's kg/kg at full precision", () => {
    expect(humidityMode.humidityRatio.fromRelativeHumidity(50, 25, DEFAULT_ATMOSPHERIC_PRESSURE)).toBeCloseTo(0.0098815997472, 13);
  });

  it("is the identity under relative humidity entry", () => {
    expect(humidityMode.relativeHumidity.toRelativeHumidity(50, 25, DEFAULT_ATMOSPHERIC_PRESSURE)).toBe(50);
    expect(humidityMode.relativeHumidity.fromRelativeHumidity(50, 25, DEFAULT_ATMOSPHERIC_PRESSURE)).toBe(50);
  });
});
