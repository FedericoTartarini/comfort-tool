import { Standard } from "jsthermalcomfort";
import { describe, expect, it } from "vitest";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { modelBySegment, modelsOf, routeSegmentsOf, standardModels, toRouteSegment } from "./routeModels";

const fixtureWithoutStandard = {
  ...pmvPpdIso,
  standard: undefined,
  info: { ...pmvPpdIso.info, name: "fixture_no_standard" },
};

// The other edition of pmvPpdIso's standard: both editions share the route
// segment `iso-7730`, because the segment carries no year (ADR-0002 decision 6).
const fixtureIso2005 = {
  ...pmvPpdIso,
  standard: Standard.iso_7730_2005,
  info: { ...pmvPpdIso.info, name: "fixture_iso_2005" },
};

const fixtures = [pmvPpdIso, fixtureWithoutStandard, fixtureIso2005];

describe("toRouteSegment", () => {
  it("spells the library's underscores as hyphens", () => {
    expect(toRouteSegment("pmv_ppd_iso")).toBe("pmv-ppd-iso");
  });

  it("leaves a name that has no underscore as it is", () => {
    expect(toRouteSegment("pmv")).toBe("pmv");
  });
});

describe("routeSegmentsOf", () => {
  it("pairs the standard's route segment with the model's own", () => {
    expect(routeSegmentsOf(pmvPpdIso)).toEqual({ standard: "iso-7730", model: "pmv-ppd-iso" });
  });

  it("throws for a model with no standard, which has no Standard page", () => {
    expect(() => routeSegmentsOf(fixtureWithoutStandard)).toThrow();
  });
});

describe("modelsOf", () => {
  it("returns the models of the given standard, in registry order", () => {
    expect(modelsOf(Standard.iso_7730_2025, [pmvPpdIso, fixtureWithoutStandard])).toEqual([pmvPpdIso]);
  });

  it("returns an empty list for a standard no fixture declares", () => {
    expect(modelsOf(Standard.ashrae_55_2023, [pmvPpdIso, fixtureWithoutStandard])).toEqual([]);
  });
});

describe("modelBySegment", () => {
  it("returns the model the standard's and the model's route segments name", () => {
    expect(modelBySegment("iso-7730", "pmv-ppd-iso", fixtures)).toBe(pmvPpdIso);
  });

  it("finds a model pinned to either edition of a standard by its own address", () => {
    for (const model of [pmvPpdIso, fixtureIso2005]) {
      const segments = routeSegmentsOf(model);
      expect(modelBySegment(segments.standard, segments.model, fixtures)).toBe(model);
    }
  });

  it("returns nothing for a segment no model of that standard declares", () => {
    expect(modelBySegment("iso-7730", "no-such-model", fixtures)).toBeUndefined();
  });

  it("returns nothing for a segment of another standard", () => {
    expect(modelBySegment("ashrae-55", "pmv-ppd-iso", fixtures)).toBeUndefined();
  });

  it("returns nothing for a standard segment no standard names", () => {
    expect(modelBySegment("not-a-standard", "pmv-ppd-iso", fixtures)).toBeUndefined();
    expect(modelBySegment(undefined, "pmv-ppd-iso", fixtures)).toBeUndefined();
  });

  it("never returns a standard-less model, whatever the URL names", () => {
    for (const standardSegment of [undefined, "", "iso-7730"]) {
      expect(modelBySegment(standardSegment, "fixture-no-standard", fixtures)).toBeUndefined();
    }
  });

  it("round-trips every registered model that has a standard through its own segments", () => {
    const withStandard = standardModels();
    expect(withStandard.length).toBeGreaterThan(0);
    for (const model of withStandard) {
      const segments = routeSegmentsOf(model);
      expect(modelBySegment(segments.standard, segments.model)).toBe(model);
    }
  });
});
