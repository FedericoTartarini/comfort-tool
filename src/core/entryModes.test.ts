import { describe, expect, it } from "vitest";
import { quantities } from "jsthermalcomfort/io";
import { humidityMode } from "./entryModes";

describe("humidityMode", () => {
  it("names the library quantity each mode enters", () => {
    expect(humidityMode.rh.quantity).toBe(quantities.rh);
    expect(humidityMode.humidityRatio.quantity).toBe(quantities.hr);
    expect(humidityMode.dewPoint.quantity).toBe(quantities.dew_point_tmp);
    expect(humidityMode.wetBulb.quantity).toBe(quantities.wet_bulb_tmp);
    expect(humidityMode.vapourPressure.quantity).toBe(quantities.p_vap);
  });

  it("is the identity in rh mode", () => {
    expect(humidityMode.rh.toRelativeHumidity(50, 25)).toBe(50);
    expect(humidityMode.rh.fromRelativeHumidity(50, 25)).toBe(50);
  });

  // Round-trip bounds follow the fork's tests/psychrometrics.test.ts: the
  // algebraic inverses are exact, wet bulb carries wet_bulb_tmp's 0.1 °C
  // rounding, dew point carries dew_point_tmp's own approximation error.
  it.each([
    [humidityMode.humidityRatio, 9],
    [humidityMode.vapourPressure, 9],
    [humidityMode.wetBulb, 0],
    [humidityMode.dewPoint, 0],
  ])("round-trips 50 % rh at 25 °C through $id", (mode, digits) => {
    const entered = mode.fromRelativeHumidity(50, 25);
    expect(mode.toRelativeHumidity(entered, 25)).toBeCloseTo(50, digits);
  });
});
