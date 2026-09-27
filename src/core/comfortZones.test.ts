import { describe, expect, it } from "vitest";
import { PMV_CATEGORY_BINS_ISO, PMV_COMPLIANCE_INTERVAL_ASHRAE } from "jsthermalcomfort";
import { copy } from "$lib/text/copy";
import { categoryZones, intervalZone } from "./comfortZones";

// Expected values are read off the library's own objects, never written as
// numbers: the limits and the category labels are the library's.
const bins = PMV_CATEGORY_BINS_ISO;

describe("categoryZones", () => {
  it("names one zone per bin below the sentinel edge, from the bin's label and upper edge", () => {
    expect(categoryZones(bins)).toEqual([
      { label: copy.categoryZone(bins.labels[0]), limit: bins.edges[0], inclusive: bins.right },
      { label: copy.categoryZone(bins.labels[1]), limit: bins.edges[1], inclusive: bins.right },
      { label: copy.categoryZone(bins.labels[2]), limit: bins.edges[2], inclusive: bins.right },
    ]);
  });

  it("keeps a right-inclusive classifier's edge inside its zone, as numpy's digitize does", () => {
    const [zone] = categoryZones({ edges: [0.5, 10], labels: ["in", "out"], right: true });
    expect(zone.inclusive).toBe(true);
  });

  it("refuses bins with no edge below the sentinel", () => {
    expect(() => categoryZones({ edges: [10], labels: ["A", "none"], right: false })).toThrow("|PMV|");
  });
});

describe("intervalZone", () => {
  it("names one zone at a symmetric interval's upper end", () => {
    expect(intervalZone(copy.comfortZone, PMV_COMPLIANCE_INTERVAL_ASHRAE)).toEqual({
      label: copy.comfortZone,
      limit: PMV_COMPLIANCE_INTERVAL_ASHRAE.max,
      // pythermalcomfort's compliance is strict at both ends.
      inclusive: false,
    });
  });

  it("refuses an interval that is not symmetric about zero", () => {
    expect(() => intervalZone(copy.comfortZone, { min: -0.5, max: 0.7 })).toThrow("symmetric");
    expect(() => intervalZone(copy.comfortZone, { max: 0.5 })).toThrow("symmetric");
  });
});
