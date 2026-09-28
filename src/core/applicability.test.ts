import { psy_ta_rh } from "jsthermalcomfort";
import { describe, expect, it } from "vitest";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { copy } from "$lib/text/copy";
import { enteredBound, outOfRangeInputs, splitViolations, violationRows, warningFor } from "./applicability";
import { defaultSlot, enteredSlotFor } from "./declarationTestSlots";
import { humidityMode, type HumidityMode } from "./entryModes";
import type { SlotInputs } from "./libraryInputs";
import type { RegisteredModel, Values } from "./modelDeclaration";
import { runOn } from "./modelRun";
import { quantities } from "./quantities";
import { displayUnitFor, valueWithUnit } from "./units";
import { unitSystem, type UnitSystem } from "./unitSystem";

const q = quantities;

/** The sentence for a bound on the relative air speed, built from its label and display unit. */
function vrWarning(range: string, system: UnitSystem): string {
  return copy.applicabilityWarning(q.vr.label, valueWithUnit(range, displayUnitFor(q.vr, system)));
}

/** `slot` with its humidity entered as `value` in `mode`. */
function withHumidity(slot: SlotInputs, mode: HumidityMode, value: number): SlotInputs {
  return { ...slot, humidity: { mode, value } };
}

describe("enteredBound / outOfRangeInputs", () => {
  it("is empty when every entered value is within the model's bounds", () => {
    expect(outOfRangeInputs(defaultSlot(pmvPpdIso), pmvPpdIso)).toEqual([]);
  });

  it("names the entered quantity that breaks a bound", () => {
    expect(outOfRangeInputs(enteredSlotFor(pmvPpdIso, { tdb: 9 }), pmvPpdIso)).toEqual([q.tdb]);
    expect(outOfRangeInputs(enteredSlotFor(pmvPpdIso, { clo: 2.5 }), pmvPpdIso)).toEqual([q.clo]);
  });

  it("checks an operative entry against every temperature it replaces", () => {
    const bound = enteredBound(pmvPpdIso, q.operative_tmp, enteredSlotFor(pmvPpdIso, { operative_tmp: 25 }));
    expect(bound?.max).toBe(pmvPpdIso.info.inputs.tdb?.applicability?.max);
    expect(outOfRangeInputs(enteredSlotFor(pmvPpdIso, { operative_tmp: (bound?.max ?? 0) + 1 }), pmvPpdIso)).toEqual([q.operative_tmp]);
    expect(outOfRangeInputs(enteredSlotFor(pmvPpdIso, { operative_tmp: bound?.max ?? 0 }), pmvPpdIso)).toEqual([]);
  });

  it("has no bound for an entered quantity the model does not limit", () => {
    // The standard bounds the relative air speed vr, not the entered v.
    expect(enteredBound(pmvPpdIso, q.v, defaultSlot(pmvPpdIso))).toBeUndefined();
  });

  it("handles a min-only bound without a max (e.g. Heat Index's tdb)", () => {
    const minOnly = {
      ...pmvPpdIso,
      info: { ...pmvPpdIso.info, inputs: { ...pmvPpdIso.info.inputs, tdb: { unit: "°C", applicability: { min: 15 } } } },
    };
    expect(enteredBound(minOnly, q.tdb, defaultSlot(pmvPpdIso))).toEqual({ min: 15 });
    expect(outOfRangeInputs(enteredSlotFor(pmvPpdIso, { tdb: 10 }), minOnly)).toEqual([q.tdb]);
    expect(outOfRangeInputs(enteredSlotFor(pmvPpdIso, { tdb: 1000 }), minOnly)).toEqual([]);
  });

  it("does not gate a value only a derived row bounds", () => {
    // tdb at the ISO bound, rh 95: no entered value breaks a row; the derived vapour pressure does.
    const slot = enteredSlotFor(pmvPpdIso, { tdb: 30, tr: 30 });
    const humid: SlotInputs = { ...slot, humidity: { mode: humidityMode.rh, value: 95 } };
    expect(outOfRangeInputs(humid, pmvPpdIso)).toEqual([]);
  });
});

