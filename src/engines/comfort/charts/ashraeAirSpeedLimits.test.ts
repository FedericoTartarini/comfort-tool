import { describe, expect, it } from "vitest";

import {
  clipRelativeAirSpeedWithoutOccupantControl,
  maxRelativeAirSpeedWithoutOccupantControl,
} from "./ashraeAirSpeedLimits";

describe("ASHRAE vel-top air-speed limits", () => {
  it("caps speed at 0.2 m/s below 23 °C", () => {
    expect(maxRelativeAirSpeedWithoutOccupantControl(22.9)).toBe(0.2);
    expect(clipRelativeAirSpeedWithoutOccupantControl(20, 1.2)).toBe(0.2);
  });

  it("caps speed at 0.8 m/s above 25.5 °C", () => {
    expect(maxRelativeAirSpeedWithoutOccupantControl(26)).toBe(0.8);
    expect(clipRelativeAirSpeedWithoutOccupantControl(30, 1.4)).toBe(0.8);
  });

  it("uses the CBE quadratic between 23 °C and 25.5 °C, never above 0.8", () => {
    const at24 = maxRelativeAirSpeedWithoutOccupantControl(24);
    const quadratic = 50.49 - 4.4047 * 24 + 0.096425 * 24 * 24;
    expect(at24).toBeCloseTo(Math.min(0.8, quadratic), 10);
    expect(at24).toBeGreaterThan(0.2);
    expect(at24).toBeLessThanOrEqual(0.8);
    expect(clipRelativeAirSpeedWithoutOccupantControl(24, 0.15)).toBe(0.15);
  });
});
