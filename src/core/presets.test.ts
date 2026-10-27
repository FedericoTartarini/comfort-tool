import { clo_typical_ensembles, met_typical_tasks } from "jsthermalcomfort";
import { describe, expect, it } from "vitest";
import { presetsFor } from "./presets";
import { quantities } from "./quantities";

describe("presetsFor", () => {
  it("returns met's presets with the library's own labels, values and order", () => {
    const presets = presetsFor(quantities.met);
    const expected = Object.entries(met_typical_tasks);
    expect(presets).toHaveLength(expected.length);
    expect(presets?.map((preset) => [preset.label, preset.value])).toEqual(expected);
  });

  it("returns clo's presets with the library's own labels, values and order", () => {
    const presets = presetsFor(quantities.clo);
    const expected = Object.entries(clo_typical_ensembles);
    expect(presets).toHaveLength(expected.length);
    expect(presets?.map((preset) => [preset.label, preset.value])).toEqual(expected);
  });

  it("is undefined for a quantity with no presets", () => {
    expect(presetsFor(quantities.tdb)).toBeUndefined();
  });
});
