import { describe, expect, it } from "vitest";

import { FieldKey } from "./fieldKeys";
import {
  findNumericBandIndexForValue,
  resolveBandEdge,
  type BandInputsSi,
  type NumericBand,
} from "./modelCapabilities";

function createBand(min: number, max: number, label: string): NumericBand {
  return { min, max, label, color: "#000000" };
}

describe("model capability band helpers", () => {
  it("resolves numeric and canonical-SI functional edges", () => {
    const inputsSi: BandInputsSi = {
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
