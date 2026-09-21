import { Standard } from "jsthermalcomfort";
import { describe, expect, it } from "vitest";
import { registeredModels } from "$lib/models";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { modelBySegment, modelsOf, toRouteSegment } from "./modelsOf";

const fixtureWithoutStandard = { ...pmvPpdIso, standard: undefined, name: "fixture_no_standard" };

describe("toRouteSegment", () => {
  it("spells the library's underscores as hyphens", () => {
    expect(toRouteSegment("pmv_ppd_iso")).toBe("pmv-ppd-iso");
  });

  it("leaves a name that has no underscore as it is", () => {
    expect(toRouteSegment("pmv")).toBe("pmv");
  });
});

describe("modelsOf", () => {
  it("returns the models of the given standard, in registry order", () => {
    expect(modelsOf(Standard.iso_7730_2005, [pmvPpdIso, fixtureWithoutStandard])).toEqual([pmvPpdIso]);
  });

  it("returns an empty list for a standard no fixture declares", () => {
    expect(modelsOf(Standard.ashrae_55_2023, [pmvPpdIso, fixtureWithoutStandard])).toEqual([]);
  });
});

describe("modelBySegment", () => {
  it("returns the model the standard and the route segment name", () => {
    expect(
      modelBySegment(Standard.iso_7730_2005, toRouteSegment(pmvPpdIso.name), [pmvPpdIso, fixtureWithoutStandard]),
    ).toBe(pmvPpdIso);
  });

  it("returns nothing for a segment no model of that standard declares", () => {
    expect(
      modelBySegment(Standard.iso_7730_2005, "no-such-model", [pmvPpdIso, fixtureWithoutStandard]),
    ).toBeUndefined();
  });

  it("returns nothing for a segment of another standard", () => {
    expect(
      modelBySegment(Standard.ashrae_55_2023, toRouteSegment(pmvPpdIso.name), [pmvPpdIso, fixtureWithoutStandard]),
    ).toBeUndefined();
  });

  it("never returns a standard-less model, whatever the URL names", () => {
    expect(
      modelBySegment(undefined, toRouteSegment(fixtureWithoutStandard.name), [pmvPpdIso, fixtureWithoutStandard]),
    ).toBeUndefined();
  });

  it("round-trips every registered model that has a standard through its own segment", () => {
    const withStandard = registeredModels.filter((model) => model.standard !== undefined);
    expect(withStandard.length).toBeGreaterThan(0);
    for (const model of withStandard) {
      expect(modelBySegment(model.standard, toRouteSegment(model.name))).toBe(model);
    }
  });
});
