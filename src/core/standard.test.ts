import { describe, expect, it } from "vitest";
import { Standard } from "jsthermalcomfort";
import { standards } from "./standard";

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
