import { describe, expect, it } from "vitest";

import { ThermalZone } from "../../catalog/thermalZone";
import { requireThermalZone } from "./helpers";

const lower = new ThermalZone({
  label: "Lower",
  min: -1,
  max: 0,
  color: "#0000ff",
});
const upper = new ThermalZone({
  label: "Upper",
  min: 0,
  max: 1,
  color: "#ff0000",
});

describe("requireThermalZone", () => {
  it("uses array order and half-open finite boundaries", () => {
    const overlapping = new ThermalZone({
      label: "Overlapping",
      min: -0.5,
      max: 0.5,
      color: "#ffffff",
    });

    expect(requireThermalZone([lower, upper], -1, "Test")).toBe(lower);
    expect(requireThermalZone([lower, upper], 0, "Test")).toBe(upper);
    expect(requireThermalZone([overlapping, upper], 0.25, "Test"))
      .toBe(overlapping);
  });

  it.each([Number.NaN, Infinity, -Infinity])(
    "rejects the non-finite value %s",
    (value) => {
      expect(() => requireThermalZone([lower, upper], value, "Test model"))
        .toThrow(/Test model.*non-finite/i);
    },
  );

  it("rejects a finite value that matches no declared zone", () => {
    expect(() => requireThermalZone([lower, upper], 1, "Test model"))
      .toThrow(/does not match any declared thermal zone/i);
  });
});
