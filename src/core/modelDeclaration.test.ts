import { describe, expect, it } from "vitest";
import { registeredModels } from "$lib/models";
import { pmvIso } from "$lib/models/pmvIso";
import { axisRangeFor, requireAxisRange } from "./modelDeclaration";
import { quantities } from "./quantities";

const q = quantities;

describe("standard", () => {
  it("is one of the editions the model's library function accepts, for every registered model", () => {
    for (const model of registeredModels) {
      if (model.standard === undefined) continue;
      expect(model.info.standards, model.info.label).toContain(model.standard);
    }
  });
});

describe("axisRangeFor", () => {
  it("returns the declared range when the model has one", () => {
    expect(axisRangeFor(pmvIso, q.tdb)).toEqual({ min: 10, max: 40 });
  });

  it("falls back to the applicability bound when none is declared, but both a min and a max exist", () => {
    const noDeclaredRange = { ...pmvIso, axisRanges: pmvIso.axisRanges.filter((range) => range.quantity !== q.clo) };
    const bound = pmvIso.info.inputs.clo?.applicability;
    expect(bound?.min).toBeDefined();
    expect(bound?.max).toBeDefined();
    expect(axisRangeFor(noDeclaredRange, q.clo)).toEqual({ min: bound?.min, max: bound?.max });
  });

  it("returns undefined when neither a declared range nor a complete applicability bound exists", () => {
    const noDeclaredRange = { ...pmvIso, axisRanges: pmvIso.axisRanges.filter((range) => range.quantity !== q.rh) };
    expect(axisRangeFor(noDeclaredRange, q.rh)).toBeUndefined();
  });
});

describe("requireAxisRange", () => {
  it("returns the same range as axisRangeFor when one exists", () => {
    expect(requireAxisRange(pmvIso, q.tdb)).toEqual(axisRangeFor(pmvIso, q.tdb));
  });

  it("throws naming the model and the quantity when no range can be found", () => {
    const noDeclaredRange = { ...pmvIso, axisRanges: pmvIso.axisRanges.filter((range) => range.quantity !== q.rh) };
    expect(() => requireAxisRange(noDeclaredRange, q.rh)).toThrow(
      `${pmvIso.info.label} declares no axis range for ${q.rh.label}, so it cannot carry an axis`,
    );
  });
});
