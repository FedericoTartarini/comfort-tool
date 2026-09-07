import { describe, expect, it } from "vitest";
import { io, v_relative } from "jsthermalcomfort";
import type { PmvPpdIsoOutputs, Quantity } from "jsthermalcomfort/io";
import { pmvIso } from "$lib/models/pmvIso";
import { humidityMode, temperatureMode } from "./entryModes";
import {
  enteredQuantities,
  enteredRange,
  enteredValue,
  outOfRangeInputs,
  toLibraryInputs,
  withEnteredValues,
  type SlotInputs,
} from "./libraryInputs";
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
      [q.operative_tmp, operative],
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
    expect(init).not.toHaveProperty("operative_tmp");
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
    const range = enteredRange(pmvIso, q.operative_tmp, temperatureMode.operative);
    const tdbLimit = pmvIso.model.limits?.find((limit) => limit.quantity === q.tdb);
    expect(range?.max).toBe(tdbLimit?.max);
    expect(outOfRangeInputs(operativeSlot((range?.max ?? 0) + 1), pmvIso)).toEqual([q.operative_tmp]);
    expect(outOfRangeInputs(operativeSlot(range?.max ?? 0), pmvIso)).toEqual([]);
  });

  it("has no range for a quantity the standard does not limit", () => {
    expect(enteredRange(pmvIso, q.rh, temperatureMode.separate)).toBeUndefined();
  });

  it("does not gate a value only a derived row bounds", () => {
    // tdb at the ISO bound, rh 95: no entered value breaks a row; the derived vapour pressure does (Task 5 pins that).
    const slot = separateSlot({ tdb: 30, tr: 30 });
    const humid: SlotInputs = { ...slot, humidity: { mode: humidityMode.rh, value: 95 } };
    expect(outOfRangeInputs(humid, pmvIso)).toEqual([]);
  });
});

describe("entered values", () => {
  it("reads the humidity entry from where the slot keeps it", () => {
    expect(enteredValue(separateSlot(), q.rh)).toBe(50);
    expect(enteredValue(separateSlot({ tdb: 27 }), q.tdb)).toBe(27);
    expect(enteredValue(separateSlot(), q.vr)).toBeUndefined();
  });

  it("lists the panel rows of the current temperature mode", () => {
    expect(enteredQuantities(pmvIso, temperatureMode.separate)).toEqual([q.tdb, q.tr, q.v, q.rh, q.met, q.clo]);
    expect(enteredQuantities(pmvIso, temperatureMode.operative)).toEqual([q.operative_tmp, q.v, q.rh, q.met, q.clo]);
  });

  it("re-derives everything downstream of a swept value", () => {
    const swept = withEnteredValues(separateSlot(), new Map([[q.v, 0.6]]));
    expect(toLibraryInputs(swept, pmvIso).vr).toBe(v_relative(0.6, 1.1));
    expect(separateSlot().values.get(q.v)).toBe(0.1);
  });

  it("sweeps the humidity entry as well, without touching the original", () => {
    const slot = separateSlot();
    const swept = withEnteredValues(slot, new Map([[q.rh, 80]]));
    expect(toLibraryInputs(swept, pmvIso).rh).toBe(80);
    expect(slot.humidity.value).toBe(50);
  });

  it("expands a swept operative temperature to both temperatures", () => {
    const swept = withEnteredValues(operativeSlot(24), new Map([[q.operative_tmp, 28]]));
    const init = toLibraryInputs(swept, pmvIso);
    expect(init.tdb).toBe(28);
    expect(init.tr).toBe(28);
  });
});

describe("edition", () => {
  it("pins ISO 7730:2005 and the library echoes it", () => {
    expect(pmvIso.edition).toBe("7730-2005");
    const outcome = pmvIso.run(toLibraryInputs(separateSlot(), pmvIso)) as PmvPpdIsoOutputs;
    expect(outcome.edition).toBe(pmvIso.edition);
  });
});
