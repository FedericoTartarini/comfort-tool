import { Standard } from "jsthermalcomfort";
import { describe, expect, it } from "vitest";
import { standardOf, type RegisteredModel } from "$lib/core/modelDeclaration";
import { page } from "$lib/core/page";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { registeredModels } from "$lib/models";
import type { ModelGroup } from "$lib/ui/inputs/ModelSelect.svelte";
import {
  ariaCurrentOf,
  defaultModel,
  exploreSegmentsOf,
  isCurrentLink,
  modelByExploreSegment,
  modelBySegment,
  modelChoicesOn,
  routeSegmentsOf,
  standardLinks,
  standardModels,
  toRouteSegment,
} from "./routeModels";

const fixtureWithoutStandard = {
  ...pmvPpdIso,
  info: { ...pmvPpdIso.info, name: "fixture_no_standard", standards: [] },
};

// pmvPpdIso's body and number in another year: a standard of its own,
// with its own route segment, sidebar link and select group (ADR-0002 decision 86).
const fixtureIso2005 = {
  ...pmvPpdIso,
  info: { ...pmvPpdIso.info, name: "fixture_iso_2005", standards: [Standard.iso_7730_2005] },
};

// A standard no registered model has.
const fixtureIso7933 = {
  ...pmvPpdIso,
  info: { ...pmvPpdIso.info, name: "fixture_iso_7933", standards: [Standard.iso_7933_2023] },
};

const fixtures = [pmvPpdIso, fixtureWithoutStandard, fixtureIso2005];

/** Whether `a` and `b` both have a standard, and it is one standard. */
function shareAStandard(a: RegisteredModel, b: RegisteredModel): boolean {
  const standard = standardOf(a);
  return standard !== undefined && standard === standardOf(b);
}

/** Whether no model without a standard comes before a model with one. */
function hasStandardModelsFirst(models: readonly RegisteredModel[]): boolean {
  return models.every(
    (model, i) => standardOf(model) === undefined || models.slice(0, i).every((earlier) => standardOf(earlier) !== undefined),
  );
}

/** Whether each model of a standard follows another of it, or is the first of its standard. */
function keepsStandardsTogether(models: readonly RegisteredModel[]): boolean {
  return models.every(
    (model, i) =>
      (i > 0 && shareAStandard(model, models[i - 1])) || !models.slice(0, i).some((earlier) => shareAStandard(model, earlier)),
  );
}

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
    expect(routeSegmentsOf(pmvPpdIso)).toEqual({ standard: "iso-7730-2025", model: "pmv-ppd-iso" });
  });

  it("throws for a model with no standard, which has no Standard page", () => {
    expect(() => routeSegmentsOf(fixtureWithoutStandard)).toThrow();
  });
});

