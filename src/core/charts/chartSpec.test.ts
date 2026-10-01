import { describe, expect, it } from "vitest";
import { quantities } from "$lib/core/quantities";
import { axisTitle } from "./chartSpec";

const q = quantities;

describe("axisTitle", () => {
  it("puts the displayed unit in brackets after the label", () => {
    expect(axisTitle(q.tdb, "°C")).toBe("Dry-bulb air temperature (°C)");
    expect(axisTitle(q.tdb, "°F")).toBe("Dry-bulb air temperature (°F)");
  });

  it("gives the label alone for a quantity shown without a unit", () => {
    expect(axisTitle(q.pmv, "")).toBe(q.pmv.label);
  });
});