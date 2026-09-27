import { describe, expect, it } from "vitest";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { enteredBound, outOfRangeInputs, violationRows, warningFor } from "./applicability";
import { humidityMode, temperatureMode } from "./entryModes";
import { toLibraryInputs, type SlotInputs } from "./libraryInputs";
import type { RegisteredModel, Values } from "./modelDeclaration";
import { quantities, type Quantity } from "./quantities";
import { unitSystem } from "./unitSystem";

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
    options: new Map(),
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
    options: new Map(),
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

  it("merges rows on one quantity and role into one sentence over the narrowest bound", () => {
    // PMV (ASHRAE 55) with the air-speed control off, at an operative temperature ≤ 23 °C:
    // the no-control rows, and above 2 m/s the fixed 0–2 m/s row too.
    const noControl = (value: number) => [
      { key: "vr", role: "input", value, bound: { max: 0.8 } },
      { key: "vr", role: "input", value, bound: { max: 0.2 } },
    ];
    const below = violationRows(pmvPpdIso, { warnings: noControl(0.9) });
    expect(below).toEqual([{ quantity: q.v, role: "input", value: 0.9, bound: { max: 0.2 } }]);
    expect(below.map((row) => warningFor(row, unitSystem.si))).toEqual(["Air speed must be ≤ 0.2 m/s"]);
    expect(below.map((row) => warningFor(row, unitSystem.ip))).toEqual(["Air speed must be ≤ 39.37 fpm"]);

    const fixed = { key: "vr", role: "input", value: 2.5, bound: { min: 0, max: 2 } };
    const above = violationRows(pmvPpdIso, { warnings: [fixed, ...noControl(2.5)] });
    expect(above).toEqual([{ quantity: q.v, role: "input", value: 2.5, bound: { min: 0, max: 0.2 } }]);
    expect(above.map((row) => warningFor(row, unitSystem.si))).toEqual(["Air speed must be 0 – 0.2 m/s"]);
    expect(above.map((row) => warningFor(row, unitSystem.ip))).toEqual(["Air speed must be 0 – 39.37 fpm"]);
  });

  it("keeps rows on different quantities, or on one quantity in different roles, apart", () => {
    const result = {
      warnings: [
        { key: "vr", role: "input", value: 0.5, bound: { max: 0.2 } },
        { key: "clo", role: "input", value: 2.5, bound: { max: 2 } },
        { key: "pmv", role: "input", value: 3, bound: { max: 2 } },
        { key: "pmv", role: "output", value: 3, bound: { min: -2, max: 2 } },
      ],
    };
    expect(violationRows(pmvPpdIso, result).map(({ quantity, role }) => [quantity, role])).toEqual([
      [q.v, "input"],
      [q.clo, "input"],
      [q.pmv, "input"],
      [q.pmv, "output"],
    ]);
  });

  it("drops a key the quantity table lacks", () => {
    const result = { warnings: [{ key: "not_a_quantity", role: "input", value: 1, bound: { max: 0.8 } }] };
    expect(violationRows(pmvPpdIso, result)).toEqual([]);
  });

  it("throws naming the model for a result that carries no warnings, since every v1 model returns them", () => {
    const stripped = {
      ...pmvPpdIso,
      run: (values: Values) => {
        const { warnings: _, ...rest } = pmvPpdIso.run(values);
        return rest;
      },
    } satisfies RegisteredModel;
    const result = stripped.run(toLibraryInputs(separateSlot(), stripped));
    expect(() => violationRows(stripped, result)).toThrow(`${pmvPpdIso.info.label} returned no applicability rows`);
  });
});
