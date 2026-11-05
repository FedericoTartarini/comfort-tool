import { describe, expect, it } from "vitest";
import { PMV_PPD_ASHRAE_INFO, PMV_PPD_ISO_INFO } from "jsthermalcomfort";
import { copy } from "$lib/text/copy";
import { categoryZones, intervalZone } from "./comfortZones";
import { classifierOf } from "./modelDeclaration";
import { quantities } from "./quantities";

// Expected values are read off the library's own objects, never written as
// numbers: the limits and the category labels are the library's.
const bins = classifierOf(PMV_PPD_ISO_INFO, quantities.category);

describe("categoryZones", () => {
  it("names one zone per bin below the sentinel edge, from the bin's label and upper edge", () => {
    expect(categoryZones(bins)).toEqual([
      { label: copy.categoryZone(bins.labels[0]), limit: bins.edges[0], inclusive: bins.right },
      { label: copy.categoryZone(bins.labels[1]), limit: bins.edges[1], inclusive: bins.right },
      { label: copy.categoryZone(bins.labels[2]), limit: bins.edges[2], inclusive: bins.right },
      { label: copy.categoryZone(bins.labels[3]), limit: bins.edges[3], inclusive: bins.right },
    ]);
  });

  it("keeps a right-inclusive classifier's edge inside its zone, as numpy's digitize does", () => {
    const [zone] = categoryZones({ edges: [0.5, 10], labels: ["in", "out"], right: true });
    expect(zone.inclusive).toBe(true);
  });

  it("refuses bins with no edge below the sentinel", () => {
    expect(() => categoryZones({ edges: [10], labels: ["A", "none"], right: false })).toThrow("|PMV|");
  });

  it("refuses an output with no classifier", () => {
    expect(() => categoryZones(undefined)).toThrow("|PMV|");
  });
});

describe("intervalZone", () => {
  it("names one zone at a symmetric interval's upper end", () => {
    expect(intervalZone(copy.comfortZone, PMV_PPD_ASHRAE_INFO.outputs.compliance.interval)).toEqual({
      label: copy.comfortZone,
      limit: PMV_PPD_ASHRAE_INFO.outputs.compliance.interval.max,
      // The library's interval excludes both ends.
      inclusive: false,
    });
  });

  it("refuses an interval that is not symmetric about zero", () => {
    expect(() => intervalZone(copy.comfortZone, { min: -0.5, max: 0.7 })).toThrow("symmetric");
  });
});
