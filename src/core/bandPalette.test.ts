import { describe, expect, it } from "vitest";
import { isoThermalSensation } from "jsthermalcomfort/reference";
import { colorForBand, sensationPalette } from "./bandPalette";

describe("colorForBand", () => {
  it("colours by band position in the scale", () => {
    expect(colorForBand(isoThermalSensation, 0)).toBe(sensationPalette[3]);
    expect(colorForBand(isoThermalSensation, -3)).toBe(sensationPalette[0]);
    expect(colorForBand(isoThermalSensation, 2.7)).toBe(sensationPalette[6]);
  });

  it("returns nothing when the scale does not classify the value", () => {
    expect(colorForBand(isoThermalSensation, Number.NaN)).toBeUndefined();
    expect(colorForBand(isoThermalSensation, 50)).toBeUndefined();
  });
});