describe("modelBySegment", () => {
  it("returns the model the standard's and the model's route segments name", () => {
    expect(modelBySegment("iso-7730-2025", "pmv-ppd-iso", fixtures)).toBe(pmvPpdIso);
  });

  it("finds a model of each of two years of one standard by its own address, and neither by the other's", () => {
    for (const model of [pmvPpdIso, fixtureIso2005]) {
      const segments = routeSegmentsOf(model);
      expect(modelBySegment(segments.standard, segments.model, fixtures)).toBe(model);
    }
    expect(routeSegmentsOf(fixtureIso2005).standard).toBe("iso-7730-2005");
    expect(modelBySegment("iso-7730-2005", "pmv-ppd-iso", fixtures)).toBeUndefined();
  });

  it("returns nothing for a segment no model of that standard declares", () => {
    expect(modelBySegment("iso-7730-2025", "no-such-model", fixtures)).toBeUndefined();
  });

  it("returns nothing for a segment of another standard", () => {
    expect(modelBySegment("ashrae-55-2023", "pmv-ppd-iso", fixtures)).toBeUndefined();
  });

  it("returns nothing for a standard segment no standard names", () => {
    expect(modelBySegment("not-a-standard", "pmv-ppd-iso", fixtures)).toBeUndefined();
    expect(modelBySegment(undefined, "pmv-ppd-iso", fixtures)).toBeUndefined();
  });

  it("returns nothing for an address in the old form, whose standard segment has no year", () => {
    expect(modelBySegment("ashrae-55", "pmv-ppd-ashrae")).toBeUndefined();
    expect(modelBySegment("iso-7730", "pmv-ppd-iso")).toBeUndefined();
  });

  it("never returns a standard-less model, whatever the URL names", () => {
    for (const standardSegment of [undefined, "", "iso-7730-2025"]) {
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
  it("gives each standard with a model one link, in the registry's order, to its first registered model on the Standard page", () => {
    expect(standardLinks().map(({ standard, address }) => [standard.name, address.page, address.model])).toEqual([
      ["ASHRAE 55:2023", page.standard, pmvPpdAshrae],
      ["ISO 7730:2025", page.standard, pmvPpdIso],
    ]);
  });

  it("follows the order the registry first names each standard, whatever the library's key order", () => {
    expect(standardLinks([pmvPpdIso, pmvPpdAshrae]).map(({ address }) => address.model)).toEqual([pmvPpdIso, pmvPpdAshrae]);
  });

  it("opens the standard's model registered first", () => {
    expect(standardLinks([adaptiveAshrae, pmvPpdIso, pmvPpdAshrae]).map(({ address }) => address.model)).toEqual([
      adaptiveAshrae,
      pmvPpdIso,
    ]);
  });

  it("gives two years of one body and number two links, each named with its own year", () => {
    expect(
      standardLinks([fixtureIso2005, pmvPpdIso, adaptiveAshrae]).map(({ standard, address }) => [standard.name, address.model]),
    ).toEqual([
      ["ISO 7730:2005", fixtureIso2005],
      ["ISO 7730:2025", pmvPpdIso],
      ["ASHRAE 55:2023", adaptiveAshrae],
    ]);
  });

  it("gives a standard no other model has its own link", () => {
    expect(standardLinks([pmvPpdAshrae, fixtureIso7933]).map(({ standard, address }) => [standard.name, address.model])).toEqual([
      ["ASHRAE 55:2023", pmvPpdAshrae],
      ["ISO 7933:2023", fixtureIso7933],
    ]);
  });

  it("gives a model with no standard no link", () => {
    expect(standardLinks([fixtureWithoutStandard])).toEqual([]);
  });
});

describe("modelChoicesOn", () => {
  /** Each group as its standard's identifier, or `undefined` for the standard-less group, and its models. */
  function byStandard(groups: readonly ModelGroup[]): [Standard | undefined, readonly RegisteredModel[]][] {
    return groups.map(({ standard, models }) => [standard?.id, models]);
  }

  it("offers one group on the Standard page, the standard's models in registry order", () => {
    expect(byStandard(modelChoicesOn({ page: page.standard, model: adaptiveAshrae }))).toEqual([
      [Standard.ashrae_55_2023, [pmvPpdAshrae, adaptiveAshrae]],
    ]);
    expect(byStandard(modelChoicesOn({ page: page.standard, model: pmvPpdIso }))).toEqual([[Standard.iso_7730_2025, [pmvPpdIso]]]);
  });

  it("offers on the Standard page the open standard's models only, not another year's of its body and number", () => {
    expect(byStandard(modelChoicesOn({ page: page.standard, model: pmvPpdIso }, fixtures))).toEqual([
      [Standard.iso_7730_2025, [pmvPpdIso]],
    ]);
    expect(byStandard(modelChoicesOn({ page: page.standard, model: fixtureIso2005 }, fixtures))).toEqual([
      [Standard.iso_7730_2005, [fixtureIso2005]],
    ]);
  });

  it("offers on Explore one group per standard in the order the registry first names each, the standard-less group last", () => {
    const models = [fixtureWithoutStandard, pmvPpdIso, adaptiveAshrae, fixtureIso2005];
    expect(byStandard(modelChoicesOn({ page: page.explore, model: pmvPpdIso }, models))).toEqual([
      [Standard.iso_7730_2025, [pmvPpdIso]],
      [Standard.ashrae_55_2023, [adaptiveAshrae]],
      [Standard.iso_7730_2005, [fixtureIso2005]],
      [undefined, [fixtureWithoutStandard]],
    ]);
  });

  it("heads the groups of two years of one body and number on Explore each with its own year", () => {
    const groups = modelChoicesOn({ page: page.explore, model: pmvPpdIso }, fixtures);
    expect(groups.map(({ standard }) => standard?.name)).toEqual(["ISO 7730:2025", "ISO 7730:2005", undefined]);
  });

  it("offers on Explore no standard-less group when every model has a standard", () => {
    expect(byStandard(modelChoicesOn({ page: page.explore, model: pmvPpdIso }, [pmvPpdIso]))).toEqual([
      [Standard.iso_7730_2025, [pmvPpdIso]],
    ]);
  });

  it("offers on Explore ASHRAE 55:2023, ISO 7730:2025 and then Heat Index alone, every registered model once in registry order", () => {
    for (const model of registeredModels) {
      const groups = modelChoicesOn({ page: page.explore, model });
      expect(groups.map(({ standard }) => standard?.name)).toEqual(["ASHRAE 55:2023", "ISO 7730:2025", undefined]);
      expect(groups[groups.length - 1].models).toEqual([heatIndexRothfusz]);
      expect(groups.flatMap(({ models }) => models)).toEqual(registeredModels);
    }
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

  it("marks a standard's link current on its own model and not on another year's of its body and number", () => {
    const [iso2025Link, iso2005Link] = standardLinks(fixtures).map(({ address }) => address);
    expect(isCurrentLink(iso2025Link, { page: page.standard, model: pmvPpdIso })).toBe(true);
    expect(isCurrentLink(iso2005Link, { page: page.standard, model: pmvPpdIso })).toBe(false);
    expect(isCurrentLink(iso2005Link, { page: page.standard, model: fixtureIso2005 })).toBe(true);
    expect(isCurrentLink(iso2025Link, { page: page.standard, model: fixtureIso2005 })).toBe(false);
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

describe("ariaCurrentOf", () => {
  const [ashraeLink, isoLink] = standardLinks().map(({ address }) => address);

  it("is page for the link at the session's address, on both pages", () => {
    expect(ariaCurrentOf(ashraeLink, ashraeLink)).toBe("page");
    for (const model of [pmvPpdAshrae, heatIndexRothfusz]) {
      const onExplore = { page: page.explore, model };
      expect(ariaCurrentOf(onExplore, onExplore), model.info.label).toBe("page");
    }
  });

  it("is true for a standard's link while on another of its models", () => {
    expect(ariaCurrentOf(ashraeLink, { page: page.standard, model: adaptiveAshrae })).toBe("true");
  });

  it("is absent for a link that is not current, on both pages", () => {
    for (const address of [
      { page: page.standard, model: adaptiveAshrae },
      { page: page.explore, model: pmvPpdAshrae },
    ]) {
      expect(ariaCurrentOf(isoLink, address)).toBeUndefined();
    }
    expect(ariaCurrentOf(ashraeLink, { page: page.explore, model: pmvPpdAshrae })).toBeUndefined();
    expect(
      ariaCurrentOf({ page: page.explore, model: pmvPpdAshrae }, { page: page.standard, model: pmvPpdAshrae }),
    ).toBeUndefined();
  });
});

describe("defaultModel", () => {
  it("is PMV (ASHRAE 55), the first registered model with a standard", () => {
    expect(defaultModel()).toBe(pmvPpdAshrae);
  });
});

describe("the registry's order", () => {
  it("puts every model with a standard before every model without one", () => {
    expect(hasStandardModelsFirst(registeredModels)).toBe(true);
    expect(hasStandardModelsFirst([pmvPpdAshrae, heatIndexRothfusz, pmvPpdIso])).toBe(false);
  });

  it("keeps the models of one standard together", () => {
    expect(keepsStandardsTogether(registeredModels)).toBe(true);
    expect(keepsStandardsTogether([pmvPpdAshrae, pmvPpdIso, adaptiveAshrae])).toBe(false);
    expect(keepsStandardsTogether([pmvPpdAshrae, pmvPpdIso, fixtureIso2005, heatIndexRothfusz])).toBe(true);
  });
});
