import { describe, expect, it } from "vitest";

import { FieldKey } from "./fieldKeys";
import {
  findBandForValue,
  findNumericBandIndexForValue,
  resolveBandEdge,
  type BandInputsSi,
  type NumericBand,
} from "./modelCapabilities";

function createInputsSi(): BandInputsSi {
  return Object.fromEntries(
    Object.values(FieldKey).map((fieldKey) => [fieldKey, 0]),
  ) as Record<(typeof FieldKey)[keyof typeof FieldKey], number>;
}

function createBand(min: number, max: number, label: string): NumericBand {
  return { min, max, label, color: "#000000" };
}

describe("model capability band helpers", () => {
  it("resolves numeric and canonical-SI functional edges", () => {
    const inputsSi = {
      ...createInputsSi(),
      [FieldKey.RelativeAirSpeed]: 0.2,
    };

    expect(resolveBandEdge(10, 20, inputsSi)).toBe(10);
    expect(resolveBandEdge(
      (xValueSi, currentInputsSi) => (
        xValueSi + Number(currentInputsSi[FieldKey.RelativeAirSpeed])
      ),
      20,
      inputsSi,
    )).toBe(20.2);
  });

  it("returns the first array-ordered half-open match", () => {
    const inputsSi = createInputsSi();
    const lower = createBand(0, 1, "Lower");
    const upper = createBand(1, 2, "Upper");
    const overlap = createBand(0.5, 1.5, "Overlap");

    expect(findBandForValue([lower, upper], 1, 0, inputsSi)).toBe(upper);
    expect(findBandForValue([overlap, upper], 1.25, 0, inputsSi)).toBe(overlap);
  });

  it("returns undefined for NaN, gaps, and values outside all bands", () => {
    const inputsSi = createInputsSi();
    const bands = [
      createBand(0, 1, "Lower"),
      createBand(2, 3, "Upper"),
    ];

    expect(findBandForValue(bands, Number.NaN, 0, inputsSi)).toBeUndefined();
    expect(findBandForValue(bands, 1.5, 0, inputsSi)).toBeUndefined();
    expect(findBandForValue(bands, 3, 0, inputsSi)).toBeUndefined();
  });

  it("assigns numeric bands at shared edges and infinities", () => {
    const bands = [
      createBand(-Infinity, 0, "Lower"),
      createBand(0, Infinity, "Upper"),
    ];

    expect(findNumericBandIndexForValue(bands, -Infinity)).toBe(0);
    expect(findNumericBandIndexForValue(bands, 0)).toBe(1);
    expect(findNumericBandIndexForValue(bands, Infinity)).toBeUndefined();
    expect(findNumericBandIndexForValue(bands, NaN)).toBeUndefined();
  });
});
