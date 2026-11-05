import { describe, expect, it } from "vitest";
import { Standard } from "jsthermalcomfort";
import { parseStandardKey, standardEntryFor, standards } from "./standard";

describe("standards", () => {
  it("derives a name and a route segment, each with the year, from each Standard key", () => {
    expect(standards).toContainEqual({ id: Standard.ashrae_55_2023, name: "ASHRAE 55:2023", routeSegment: "ashrae-55-2023" });
    expect(standards).toContainEqual({ id: Standard.iso_7730_2005, name: "ISO 7730:2005", routeSegment: "iso-7730-2005" });
    expect(standards).toContainEqual({ id: Standard.iso_7730_2025, name: "ISO 7730:2025", routeSegment: "iso-7730-2025" });
    expect(standards).toContainEqual({ id: Standard.iso_9920_2007, name: "ISO 9920:2007", routeSegment: "iso-9920-2007" });
    expect(standards).toContainEqual({ id: Standard.iso_7933_2004, name: "ISO 7933:2004", routeSegment: "iso-7933-2004" });
    expect(standards).toContainEqual({ id: Standard.iso_7933_2023, name: "ISO 7933:2023", routeSegment: "iso-7933-2023" });
  });

  it("names every Standard key with its year, in its name and in its route segment", () => {
    for (const key of Object.keys(Standard) as (keyof typeof Standard)[]) {
      const year = key.slice(-4);
      const { name, routeSegment } = standardEntryFor(Standard[key]);
      expect(name, key).toMatch(new RegExp(`^[A-Z]+ \\d+(-\\d+)?:${year}$`));
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

describe("parseStandardKey", () => {
  it("joins a part to the number with a hyphen, in the name and in the route segment", () => {
    expect(parseStandardKey("en_16798_1_2019")).toEqual({ name: "EN 16798-1:2019", routeSegment: "en-16798-1-2019" });
  });

  it("reads a key with no part as before", () => {
    expect(parseStandardKey("iso_7933_2023")).toEqual({ name: "ISO 7933:2023", routeSegment: "iso-7933-2023" });
  });

  it.each(["iso_7730", "ISO_7730_2005", "iso_7730_2005_extra", "iso__2005", "7730_2005"])("throws on %s, naming it", (key) => {
    expect(() => parseStandardKey(key)).toThrow(`"${key}"`);
  });
});
