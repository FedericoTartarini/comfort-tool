import { psy_ta_rh } from "jsthermalcomfort";
import { describe, expect, it } from "vitest";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { copy } from "$lib/text/copy";
import {
  enteredBound,
  isAtmosphericPressureOutOfRange,
  outOfRangeQuantities,
  outOfRangeRows,
  splitViolations,
  violationRows,
  warningFor,
} from "./applicability";
import { enteredSlotFor } from "./declarationTestSlots";
import { humidityMode, type HumidityMode } from "./entryModes";
import type { RegisteredModel, Values } from "./modelDeclaration";
import { runOn } from "./modelRun";
import { DEFAULT_ATMOSPHERIC_PRESSURE, kindBounds, quantities } from "./quantities";
import { startingSlot, type Slot } from "./slot";
import { displayUnitFor, valueWithUnit } from "./units";
import { unitSystem, type UnitSystem } from "./unitSystem";

const q = quantities;

/** An atmospheric pressure other than the default, about 1 950 m above sea level. */
const LOWER_PRESSURE = 80000;

/** The sentence for a bound on the relative air speed, built from its label and display unit. */
function vrWarning(bound: string, system: UnitSystem): string {
  return copy.applicabilityWarning(q.vr.label, valueWithUnit(bound, displayUnitFor(q.vr, system)));
}

/** `slot` with its humidity entered as `value` in `mode`. */
function withHumidity(slot: Slot, mode: HumidityMode, value: number): Slot {
  return { ...slot, humidity: { mode, value } };
}

