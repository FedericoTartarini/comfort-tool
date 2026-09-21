import { describe, expect, it } from "vitest";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { enteredBound, outOfRangeInputs, violationRows } from "./applicability";
import { humidityMode, temperatureMode } from "./entryModes";
import { toLibraryInputs, type SlotInputs } from "./libraryInputs";
import { quantities, type Quantity } from "./quantities";

const q = quantities;

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

describe("enteredBound / outOfRangeInputs", () => {
  it("is empty when every entered value is within the model's bounds", () => {
    expect(outOfRangeInputs(separateSlot(), pmvPpdIso)).toEqual([]);
  });

  it("names the entered quantity that breaks a bound", () => {
    expect(outOfRangeInputs(separateSlot({ tdb: 9 }), pmvPpdIso)).toEqual([q.tdb]);
    expect(outOfRangeInputs(separateSlot({ clo: 2.5 }), pmvPpdIso)).toEqual([q.clo]);
  });

  it("checks an operative entry against every temperature it replaces", () => {
    const bound = enteredBound(pmvPpdIso, q.operative_tmp, temperatureMode.operative);
    expect(bound?.max).toBe(pmvPpdIso.info.inputs.tdb?.applicability?.max);
    expect(outOfRangeInputs(operativeSlot((bound?.max ?? 0) + 1), pmvPpdIso)).toEqual([q.operative_tmp]);
    expect(outOfRangeInputs(operativeSlot(bound?.max ?? 0), pmvPpdIso)).toEqual([]);
  });

  it("has no bound for a quantity the standard does not limit", () => {
    expect(enteredBound(pmvPpdIso, q.rh, temperatureMode.separate)).toBeUndefined();
  });

  it("handles a min-only bound without a max (e.g. Heat Index's tdb)", () => {
    const minOnly = {
      ...pmvPpdIso,
      info: { ...pmvPpdIso.info, inputs: { ...pmvPpdIso.info.inputs, tdb: { unit: "°C", applicability: { min: 15 } } } },
    };
    expect(enteredBound(minOnly, q.tdb, temperatureMode.separate)).toEqual({ min: 15 });
    expect(outOfRangeInputs(separateSlot({ tdb: 10 }), minOnly)).toEqual([q.tdb]);
    expect(outOfRangeInputs(separateSlot({ tdb: 1000 }), minOnly)).toEqual([]);
  });

  it("does not gate a value only a derived row bounds", () => {
    // tdb at the ISO bound, rh 95: no entered value breaks a row; the derived vapour pressure does.
    const slot = separateSlot({ tdb: 30, tr: 30 });
    const humid: SlotInputs = { ...slot, humidity: { mode: humidityMode.rh, value: 95 } };
    expect(outOfRangeInputs(humid, pmvPpdIso)).toEqual([]);
  });
});

describe("violationRows", () => {
  function rowsFor(slot: SlotInputs) {
    return violationRows(pmvPpdIso, pmvPpdIso.run(toLibraryInputs(slot, pmvPpdIso)));
  }

  it("is empty at the model's defaults", () => {
    expect(rowsFor(separateSlot())).toEqual([]);
  });

  it("maps the kernel's derived vapour-pressure row to pa", () => {
    const slot = separateSlot({ tdb: 30, tr: 30 });
    const humid: SlotInputs = { ...slot, humidity: { mode: humidityMode.rh, value: 95 } };
    const violation = rowsFor(humid).find((row) => row.quantity === q.pa);
    expect(violation?.role).toBe("derived");
    expect(violation?.bound).toEqual(pmvPpdIso.info.derived?.pa?.applicability);
    expect(violation?.value).toBeGreaterThan(violation!.bound.max!);
  });

  it("maps a bounded output the run breaks to its quantity", () => {
    const violation = rowsFor(separateSlot({ tdb: 5, tr: 5, clo: 0.1 })).find((row) => row.quantity === q.pmv);
    expect(violation?.role).toBe("output");
    expect(Math.abs(violation!.value)).toBeGreaterThan(pmvPpdIso.info.outputs.pmv!.applicability!.max!);
  });

  it("reports a relative air speed that breaks the vr bound on the entered v row, without gating it", () => {
    const slot = separateSlot({ v: 1.5 });
    const violation = rowsFor(slot).find((row) => row.quantity === q.v);
    expect(violation?.role).toBe("input");
    expect(violation?.bound).toEqual(pmvPpdIso.info.inputs.vr?.applicability);
    expect(rowsFor(slot).some((row) => row.quantity === q.vr)).toBe(false);
    expect(outOfRangeInputs(slot, pmvPpdIso)).toEqual([]);
  });

  it("keeps every row of a repeated key and drops a key the quantity table lacks", () => {
    const bound = { max: 0.8 };
    const result = {
      warnings: [
        { key: "vr", role: "input", value: 1, bound: { min: 0, max: 2 } },
        { key: "vr", role: "input", value: 1, bound },
        { key: "not_a_quantity", role: "input", value: 1, bound },
      ],
    };
    expect(violationRows(pmvPpdIso, result).map((row) => row.bound)).toEqual([{ min: 0, max: 2 }, bound]);
  });

  it("is empty for a result that carries no warnings", () => {
    expect(violationRows(pmvPpdIso, { pmv: 0 })).toEqual([]);
  });
});