// Relative humidity is bounded 0 to 100 by its kind, not by the library (ADR-0002 decision 46).
describe("enteredBound / outOfRangeInputs, on the humidity entry", () => {
  it("bounds relative humidity to 0 – 100 % and gates an entry outside it", () => {
    expect(enteredBound(pmvPpdIso, q.rh, defaultSlot(pmvPpdIso))).toEqual({ min: 0, max: 100 });
    expect(outOfRangeInputs(withHumidity(defaultSlot(pmvPpdIso), humidityMode.rh, 150), pmvPpdIso)).toEqual([q.rh]);
    expect(outOfRangeInputs(withHumidity(defaultSlot(pmvPpdIso), humidityMode.rh, -20), pmvPpdIso)).toEqual([q.rh]);
    expect(outOfRangeInputs(withHumidity(defaultSlot(pmvPpdIso), humidityMode.rh, 50), pmvPpdIso)).toEqual([]);
  });

  it("converts the bound into the entered humidity ratio at the slot's dry-bulb temperature", () => {
    const slot = withHumidity(enteredSlotFor(pmvPpdIso, { tdb: 25 }), humidityMode.humidityRatio, 0.05);
    expect(enteredBound(pmvPpdIso, q.hr, slot)).toEqual({ min: psy_ta_rh(25, 0).hr, max: psy_ta_rh(25, 100).hr });
    // 0.05 kg/kg is about 238 % relative humidity at 25 °C.
    expect(outOfRangeInputs(slot, pmvPpdIso)).toEqual([q.hr]);
    expect(outOfRangeInputs(withHumidity(slot, humidityMode.humidityRatio, 0.01), pmvPpdIso)).toEqual([]);
  });

  it("gates a dew point at the air temperature, above the library's saturation dew point, and drops the end 0 % has no dew point for", () => {
    // At 25 °C the library reads a 25 °C dew point as 100.95 %.
    const slot = withHumidity(enteredSlotFor(pmvPpdIso, { tdb: 25 }), humidityMode.dewPoint, 25);
    expect(enteredBound(pmvPpdIso, q.dew_point_tmp, slot)).toEqual({ max: psy_ta_rh(25, 100).t_dp });
    expect(outOfRangeInputs(slot, pmvPpdIso)).toEqual([q.dew_point_tmp]);
  });

  it("converts the bound at the operative temperature under operative entry", () => {
    const slot = withHumidity(enteredSlotFor(pmvPpdIso, { operative_tmp: 28 }), humidityMode.humidityRatio, 0.01);
    expect(enteredBound(pmvPpdIso, q.hr, slot)).toEqual({ min: psy_ta_rh(28, 0).hr, max: psy_ta_rh(28, 100).hr });
  });

  it("drops a bound whose converted ends come out inverted", () => {
    // From 100 °C the library's humidity ratio of saturated air is negative; Heat Index accepts that tdb.
    expect(psy_ta_rh(100, 100).hr).toBeLessThan(psy_ta_rh(100, 0).hr);
    const slot = withHumidity(enteredSlotFor(heatIndexRothfusz, { tdb: 100 }), humidityMode.humidityRatio, 0.01);
    expect(enteredBound(heatIndexRothfusz, q.hr, slot)).toBeUndefined();
    expect(outOfRangeInputs(slot, heatIndexRothfusz)).toEqual([]);
  });

  it("does not bound a wet-bulb entry, which the library's inverse clamps to 0 – 100 %", () => {
    // 1.5 °C is below the library's wet bulb of 0 % at 10 °C, yet reads back inside the range.
    expect(psy_ta_rh(10, 0).t_wb).toBeGreaterThan(1.5);
    const slot = withHumidity(enteredSlotFor(pmvPpdIso, { tdb: 10, tr: 10 }), humidityMode.wetBulb, 1.5);
    expect(enteredBound(pmvPpdIso, q.wet_bulb_tmp, slot)).toBeUndefined();
    expect(outOfRangeInputs(slot, pmvPpdIso)).toEqual([]);
  });

  it("narrows the bound to a model's own relative-humidity row", () => {
    const bounded = {
      ...pmvPpdIso,
      info: { ...pmvPpdIso.info, inputs: { ...pmvPpdIso.info.inputs, rh: { unit: "%", applicability: { min: 30, max: 120 } } } },
    };
    expect(enteredBound(bounded, q.rh, defaultSlot(pmvPpdIso))).toEqual({ min: 30, max: 100 });
    expect(outOfRangeInputs(withHumidity(defaultSlot(pmvPpdIso), humidityMode.rh, 20), bounded)).toEqual([q.rh]);
  });

  it("does not bound the humidity entry of a model that takes no humidity", () => {
    const slot = withHumidity(defaultSlot(pmvPpdIso), humidityMode.rh, 150);
    expect(enteredBound(adaptiveAshrae, q.rh, slot)).toBeUndefined();
    expect(outOfRangeInputs(slot, adaptiveAshrae)).toEqual([]);
  });
});

