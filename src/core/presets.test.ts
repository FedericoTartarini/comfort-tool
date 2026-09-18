import { clo_typical_ensembles, met_typical_tasks } from "jsthermalcomfort";
import { describe, expect, it } from "vitest";
import { matchingPreset, presetsFor } from "./presets";
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

describe("matchingPreset", () => {
  it("finds the met preset whose value formats the same as the given value", () => {
    const [label, value] = Object.entries(met_typical_tasks).find(([, met]) => met === 1.0)!;
    expect(matchingPreset(quantities.met, value)).toEqual({ label, value });
  });

  it("is undefined when no preset's value formats the same as the given value", () => {
    expect(matchingPreset(quantities.met, 1.01)).toBeUndefined();
  });
});
