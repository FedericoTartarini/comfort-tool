import { describe, expect, it } from "vitest";
import { Standard } from "jsthermalcomfort";
import { isSameStandard, standards } from "./standard";

describe("standards", () => {
  it("derives a display name, edition year and route segment from each Standard key", () => {
    expect(standards).toContainEqual({
      id: Standard.iso_7730_2005,
      displayName: "ISO 7730",
      year: "2005",
      routeSegment: "iso-7730",
    });
    expect(standards).toContainEqual({
      id: Standard.ashrae_55_2023,
      displayName: "ASHRAE 55",
      year: "2023",
      routeSegment: "ashrae-55",
    });
  });

  it("preserves Standard's own key order", () => {
    expect(standards.map((entry) => entry.id)).toEqual(Object.values(Standard));
  });
});

describe("isSameStandard", () => {
  it("is true for two editions of one standard", () => {
    expect(isSameStandard(Standard.iso_7730_2005, Standard.iso_7730_2025)).toBe(true);
  });

  it("is false for two standards of one body, and for two bodies", () => {
    expect(isSameStandard(Standard.iso_7730_2025, Standard.iso_7933_2023)).toBe(false);
    expect(isSameStandard(Standard.iso_7730_2025, Standard.ashrae_55_2023)).toBe(false);
  });

  it("agrees with the route segment for every pair of standards the library names", () => {
    for (const a of standards) {
      for (const b of standards) {
        expect(isSameStandard(a.id, b.id), `${a.id} against ${b.id}`).toBe(a.routeSegment === b.routeSegment);
      }
    }
  });
});