describe("violationRows", () => {
  function rowsFor(slot: SlotInputs) {
    return violationRows(pmvPpdIso, runOn(slot, pmvPpdIso));
  }

  it("is empty at the model's defaults", () => {
    expect(rowsFor(defaultSlot(pmvPpdIso))).toEqual([]);
  });

  it("maps the kernel's derived vapour-pressure row to pa", () => {
    const slot = enteredSlotFor(pmvPpdIso, { tdb: 30, tr: 30 });
    const humid: SlotInputs = { ...slot, humidity: { mode: humidityMode.rh, value: 95 } };
    const violation = rowsFor(humid).find((row) => row.quantity === q.pa);
    expect(violation?.role).toBe("derived");
    expect(violation?.bound).toEqual(pmvPpdIso.info.derived?.pa?.applicability);
    expect(violation?.value).toBeGreaterThan(violation!.bound.max!);
  });

  it("maps a bounded output the run breaks to its quantity", () => {
    const violation = rowsFor(enteredSlotFor(pmvPpdIso, { tdb: 5, tr: 5, clo: 0.1 })).find((row) => row.quantity === q.pmv);
    expect(violation?.role).toBe("output");
    expect(Math.abs(violation!.value)).toBeGreaterThan(pmvPpdIso.info.outputs.pmv!.applicability!.max!);
  });

  it("reports a relative air speed that breaks the vr bound on the entered v row, without gating it", () => {
    const slot = enteredSlotFor(pmvPpdIso, { v: 1.5 });
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
    expect(below).toEqual([{ quantity: q.v, bounded: q.vr, role: "input", value: 0.9, bound: { max: 0.2 } }]);
    expect(below.map((row) => warningFor(row, unitSystem.si))).toEqual([vrWarning("≤ 0.2", unitSystem.si)]);
    expect(below.map((row) => warningFor(row, unitSystem.ip))).toEqual([vrWarning("≤ 39.37", unitSystem.ip)]);

    const fixed = { key: "vr", role: "input", value: 2.5, bound: { min: 0, max: 2 } };
    const above = violationRows(pmvPpdIso, { warnings: [fixed, ...noControl(2.5)] });
    expect(above).toEqual([{ quantity: q.v, bounded: q.vr, role: "input", value: 2.5, bound: { min: 0, max: 0.2 } }]);
    expect(above.map((row) => warningFor(row, unitSystem.si))).toEqual([vrWarning("0 – 0.2", unitSystem.si)]);
    expect(above.map((row) => warningFor(row, unitSystem.ip))).toEqual([vrWarning("0 – 39.37", unitSystem.ip)]);
  });

  it("names the relative air speed in the sentence on the entered v row, the quantity its bound belongs to", () => {
    // PMV (ASHRAE 55) with the air-speed control off: an entered 0.15 m/s at met 1.29 is a vr of 0.237,
    // over the 0.2 m/s the standard allows at this operative temperature.
    const slot: SlotInputs = {
      ...enteredSlotFor(pmvPpdAshrae, { tdb: 22, tr: 22, v: 0.15, met: 1.29 }),
      options: new Map([[pmvPpdAshrae.options[0], false]]),
    };
    const rows = violationRows(pmvPpdAshrae, runOn(slot, pmvPpdAshrae));
    expect(rows.map(({ quantity, bounded }) => [quantity, bounded])).toEqual([[q.v, q.vr]]);
    expect(rows.map((row) => warningFor(row, unitSystem.si))).toEqual([vrWarning("≤ 0.2", unitSystem.si)]);
    expect(rows.map((row) => warningFor(row, unitSystem.si))).toEqual(["Relative air speed must be ≤ 0.2 m/s"]);
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
    const result = runOn(defaultSlot(pmvPpdIso), stripped);
    expect(() => violationRows(stripped, result)).toThrow(`${pmvPpdIso.info.label} returned no applicability rows`);
  });
});

describe("splitViolations", () => {
  it("puts every violation row on exactly one side: input and derived rows on inputs, output rows on outputs", () => {
    const rows = violationRows(pmvPpdIso, {
      warnings: [
        { key: "clo", role: "input", value: 2.5, bound: { max: 2 } },
        { key: "pa", role: "derived", value: 3000, bound: { max: 2700 } },
        { key: "pmv", role: "output", value: 3, bound: { min: -2, max: 2 } },
      ],
    });
    const { inputs, outputs } = splitViolations(rows);
    expect(inputs.map(({ quantity, role }) => [quantity, role])).toEqual([
      [q.clo, "input"],
      [q.pa, "derived"],
    ]);
    expect(outputs.map(({ quantity, role }) => [quantity, role])).toEqual([[q.pmv, "output"]]);
    for (const row of rows) {
      expect([inputs.includes(row), outputs.includes(row)].filter(Boolean)).toHaveLength(1);
    }
    expect(inputs.length + outputs.length).toBe(rows.length);
  });
});
