import { describe, expect, it } from "vitest";
import { Standard } from "jsthermalcomfort";
import { pathSegmentFor, standardFromPath, standards } from "./standard";

describe("standards", () => {
  it("derives a display name, edition year and path segment from each Standard key", () => {
    expect(standards).toContainEqual({
      id: Standard.iso_7730_2005,
      displayName: "ISO 7730",
      year: "2005",
      pathSegment: "iso-7730",
    });
    expect(standards).toContainEqual({
      id: Standard.ashrae_55_2023,
      displayName: "ASHRAE 55",
      year: "2023",
      pathSegment: "ashrae-55",
    });
  });

  it("preserves Standard's own key order", () => {
    expect(standards.map((entry) => entry.id)).toEqual(Object.values(Standard));
  });
});

describe("pathSegmentFor / standardFromPath", () => {
  it("round-trips a standard through its path segment", () => {
    expect(standardFromPath(pathSegmentFor(Standard.iso_7730_2005))).toBe(Standard.iso_7730_2005);
    expect(standardFromPath(pathSegmentFor(Standard.ashrae_55_2023))).toBe(Standard.ashrae_55_2023);
  });

  it("returns undefined for a segment no standard names", () => {
    expect(standardFromPath("not-a-standard")).toBeUndefined();
  });
});
