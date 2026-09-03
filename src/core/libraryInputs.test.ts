import { describe, expect, it } from "vitest";
import { io, v_relative } from "jsthermalcomfort";
import type { Quantity } from "jsthermalcomfort/io";
import { pmvIso } from "$lib/models/pmvIso";
import { humidityMode, temperatureMode } from "./entryModes";
import { enteredRange, outOfRangeInputs, toLibraryInputs, type SlotInputs } from "./libraryInputs";
import { defineModel } from "./modelDeclaration";

const q = io.quantities;

function separateSlot(overrides: Partial<Record<"tdb" | "tr" | "v" | "met" | "clo", number>> = {}): SlotInputs {
  const values = { tdb: 25, tr: 25, v: 0.1, met: 1.1, clo: 0.5, ...overrides };
  return {
    values: new Map<Quantity, number>([
      [q.tdb, values.tdb],
      [q.tr, values.tr],
      [q.v, values.v],
      [q.met, values.met],
      [q.clo, values.clo],
    ]),
    humidity: { mode: humidityMode.rh, value: 50 },
    temperature: { mode: temperatureMode.separate },
  };
}

function operativeSlot(operative: number): SlotInputs {
  return {
    values: new Map<Quantity, number>([
      [q.t_o, operative],
      [q.v, 0.1],
      [q.met, 1.1],
      [q.clo, 0.5],
    ]),
    humidity: { mode: humidityMode.rh, value: 50 },
    temperature: { mode: temperatureMode.operative },
  };
}

describe("toLibraryInputs", () => {
  it("produces exactly the keys the PMV wrapper takes, in SI", () => {
    const init = toLibraryInputs(separateSlot(), pmvIso);
    expect(Object.keys(init).sort()).toEqual(["clo", "limit_inputs", "met", "rh", "tdb", "tr", "units", "vr"]);
    expect(init.units).toBe("SI");
    expect(init.limit_inputs).toBe(false);
    expect(init.rh).toBe(50);
  });

  it("derives vr with the library's v_relative when the model asks for it", () => {
    const init = toLibraryInputs(separateSlot({ v: 0.1, met: 1.1 }), pmvIso);
    expect(init.vr).toBe(v_relative(0.1, 1.1));
    expect(init.vr).toBeGreaterThan(0.1);
  });

  it("passes v through untouched when the model does not", () => {
    const withoutRelative = defineModel({ ...pmvIso, relativeAirSpeed: false });
    const init = toLibraryInputs(separateSlot(), withoutRelative);
    expect(init.v).toBe(0.1);
    expect(init).not.toHaveProperty("vr");
  });

  it("expands operative temperature to tdb = tr", () => {
    const init = toLibraryInputs(operativeSlot(24), pmvIso);
    expect(init.tdb).toBe(24);
    expect(init.tr).toBe(24);
    expect(init).not.toHaveProperty("t_o");
  });

  it("feeds the declared model a finite result end to end", () => {
    const measures = pmvIso.run(toLibraryInputs(separateSlot(), pmvIso)).toMeasures();
    const pmv = measures.find((measure) => measure.quantity === q.pmv);
    expect(pmv).toBeDefined();
    expect(Number.isFinite(pmv?.value)).toBe(true);
    expect(pmv?.category).toBeDefined();
  });
});

describe("outOfRangeInputs", () => {
  it("is empty when every entered value is within the model's limits", () => {
    expect(outOfRangeInputs(separateSlot(), pmvIso)).toEqual([]);
  });

  it("names the entered quantity that breaks a limit", () => {
    expect(outOfRangeInputs(separateSlot({ tdb: 9 }), pmvIso)).toEqual([q.tdb]);
    expect(outOfRangeInputs(separateSlot({ clo: 2.5 }), pmvIso)).toEqual([q.clo]);
  });

  it("checks an operative entry against every temperature it replaces", () => {
    const range = enteredRange(pmvIso, q.t_o, temperatureMode.operative);
    const tdbLimit = pmvIso.model.limits?.find((limit) => limit.quantity === q.tdb);
    expect(range?.max).toBe(tdbLimit?.max);
    expect(outOfRangeInputs(operativeSlot((range?.max ?? 0) + 1), pmvIso)).toEqual([q.t_o]);
    expect(outOfRangeInputs(operativeSlot(range?.max ?? 0), pmvIso)).toEqual([]);
  });

  it("has no range for a quantity the standard does not limit", () => {
    expect(enteredRange(pmvIso, q.rh, temperatureMode.separate)).toBeUndefined();
  });
});
