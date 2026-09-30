import { clo_dynamic_iso, psy_ta_rh } from "jsthermalcomfort";
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
import { enteredSlotFor, entryModesWithAirSpeed, entryModesWithClothing } from "./declarationTestSlots";
import { airSpeedMode, clothingMode, humidityMode, type HumidityMode } from "./entryModes";
import type { RegisteredModel, Values } from "./modelDeclaration";
import { runOn } from "./modelRun";
import { adjustToBounds } from "./modelSwitch";
import { shownAtMost } from "./numberFormat";
import { DEFAULT_ATMOSPHERIC_PRESSURE, kindBounds, quantities } from "./quantities";
import { defaultEntryModes, dynamicClothingOf, relativeAirSpeedOf, requireValue, startingSlot, withEnteredValues, type Slot } from "./slot";
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

  it("holds an entered relative air speed and an entered dynamic clothing insulation to the model's own row, unchanged", () => {
    for (const model of [pmvPpdIso, pmvPpdAshrae]) {
      const airSpeed = model.info.inputs.vr?.applicability;
      const clothing = model.info.inputs.clo?.applicability;
      // At 2 met, where both corrections move an entry of the other mode.
      const within = enteredSlotFor(model, { met: 2, vr: airSpeed?.max ?? 0, clo_dynamic: clothing?.max ?? 0 });
      expect(enteredBound(model, q.vr, within, DEFAULT_ATMOSPHERIC_PRESSURE), model.info.label).toEqual(airSpeed);
      expect(enteredBound(model, q.clo_dynamic, within, DEFAULT_ATMOSPHERIC_PRESSURE), model.info.label).toEqual(clothing);
      expect(outOfRangeRows(within, model, DEFAULT_ATMOSPHERIC_PRESSURE), model.info.label).toEqual([]);
      const beyond = enteredSlotFor(model, { met: 2, vr: (airSpeed?.max ?? 0) + 0.1, clo_dynamic: (clothing?.max ?? 0) + 0.1 });
      expect(outOfRangeRows(beyond, model, DEFAULT_ATMOSPHERIC_PRESSURE), model.info.label).toEqual([
        { quantity: q.vr, value: (airSpeed?.max ?? 0) + 0.1, bound: airSpeed },
        { quantity: q.clo_dynamic, value: (clothing?.max ?? 0) + 0.1, bound: clothing },
      ]);
    }
  });

  // The model info bounds the relative air speed, 0 – 1 m/s on ISO 7730 and 0 – 2 m/s on ASHRAE 55;
  // the activity's share of it, 0.3 m/s per met above 1 met, comes off the air speed a person may enter.
  it("holds an entered air speed to the model's bound for the relative air speed, converted at the slot's metabolic rate", () => {
    const boundAt = (model: RegisteredModel, met: number) =>
      enteredBound(model, q.v, enteredSlotFor(model, { met }), DEFAULT_ATMOSPHERIC_PRESSURE);
    expect(boundAt(pmvPpdIso, 2)).toEqual({ min: 0, max: 0.7 });
    expect(boundAt(pmvPpdIso, 1)).toEqual({ min: 0, max: 1 });
    expect(boundAt(pmvPpdIso, 1.1)).toEqual({ min: 0, max: 0.97 });
    expect(boundAt(pmvPpdAshrae, 1.1)).toEqual({ min: 0, max: 1.97 });

    expect(outOfRangeRows(enteredSlotFor(pmvPpdIso, { met: 2, v: 0.7 }), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
    expect(outOfRangeRows(enteredSlotFor(pmvPpdIso, { met: 2, v: 0.8 }), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([
      { quantity: q.v, value: 0.8, bound: { min: 0, max: 0.7 } },
    ]);
    // The same air speed is inside the bound at 1 met.
    expect(outOfRangeRows(enteredSlotFor(pmvPpdIso, { met: 1, v: 0.8 }), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
  });

  it("holds an entered air speed at 0 by its kind, where the converted bound's lower end is below it", () => {
    // The standard bounds the relative air speed vr, not the entered v: 0 m/s of it at 2 met is an air speed of −0.3 m/s.
    expect(pmvPpdIso.info.inputs.v).toBeUndefined();
    expect(kindBounds.airSpeed).toEqual({ min: 0 });
    expect(outOfRangeRows(enteredSlotFor(pmvPpdIso, { met: 2, v: 0 }), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
    expect(outOfRangeRows(enteredSlotFor(pmvPpdIso, { met: 2, v: -0.2 }), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([
      { quantity: q.v, value: -0.2, bound: { min: 0, max: 0.7 } },
    ]);
  });

  it("holds an air speed by its kind alone where the converted bound leaves no air speed, at a metabolic rate the gate stops", () => {
    // At 5 met the activity's share is 1.2 m/s, over the model's 1 m/s of relative air speed whatever the air speed.
    const slot = enteredSlotFor(pmvPpdIso, { met: 5, v: 0.1 });
    expect(enteredBound(pmvPpdIso, q.v, slot, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual(kindBounds.airSpeed);
    expect(outOfRangeQuantities(slot, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([q.met]);
  });

  // The model info bounds the dynamic clothing insulation the model is given, 0 – 2 clo on ISO 7730
  // and 0 – 1.5 clo on ASHRAE 55; each standard's rule is inverted at the slot's own values.
  it("holds an entered clothing insulation to the model's bound for the clothing, converted by its standard's rule", () => {
    const boundAt = (model: RegisteredModel, entered: Parameters<typeof enteredSlotFor>[1]) =>
      enteredBound(model, q.clo, enteredSlotFor(model, entered), DEFAULT_ATMOSPHERIC_PRESSURE);

    // ISO 7730's rule gives still, seated air more clothing than was entered: 2 clo is given as 2.069.
    const stillAir = boundAt(pmvPpdIso, { met: 1, v: 0 });
    expect(stillAir?.min).toBe(0);
    expect(stillAir?.max).toBeCloseTo(1.934, 3);
    expect(clo_dynamic_iso(2, 1, 0)).toBeGreaterThan(2);
    expect(outOfRangeRows(enteredSlotFor(pmvPpdIso, { met: 1, v: 0, clo: 2 }), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([
      { quantity: q.clo, value: 2, bound: stillAir },
    ]);
    expect(outOfRangeRows(enteredSlotFor(pmvPpdIso, { met: 1, v: 0, clo: 1.93 }), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);

    // ASHRAE 55's rule gives 1.6 clo at 2 met as 1.28 clo, inside the model's 1.5.
    expect(boundAt(pmvPpdAshrae, { met: 2 })).toEqual({ min: 0, max: 1.875 });
    expect(outOfRangeRows(enteredSlotFor(pmvPpdAshrae, { met: 2, clo: 1.6 }), pmvPpdAshrae, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
    expect(outOfRangeQuantities(enteredSlotFor(pmvPpdAshrae, { met: 2, clo: 1.9 }), pmvPpdAshrae, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([q.clo]);
    // At or below 1.2 met the rule is the identity, and the bound the model's own.
    expect(boundAt(pmvPpdAshrae, { met: 1.1 })).toEqual(pmvPpdAshrae.info.inputs.clo?.applicability);
  });

  it("moves the clothing bound with the air speed under ISO 7730's rule, in either air-speed mode, and not under ASHRAE 55's", () => {
    const maxAt = (model: RegisteredModel, entered: Parameters<typeof enteredSlotFor>[1]) =>
      enteredBound(model, q.clo, enteredSlotFor(model, entered), DEFAULT_ATMOSPHERIC_PRESSURE)?.max;
    expect(maxAt(pmvPpdIso, { met: 2, v: 0.4 })).toBeGreaterThan(maxAt(pmvPpdIso, { met: 2, v: 0 }) ?? Infinity);
    expect(maxAt(pmvPpdIso, { met: 2, vr: 0.7 })).toBe(maxAt(pmvPpdIso, { met: 2, v: 0.4 }));
    expect(maxAt(pmvPpdAshrae, { met: 2, v: 0.4 })).toBe(maxAt(pmvPpdAshrae, { met: 2, v: 0 }));
  });

  // The library compares strictly, and ISO 7730's rule does not round: its converted end is a search's answer,
  // given to the model a hair over its bound. A yes moves an entry to the end as the row shows it, inside the bound.
  it("gives the model no more than its bound for an entry a yes moved to a converted end, so the run reports none", () => {
    for (const model of [pmvPpdIso, pmvPpdAshrae]) {
      const airSpeedMax = model.info.inputs.vr?.applicability?.max ?? 0;
      const clothingMax = model.info.inputs.clo?.applicability?.max ?? 0;
      for (let met = 1; met <= 4; met += 0.1) {
        const airSpeedEnd = enteredBound(model, q.v, enteredSlotFor(model, { met }), DEFAULT_ATMOSPHERIC_PRESSURE)?.max ?? Number.NaN;
        for (const v of [0, airSpeedEnd / 2, airSpeedEnd]) {
          const clothingEnd = enteredBound(model, q.clo, enteredSlotFor(model, { met, v }), DEFAULT_ATMOSPHERIC_PRESSURE)?.max ?? Number.NaN;
          const beyond = enteredSlotFor(model, { met, v, clo: clothingEnd + 1 });
          const slot = adjustToBounds(beyond, outOfRangeRows(beyond, model, DEFAULT_ATMOSPHERIC_PRESSURE));
          const at = `${model.info.label}, ${met} met, ${v} m/s`;
          expect(outOfRangeRows(slot, model, DEFAULT_ATMOSPHERIC_PRESSURE), at).toEqual([]);
          expect(relativeAirSpeedOf(slot), at).toBeLessThanOrEqual(airSpeedMax);
          expect(dynamicClothingOf(slot, model), at).toBeLessThanOrEqual(clothingMax);
          expect(requireValue(slot.values, q.clo), at).toBe(shownAtMost(clothingEnd));
          // And no bound stops short: 0.01 clo past the end, a step ASHRAE 55's rounding cannot hide, is given as more.
          expect(dynamicClothingOf(enteredSlotFor(model, { met, v, clo: clothingEnd + 0.01 }), model), at).toBeGreaterThan(clothingMax);
          const rows = violationRows(model, runOn(slot, model, DEFAULT_ATMOSPHERIC_PRESSURE), slot);
          expect(rows.filter((row) => row.bounded === q.clo), at).toEqual([]);
        }
      }
    }
  });

  it("narrows a model's own air-speed row by the kind's bound, and leaves a model that enters no air speed alone", () => {
    const own = adaptiveAshrae.info.inputs.v?.applicability;
    // ASHRAE 55's row starts at 0 already, so the two bounds together are the row.
    expect(own?.min).toBe(0);
    expect(enteredBound(adaptiveAshrae, q.v, startingSlot(adaptiveAshrae), DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual(own);
    // Heat Index enters no air speed: one left in the bag by another model is not its to judge.
    const held = withEnteredValues(startingSlot(heatIndexRothfusz), new Map([[q.v, -0.2]]));
    expect(enteredBound(heatIndexRothfusz, q.v, held, DEFAULT_ATMOSPHERIC_PRESSURE)).toBeUndefined();
    expect(outOfRangeRows(held, heatIndexRothfusz, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
  });

  it("has no bound for an entered quantity neither the model nor its kind limits", () => {
    expect(enteredBound(pmvPpdIso, q.wme, startingSlot(pmvPpdIso), DEFAULT_ATMOSPHERIC_PRESSURE)).toBeUndefined();
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
    // As the slot Adaptive (ASHRAE 55) starts on, which takes no humidity; the values are PMV (ISO 7730)'s,
    // since the bound of its air speed is read at its metabolic rate.
    expect(startingSlot(adaptiveAshrae).humidity).toBeUndefined();
    const holdsNone: Slot = { ...startingSlot(pmvPpdIso), humidity: undefined };
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
    return violationRows(pmvPpdIso, runOn(slot, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE), slot);
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

  it("merges rows on one quantity and role into one sentence over the narrowest bound", () => {
    // PMV (ASHRAE 55) with the air-speed control off, at an operative temperature ≤ 23 °C:
    // the no-control rows, and above 2 m/s the fixed 0–2 m/s row too.
    const noControl = (value: number) => [
      { key: "vr", role: "input", value, bound: { max: 0.8 } },
      { key: "vr", role: "input", value, bound: { max: 0.2 } },
    ];
    const below = violationRows(pmvPpdIso, { warnings: noControl(0.9) }, defaultEntryModes);
    expect(below).toEqual([{ quantity: q.v, bounded: q.vr, role: "input", value: 0.9, bound: { max: 0.2 } }]);
    expect(below.map((row) => warningFor(row, unitSystem.si))).toEqual([vrWarning("≤ 0.2", unitSystem.si)]);
    expect(below.map((row) => warningFor(row, unitSystem.ip))).toEqual([vrWarning("≤ 39.37", unitSystem.ip)]);

    const fixed = { key: "vr", role: "input", value: 2.5, bound: { min: 0, max: 2 } };
    const above = violationRows(pmvPpdIso, { warnings: [fixed, ...noControl(2.5)] }, defaultEntryModes);
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
    const rows = violationRows(pmvPpdAshrae, runOn(slot, pmvPpdAshrae, DEFAULT_ATMOSPHERIC_PRESSURE), slot);
    expect(rows.map(({ quantity, bounded }) => [quantity, bounded])).toEqual([[q.v, q.vr]]);
    expect(rows.map((row) => warningFor(row, unitSystem.si))).toEqual([vrWarning("≤ 0.2", unitSystem.si)]);
    expect(rows.map((row) => warningFor(row, unitSystem.si))).toEqual(["Relative air speed must be ≤ 0.2 m/s"]);
  });

  it("reports a relative air speed the run breaks on its own row under relative air speed entry, with no mapping", () => {
    // The same case entered as the relative air speed itself: 0.237 m/s is inside the model info's
    // 0 – 2 m/s, so the gate passes it, and over the 0.2 m/s the standard allows here.
    const slot: Slot = {
      ...enteredSlotFor(pmvPpdAshrae, { tdb: 22, tr: 22, vr: 0.237, met: 1.29 }),
      options: new Map([[pmvPpdAshrae.options[0], false]]),
    };
    expect(outOfRangeQuantities(slot, pmvPpdAshrae, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
    const rows = violationRows(pmvPpdAshrae, runOn(slot, pmvPpdAshrae, DEFAULT_ATMOSPHERIC_PRESSURE), slot);
    expect(rows.map(({ quantity, bounded, value }) => [quantity, bounded, value])).toEqual([[q.vr, q.vr, 0.237]]);
    expect(rows.map((row) => warningFor(row, unitSystem.si))).toEqual([vrWarning("≤ 0.2", unitSystem.si)]);
  });

  // The gate holds the clothing to the model's bound converted into the entry, so a run is given
  // no clothing outside it; a `clo` row, were the library to report one, is reported as keyed.
  it("reports a clothing row as the library keys it, in either clothing mode", () => {
    const warnings = [{ key: "clo", role: "input", value: 2.5, bound: { max: 2 } }];
    for (const modes of [defaultEntryModes, entryModesWithClothing(clothingMode.corrected)]) {
      expect(violationRows(pmvPpdIso, { warnings }, modes).map(({ quantity, bounded }) => [quantity, bounded])).toEqual([[q.clo, q.clo]]);
    }
  });

  it("reports the row in the entry modes it is asked in, whatever mode the run was entered in", () => {
    const warnings = [{ key: "vr", role: "input", value: 0.9, bound: { max: 0.2 } }];
    const rowOf = (modes: Parameters<typeof violationRows>[2]) => violationRows(pmvPpdIso, { warnings }, modes)[0].quantity;
    expect(rowOf(defaultEntryModes)).toBe(q.v);
    expect(rowOf(entryModesWithAirSpeed(airSpeedMode.corrected))).toBe(q.vr);
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
    expect(violationRows(pmvPpdIso, result, defaultEntryModes).map(({ quantity, role }) => [quantity, role])).toEqual([
      [q.v, "input"],
      [q.clo, "input"],
      [q.pmv, "input"],
      [q.pmv, "output"],
    ]);
  });

  it("drops a key the quantity table lacks", () => {
    const result = { warnings: [{ key: "not_a_quantity", role: "input", value: 1, bound: { max: 0.8 } }] };
    expect(violationRows(pmvPpdIso, result, defaultEntryModes)).toEqual([]);
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
    expect(() => violationRows(stripped, result, defaultEntryModes)).toThrow(`${pmvPpdIso.info.label} returned no applicability rows`);
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
    }, defaultEntryModes);
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
