import { Standard } from "jsthermalcomfort";
import { describe, expect, it } from "vitest";
import { page } from "$lib/core/page";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { registeredModels } from "$lib/models";
import {
  exploreSegmentsOf,
  isCurrentLink,
  modelByExploreSegment,
  modelBySegment,
  modelChoicesOn,
  modelsOf,
  routeSegmentsOf,
  standardLinks,
  standardModels,
  toRouteSegment,
} from "./routeModels";

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

describe("exploreSegmentsOf", () => {
  it("names the model alone, keyed as the Explore route's params", () => {
    expect(exploreSegmentsOf(pmvPpdIso)).toEqual({ model: "pmv-ppd-iso" });
  });

  it("names a model with no standard, which has an Explore page", () => {
    expect(exploreSegmentsOf(fixtureWithoutStandard)).toEqual({ model: "fixture-no-standard" });
  });
});

describe("modelByExploreSegment", () => {
  it("finds a model with no standard, which no Standard segments find", () => {
    const segments = exploreSegmentsOf(fixtureWithoutStandard);
    expect(modelByExploreSegment(segments.model, fixtures)).toBe(fixtureWithoutStandard);
  });

  it("returns nothing for a segment no model declares, or none", () => {
    expect(modelByExploreSegment("no-such-model", fixtures)).toBeUndefined();
    expect(modelByExploreSegment(undefined, fixtures)).toBeUndefined();
  });

  it("round-trips every registered model through its own Explore segments", () => {
    for (const model of registeredModels) {
      expect(modelByExploreSegment(exploreSegmentsOf(model).model), model.info.label).toBe(model);
    }
  });
});

describe("standardLinks", () => {
  it("gives each standard with a model one link, in the app's order, to its first registered model on the Standard page", () => {
    expect(standardLinks().map(({ standard, address }) => [standard.displayName, address.page, address.model])).toEqual([
      ["ASHRAE 55", page.standard, pmvPpdAshrae],
      ["ISO 7730", page.standard, pmvPpdIso],
    ]);
  });

  it("keeps the app's order whatever the registry's", () => {
    expect(standardLinks([pmvPpdIso, pmvPpdAshrae]).map(({ address }) => address.model)).toEqual([pmvPpdAshrae, pmvPpdIso]);
  });

  it("opens the standard's model registered first", () => {
    expect(standardLinks([adaptiveAshrae, pmvPpdIso, pmvPpdAshrae]).map(({ address }) => address.model)).toEqual([
      adaptiveAshrae,
      pmvPpdIso,
    ]);
  });

  it("gives no link to a standard the app's table does not list, though a model has it", () => {
    expect(standardLinks([fixtureIso2005, pmvPpdIso, adaptiveAshrae]).map(({ address }) => address.model)).toEqual([
      adaptiveAshrae,
      pmvPpdIso,
    ]);
  });

  it("gives no link to a listed standard no model has", () => {
    expect(standardLinks([pmvPpdIso]).map(({ address }) => address.model)).toEqual([pmvPpdIso]);
  });

  it("gives a model with no standard no link", () => {
    expect(standardLinks([fixtureWithoutStandard])).toEqual([]);
  });
});

describe("modelChoicesOn", () => {
  it("offers the standard's models on the Standard page, in registry order", () => {
    expect(modelChoicesOn({ page: page.standard, model: adaptiveAshrae })).toEqual([pmvPpdAshrae, adaptiveAshrae]);
    expect(modelChoicesOn({ page: page.standard, model: pmvPpdIso })).toEqual([pmvPpdIso]);
  });

  it("offers every registered model on Explore, flat and in registry order, Heat Index among them", () => {
    for (const model of registeredModels) {
      expect(modelChoicesOn({ page: page.explore, model })).toEqual(registeredModels);
    }
    expect(modelChoicesOn({ page: page.explore, model: pmvPpdIso })).toContain(heatIndexRothfusz);
  });
});

describe("isCurrentLink", () => {
  const [ashraeLink, isoLink] = standardLinks().map(({ address }) => address);

  it("marks a standard's link current on any of that standard's models on the Standard page", () => {
    for (const model of [pmvPpdAshrae, adaptiveAshrae]) {
      expect(isCurrentLink(ashraeLink, { page: page.standard, model }), model.info.label).toBe(true);
      expect(isCurrentLink(isoLink, { page: page.standard, model }), model.info.label).toBe(false);
    }
  });

  it("marks no standard's link current on Explore, and the Explore link there alone, a model with no standard included", () => {
    for (const model of [pmvPpdAshrae, heatIndexRothfusz]) {
      const onExplore = { page: page.explore, model };
      expect(isCurrentLink(ashraeLink, onExplore)).toBe(false);
      expect(isCurrentLink(onExplore, onExplore)).toBe(true);
    }
    expect(isCurrentLink({ page: page.explore, model: pmvPpdAshrae }, { page: page.standard, model: pmvPpdAshrae })).toBe(
      false,
    );
  });
});
