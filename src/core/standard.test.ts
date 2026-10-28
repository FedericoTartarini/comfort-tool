import { describe, expect, it } from "vitest";
import { Standard } from "jsthermalcomfort";
import { standardEntryFor, standards } from "./standard";

describe("standards", () => {
  it("derives a name and a route segment, each with the year, from each Standard key", () => {
    expect(standards).toContainEqual({ id: Standard.iso_7730_2005, name: "ISO 7730:2005", routeSegment: "iso-7730-2005" });
    expect(standards).toContainEqual({ id: Standard.ashrae_55_2023, name: "ASHRAE 55:2023", routeSegment: "ashrae-55-2023" });
  });

  it("names every Standard key with its year, in its name and in its route segment", () => {
    for (const key of Object.keys(Standard) as (keyof typeof Standard)[]) {
      const year = key.slice(-4);
      const { name, routeSegment } = standardEntryFor(Standard[key]);
      expect(name, key).toMatch(new RegExp(`^[A-Z]+ \\d+:${year}$`));
      expect(routeSegment, key).toBe(key.replace(/_/g, "-"));
    }
  });

  it("gives no two standards one route segment", () => {
    const segments = standards.map((entry) => entry.routeSegment);
    expect(new Set(segments).size).toBe(segments.length);
  });

  it("preserves Standard's own key order", () => {
    expect(standards.map((entry) => entry.id)).toEqual(Object.values(Standard));
  });
});