describe("enteredBound / outOfRangeQuantities", () => {
  it("is empty when every entered value is within the model's bounds", () => {
    expect(outOfRangeQuantities(startingSlot(pmvPpdIso), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
  });

  it("names the entered quantity that breaks a bound", () => {
    expect(outOfRangeQuantities(enteredSlotFor(pmvPpdIso, { tdb: 9 }), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([q.tdb]);
    expect(outOfRangeQuantities(enteredSlotFor(pmvPpdIso, { clo: 2.5 }), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([q.clo]);
  });

  it("checks an operative entry against every temperature it replaces", () => {
    const bound = enteredBound(pmvPpdIso, q.operative_tmp, enteredSlotFor(pmvPpdIso, { operative_tmp: 25 }), DEFAULT_ATMOSPHERIC_PRESSURE);
    expect(bound?.max).toBe(pmvPpdIso.info.inputs.tdb?.applicability?.max);
    expect(outOfRangeQuantities(enteredSlotFor(pmvPpdIso, { operative_tmp: (bound?.max ?? 0) + 1 }), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([q.operative_tmp]);
    expect(outOfRangeQuantities(enteredSlotFor(pmvPpdIso, { operative_tmp: bound?.max ?? 0 }), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
  });

  it("has no bound for an entered quantity the model does not limit", () => {
    // The standard bounds the relative air speed vr, not the entered v.
    expect(enteredBound(pmvPpdIso, q.v, startingSlot(pmvPpdIso), DEFAULT_ATMOSPHERIC_PRESSURE)).toBeUndefined();
  });

  it("handles a min-only bound without a max (e.g. Heat Index's tdb)", () => {
    const minOnly = {
      ...pmvPpdIso,
      info: { ...pmvPpdIso.info, inputs: { ...pmvPpdIso.info.inputs, tdb: { unit: "°C", applicability: { min: 15 } } } },
    };
    expect(enteredBound(minOnly, q.tdb, startingSlot(pmvPpdIso), DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual({ min: 15 });
    expect(outOfRangeQuantities(enteredSlotFor(pmvPpdIso, { tdb: 10 }), minOnly, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([q.tdb]);
    expect(outOfRangeQuantities(enteredSlotFor(pmvPpdIso, { tdb: 1000 }), minOnly, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
  });

  it("does not gate a value only a derived row bounds", () => {
    // tdb at the ISO bound, rh 95: no entered value breaks a row; the derived vapour pressure does.
    const slot = enteredSlotFor(pmvPpdIso, { tdb: 30, tr: 30 });
    const humid: Slot = { ...slot, humidity: { mode: humidityMode.rh, value: 95 } };
    expect(outOfRangeQuantities(humid, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
  });
});

// Relative humidity is bounded 0 to 100 by its kind, not by the library (ADR-0002 decision 46).
describe("enteredBound / outOfRangeQuantities, on the humidity entry", () => {
  it("bounds relative humidity to 0 – 100 % and gates an entry outside it", () => {
    expect(enteredBound(pmvPpdIso, q.rh, startingSlot(pmvPpdIso), DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual({ min: 0, max: 100 });
    expect(outOfRangeQuantities(withHumidity(startingSlot(pmvPpdIso), humidityMode.rh, 150), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([q.rh]);
    expect(outOfRangeQuantities(withHumidity(startingSlot(pmvPpdIso), humidityMode.rh, -20), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([q.rh]);
    expect(outOfRangeQuantities(withHumidity(startingSlot(pmvPpdIso), humidityMode.rh, 50), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
  });

  it("converts the bound into the entered humidity ratio at the slot's dry-bulb temperature", () => {
    const slot = withHumidity(enteredSlotFor(pmvPpdIso, { tdb: 25 }), humidityMode.humidityRatio, 0.05);
    expect(enteredBound(pmvPpdIso, q.hr, slot, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual({ min: psy_ta_rh(25, 0).hr, max: psy_ta_rh(25, 100).hr });
    // 0.05 kg/kg is about 238 % relative humidity at 25 °C.
    expect(outOfRangeQuantities(slot, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([q.hr]);
    expect(outOfRangeQuantities(withHumidity(slot, humidityMode.humidityRatio, 0.01), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
  });

  it("gates a dew point at the air temperature, above the library's saturation dew point, and drops the end 0 % has no dew point for", () => {
    // At 25 °C the library reads a 25 °C dew point as 100.95 %.
    const slot = withHumidity(enteredSlotFor(pmvPpdIso, { tdb: 25 }), humidityMode.dewPoint, 25);
    expect(enteredBound(pmvPpdIso, q.dew_point_tmp, slot, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual({ max: psy_ta_rh(25, 100).t_dp });
    expect(outOfRangeQuantities(slot, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([q.dew_point_tmp]);
  });

  it("converts the bound into the entered humidity ratio at the atmospheric pressure, and gates at it", () => {
    // 0.022 kg/kg is above saturation at 25 °C and 101 325 Pa, and below it at 80 000 Pa.
    const slot = withHumidity(enteredSlotFor(pmvPpdIso, { tdb: 25 }), humidityMode.humidityRatio, 0.022);
    expect(enteredBound(pmvPpdIso, q.hr, slot, LOWER_PRESSURE)).toEqual({
      min: psy_ta_rh(25, 0, LOWER_PRESSURE).hr,
      max: psy_ta_rh(25, 100, LOWER_PRESSURE).hr,
    });
    expect(outOfRangeQuantities(slot, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([q.hr]);
    expect(outOfRangeQuantities(slot, pmvPpdIso, LOWER_PRESSURE)).toEqual([]);
  });

  it("converts the bound at the operative temperature under operative entry", () => {
    const slot = withHumidity(enteredSlotFor(pmvPpdIso, { operative_tmp: 28 }), humidityMode.humidityRatio, 0.01);
    expect(enteredBound(pmvPpdIso, q.hr, slot, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual({ min: psy_ta_rh(28, 0).hr, max: psy_ta_rh(28, 100).hr });
  });

  it("drops a bound whose converted ends come out inverted", () => {
    // From 100 °C the library's humidity ratio of saturated air is negative; Heat Index accepts that tdb.
    expect(psy_ta_rh(100, 100).hr).toBeLessThan(psy_ta_rh(100, 0).hr);
    const slot = withHumidity(enteredSlotFor(heatIndexRothfusz, { tdb: 100 }), humidityMode.humidityRatio, 0.01);
    expect(enteredBound(heatIndexRothfusz, q.hr, slot, DEFAULT_ATMOSPHERIC_PRESSURE)).toBeUndefined();
    expect(outOfRangeQuantities(slot, heatIndexRothfusz, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
  });

  it("does not bound a wet-bulb entry, which the library's inverse clamps to 0 – 100 %", () => {
    // 1.5 °C is below the library's wet bulb of 0 % at 10 °C, yet reads back inside the range.
    expect(psy_ta_rh(10, 0).t_wb).toBeGreaterThan(1.5);
    const slot = withHumidity(enteredSlotFor(pmvPpdIso, { tdb: 10, tr: 10 }), humidityMode.wetBulb, 1.5);
    expect(enteredBound(pmvPpdIso, q.wet_bulb_tmp, slot, DEFAULT_ATMOSPHERIC_PRESSURE)).toBeUndefined();
    expect(outOfRangeQuantities(slot, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
  });

  it("narrows the bound to a model's own relative-humidity row", () => {
    const bounded = {
      ...pmvPpdIso,
      info: { ...pmvPpdIso.info, inputs: { ...pmvPpdIso.info.inputs, rh: { unit: "%", applicability: { min: 30, max: 120 } } } },
    };
    expect(enteredBound(bounded, q.rh, startingSlot(pmvPpdIso), DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual({ min: 30, max: 100 });
    expect(outOfRangeQuantities(withHumidity(startingSlot(pmvPpdIso), humidityMode.rh, 20), bounded, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([q.rh]);
  });

  it("neither bounds nor lists a humidity for a slot that holds none", () => {
    // Adaptive (ASHRAE 55) takes no humidity, so the slot it starts on holds none.
    const holdsNone = startingSlot(adaptiveAshrae);
    for (const mode of Object.values(humidityMode)) {
      expect(enteredBound(pmvPpdIso, mode.quantity, holdsNone, DEFAULT_ATMOSPHERIC_PRESSURE), mode.id).toBeUndefined();
    }
    // The same slot holding a humidity past 100 % lists it, so the empty list is the absent entry's doing.
    expect(outOfRangeQuantities(withHumidity(holdsNone, humidityMode.rh, 150), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([q.rh]);
    expect(outOfRangeRows(holdsNone, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
  });

  it("does not bound the humidity entry of a model that takes no humidity", () => {
    const slot = withHumidity(startingSlot(pmvPpdIso), humidityMode.rh, 150);
    expect(enteredBound(adaptiveAshrae, q.rh, slot, DEFAULT_ATMOSPHERIC_PRESSURE)).toBeUndefined();
    expect(outOfRangeQuantities(slot, adaptiveAshrae, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
  });
});

const pressureBound = kindBounds.atmosphericPressure;
if (pressureBound?.min === undefined || pressureBound.max === undefined) {
  throw new Error("Atmospheric pressure is no longer bounded at both ends");
}
/** The two ends of the pressure's bound, both in range. */
const PRESSURE_ENDS = [pressureBound.min, pressureBound.max];
/** A pressure above the bound's 110 000 Pa, where saturated air holds less water than at 101 325 Pa. */
const PRESSURE_ABOVE_RANGE = 120000;
/** A pressure below the bound's 30 000 Pa. */
const PRESSURE_BELOW_RANGE = 20000;

// No bound is taken at a pressure the app calls out of range (ADR-0002 decision 53).
describe("enteredBound / outOfRangeRows, with the atmospheric pressure out of range", () => {
  /** A slot on PMV (ISO 7730) at 25 °C, its humidity entered as `value` in `mode`. */
  const at25 = (mode: HumidityMode, value: number) => withHumidity(enteredSlotFor(pmvPpdIso, { tdb: 25 }), mode, value);

  it("above the bound, gives a humidity-ratio entry no bound and lists no row for it, whatever its value", () => {
    // 0.018 kg/kg is about 90 % at 101 325 Pa and 106 % at 120 000 Pa; 0.05 is beyond saturation at either.
    for (const value of [0.018, 0.05, -0.01]) {
      const slot = at25(humidityMode.humidityRatio, value);
      expect(enteredBound(pmvPpdIso, q.hr, slot, PRESSURE_ABOVE_RANGE), String(value)).toBeUndefined();
      expect(outOfRangeRows(slot, pmvPpdIso, PRESSURE_ABOVE_RANGE), String(value)).toEqual([]);
    }
  });

  it("below the bound, gives a humidity-ratio entry no bound and lists no row for it, whatever its value", () => {
    for (const value of [0.018, 0.5, -0.01]) {
      const slot = at25(humidityMode.humidityRatio, value);
      expect(enteredBound(pmvPpdIso, q.hr, slot, PRESSURE_BELOW_RANGE), String(value)).toBeUndefined();
      expect(outOfRangeRows(slot, pmvPpdIso, PRESSURE_BELOW_RANGE), String(value)).toEqual([]);
    }
  });

  it("at either end of the bound, converts a humidity-ratio entry's bound at that pressure", () => {
    const slot = at25(humidityMode.humidityRatio, 0.01);
    for (const pressure of PRESSURE_ENDS) {
      expect(enteredBound(pmvPpdIso, q.hr, slot, pressure), String(pressure)).toEqual({
        min: psy_ta_rh(25, 0, pressure).hr,
        max: psy_ta_rh(25, 100, pressure).hr,
      });
    }
  });

  it("bounds a relative-humidity, dew-point and vapour-pressure entry as in range, and a wet-bulb entry not at all", () => {
    for (const mode of [humidityMode.rh, humidityMode.dewPoint, humidityMode.vapourPressure]) {
      const inRange = enteredBound(pmvPpdIso, mode.quantity, at25(mode, 0), DEFAULT_ATMOSPHERIC_PRESSURE);
      expect(inRange, mode.id).toBeDefined();
      for (const pressure of [PRESSURE_ABOVE_RANGE, PRESSURE_BELOW_RANGE]) {
        expect(enteredBound(pmvPpdIso, mode.quantity, at25(mode, 0), pressure), mode.id).toEqual(inRange);
      }
    }
    for (const pressure of [PRESSURE_ABOVE_RANGE, PRESSURE_BELOW_RANGE]) {
      expect(enteredBound(pmvPpdIso, q.wet_bulb_tmp, at25(humidityMode.wetBulb, 20), pressure)).toBeUndefined();
    }
  });
});

// Judged apart from the entered values: no slot holds the pressure (ADR-0002 decision 49).
describe("isAtmosphericPressureOutOfRange", () => {
  it("answers out of range below 30 000 Pa and above 110 000 Pa, and in range at both ends", () => {
    expect(isAtmosphericPressureOutOfRange(29999)).toBe(true);
    expect(isAtmosphericPressureOutOfRange(30000)).toBe(false);
    expect(isAtmosphericPressureOutOfRange(DEFAULT_ATMOSPHERIC_PRESSURE)).toBe(false);
    expect(isAtmosphericPressureOutOfRange(110000)).toBe(false);
    expect(isAtmosphericPressureOutOfRange(110001)).toBe(true);
  });
});

describe("violationRows", () => {
  function rowsFor(slot: Slot) {
    return violationRows(pmvPpdIso, runOn(slot, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE));
  }

  it("is empty at the model's defaults", () => {
    expect(rowsFor(startingSlot(pmvPpdIso))).toEqual([]);
  });

  it("maps the kernel's derived vapour-pressure row to pa", () => {
    const slot = enteredSlotFor(pmvPpdIso, { tdb: 30, tr: 30 });
    const humid: Slot = { ...slot, humidity: { mode: humidityMode.rh, value: 95 } };
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
    expect(outOfRangeQuantities(slot, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
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
    const slot: Slot = {
      ...enteredSlotFor(pmvPpdAshrae, { tdb: 22, tr: 22, v: 0.15, met: 1.29 }),
      options: new Map([[pmvPpdAshrae.options[0], false]]),
    };
    const rows = violationRows(pmvPpdAshrae, runOn(slot, pmvPpdAshrae, DEFAULT_ATMOSPHERIC_PRESSURE));
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
    const result = runOn(startingSlot(pmvPpdIso), stripped, DEFAULT_ATMOSPHERIC_PRESSURE);
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
