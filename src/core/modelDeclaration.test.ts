/**
 * What a declaration says about itself: the library function it names and the
 * standard edition it picks, checked against the package for every registered
 * model, and the axis range a chart reads off it. What its `run` does is the
 * sibling `modelDeclarationRun.test.ts`'s.
 */
import { describe, expect, it } from "vitest";
import * as library from "jsthermalcomfort";
import { registeredModels } from "$lib/models";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { axisRangeFor, requireAxisRange } from "./modelDeclaration";
import { quantities } from "./quantities";

const q = quantities;

/**
 * The package's exports, by name. Reading them needs a namespace import, which
 * defeats tree-shaking, so no runtime code may do this (ADR-0002 decision 30,
 * "No runtime reverse lookup") — a test is not bundled, which is why the one
 * check that a name is really the library's lives here.
 */
const libraryExports: Record<string, unknown> = library;

describe("name", () => {
  it("is a function the package exports, for every registered model", () => {
    for (const model of registeredModels) {
      expect(typeof libraryExports[model.name], model.name).toBe("function");
    }
  });

  it("names the very model info the declaration carries, for every registered model", () => {
    for (const model of registeredModels) {
      expect(libraryExports[`${model.name.toUpperCase()}_INFO`], model.name).toBe(model.info);
    }
  });

  it("is unique across the registry, so a share link can name a model without naming its standard", () => {
    const names = registeredModels.map((model) => model.name);
    expect(new Set(names).size, names.join(", ")).toBe(names.length);
  });
});

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
    expect(axisRangeFor(pmvPpdIso, q.tdb)).toEqual({ min: 10, max: 40 });
  });

  it("falls back to the applicability bound when none is declared, but both a min and a max exist", () => {
    const noDeclaredRange = { ...pmvPpdIso, axisRanges: pmvPpdIso.axisRanges.filter((range) => range.quantity !== q.clo) };
    const bound = pmvPpdIso.info.inputs.clo?.applicability;
    expect(bound?.min).toBeDefined();
    expect(bound?.max).toBeDefined();
    expect(axisRangeFor(noDeclaredRange, q.clo)).toEqual({ min: bound?.min, max: bound?.max });
  });

  it("returns undefined when neither a declared range nor a complete applicability bound exists", () => {
    const noDeclaredRange = { ...pmvPpdIso, axisRanges: pmvPpdIso.axisRanges.filter((range) => range.quantity !== q.rh) };
    expect(axisRangeFor(noDeclaredRange, q.rh)).toBeUndefined();
  });
});

describe("requireAxisRange", () => {
  it("returns the same range as axisRangeFor when one exists", () => {
    expect(requireAxisRange(pmvPpdIso, q.tdb)).toEqual(axisRangeFor(pmvPpdIso, q.tdb));
  });

  it("throws naming the model and the quantity when no range can be found", () => {
    const noDeclaredRange = { ...pmvPpdIso, axisRanges: pmvPpdIso.axisRanges.filter((range) => range.quantity !== q.rh) };
    expect(() => requireAxisRange(noDeclaredRange, q.rh)).toThrow(
      `${pmvPpdIso.info.label} declares no axis range for ${q.rh.label}, so it cannot carry an axis`,
    );
  });
});
