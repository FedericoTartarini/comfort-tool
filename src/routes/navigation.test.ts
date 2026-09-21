import { Standard } from "jsthermalcomfort";
import { describe, expect, it } from "vitest";
import { registeredModels } from "$lib/models";
import { pmvIso } from "$lib/models/pmvIso";
import { modelBySegment, modelsOf } from "./modelsOf";

const fixtureWithoutStandard = { ...pmvIso, standard: undefined, pathSegment: "fixture-no-standard" };

describe("modelsOf", () => {
  it("returns the models of the given standard, in registry order", () => {
    expect(modelsOf(Standard.iso_7730_2005, [pmvIso, fixtureWithoutStandard])).toEqual([pmvIso]);
  });

  it("returns an empty list for a standard no fixture declares", () => {
    expect(modelsOf(Standard.ashrae_55_2023, [pmvIso, fixtureWithoutStandard])).toEqual([]);
  });
});

describe("modelBySegment", () => {
  it("returns the model the standard and the route segment name", () => {
    expect(modelBySegment(Standard.iso_7730_2005, pmvIso.pathSegment, [pmvIso, fixtureWithoutStandard])).toBe(pmvIso);
  });

  it("returns nothing for a segment no model of that standard declares", () => {
    expect(modelBySegment(Standard.iso_7730_2005, "no-such-model", [pmvIso, fixtureWithoutStandard])).toBeUndefined();
  });

  it("returns nothing for a segment of another standard", () => {
    expect(modelBySegment(Standard.ashrae_55_2023, pmvIso.pathSegment, [pmvIso, fixtureWithoutStandard])).toBeUndefined();
  });

  it("never returns a standard-less model, whatever the URL names", () => {
    expect(
      modelBySegment(undefined, fixtureWithoutStandard.pathSegment, [pmvIso, fixtureWithoutStandard]),
    ).toBeUndefined();
  });

  it("round-trips every registered model that has a standard through its own segment", () => {
    const withStandard = registeredModels.filter((model) => model.standard !== undefined);
    expect(withStandard.length).toBeGreaterThan(0);
    for (const model of withStandard) {
      expect(modelBySegment(model.standard, model.pathSegment)).toBe(model);
    }
  });
});
