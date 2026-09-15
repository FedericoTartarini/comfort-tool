import { Standard } from "jsthermalcomfort";
import { describe, expect, it } from "vitest";
import { pmvIso } from "$lib/models/pmvIso";
import { modelsOf } from "./modelsOf";

const fixtureWithoutStandard = { ...pmvIso, standard: undefined, pathSegment: "fixture-no-standard" };

describe("modelsOf", () => {
  it("returns the models of the given standard, in registry order", () => {
    expect(modelsOf(Standard.iso_7730_2005, [pmvIso, fixtureWithoutStandard])).toEqual([pmvIso]);
  });

  it("returns an empty list for a standard no fixture declares", () => {
    expect(modelsOf(Standard.ashrae_55_2023, [pmvIso, fixtureWithoutStandard])).toEqual([]);
  });
});
