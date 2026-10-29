import { psy_ta_rh } from "jsthermalcomfort";
import { describe, expect, it } from "vitest";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { copy } from "$lib/text/copy";
import { registeredModels } from "$lib/models";
import {
  breaksNewLimit,
  enteredBound,
  formatBound,
  isAtmosphericPressureOutOfRange,
  outOfRangeRows,
  violationRows,
  warningFor,
  type Bound,
  type ViolationRow,
} from "./applicability";
import { enteredSlotFor, entryModesWithAirSpeed, entryModesWithClothing } from "./declarationTestSlots";
import { airSpeedMode, clothingMode, humidityMode, type HumidityMode } from "./entryModes";
import { optionsOf, type RegisteredModel, type Values } from "./modelDeclaration";
import { runOn } from "./modelRun";
import { formatNumber, isShownBeyond } from "./numberFormat";
import { DEFAULT_ATMOSPHERIC_PRESSURE, kindBounds, quantities, quantityFor, type Quantity } from "./quantities";
import { defaultEntryModes, startingSlot, withEnteredValues, type Slot } from "./slot";
import { displayUnitFor, valueWithUnit } from "./units";
import { unitSystem, type UnitSystem } from "./unitSystem";

const q = quantities;

/** An atmospheric pressure other than the default, about 1 950 m above sea level. */
const LOWER_PRESSURE = 80000;

/** The sentence for a bound on the relative air speed, built from its label and display unit. */
function vrWarning(bound: string, system: UnitSystem): string {
  return copy.applicabilityWarning(q.vr.label, valueWithUnit(bound, displayUnitFor(q.vr, system)));
}

/** The quantities {@link outOfRangeRows} names in `slot` under `model` at `atmosphericPressure`. */
function quantitiesOutOfRange(slot: Slot, model: RegisteredModel, atmosphericPressure: number): Quantity[] {
  return outOfRangeRows(slot, model, atmosphericPressure).map((row) => row.quantity);
}

/** `slot` with its humidity entered as `value` in `mode`. */
function withHumidity(slot: Slot, mode: HumidityMode, value: number): Slot {
  return { ...slot, humidity: { mode, value } };
}

describe("enteredBound / outOfRangeRows", () => {
  it("is empty when every entered value is within the model's bounds", () => {
    expect(quantitiesOutOfRange(startingSlot(pmvPpdIso), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
  });

  it("names the entered quantity that breaks a bound", () => {
    expect(quantitiesOutOfRange(enteredSlotFor(pmvPpdIso, { tdb: 9 }), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([q.tdb]);
    expect(quantitiesOutOfRange(enteredSlotFor(pmvPpdIso, { met: 4.5 }), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([q.met]);
  });

  it("checks an operative entry against every temperature it replaces", () => {
    const bound = enteredBound(pmvPpdIso, q.operative_tmp, enteredSlotFor(pmvPpdIso, { operative_tmp: 25 }), DEFAULT_ATMOSPHERIC_PRESSURE);
    expect(bound?.max).toBe(pmvPpdIso.info.inputs.tdb?.applicability?.max);
    expect(quantitiesOutOfRange(enteredSlotFor(pmvPpdIso, { operative_tmp: (bound?.max ?? 0) + 1 }), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([q.operative_tmp]);
    expect(quantitiesOutOfRange(enteredSlotFor(pmvPpdIso, { operative_tmp: bound?.max ?? 0 }), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
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

  // The model info bounds the relative air speed and the dynamic clothing insulation the model is given,
  // not the air speed and clothing insulation a person enters (ADR-0002 decision 84's note of 2026-10-28, rule 2).
  it("holds an entered air speed and clothing insulation to its kind's bound alone, at every metabolic rate", () => {
    for (const model of [pmvPpdIso, pmvPpdAshrae]) {
      for (const met of [1, 2, 4, 5]) {
        const slot = enteredSlotFor(model, { met });
        const at = `${model.info.label}, ${met} met`;
        expect(enteredBound(model, q.v, slot, DEFAULT_ATMOSPHERIC_PRESSURE), at).toEqual({ min: 0 });
        expect(enteredBound(model, q.clo, slot, DEFAULT_ATMOSPHERIC_PRESSURE), at).toEqual({ min: 0 });
      }
      const far = enteredSlotFor(model, { met: 2, v: 5, clo: 5 });
      expect(outOfRangeRows(far, model, DEFAULT_ATMOSPHERIC_PRESSURE), model.info.label).toEqual([]);
      const below = enteredSlotFor(model, { met: 2, v: -0.2, clo: -0.2 });
      expect(outOfRangeRows(below, model, DEFAULT_ATMOSPHERIC_PRESSURE), model.info.label).toEqual([
        { quantity: q.v, value: -0.2, bound: { min: 0 } },
        { quantity: q.clo, value: -0.2, bound: { min: 0 } },
      ]);
    }
    expect(kindBounds.airSpeed).toEqual({ min: 0 });
    expect(kindBounds.clothingInsulation).toEqual({ min: 0 });
  });

  // The gate compares at the precision a row shows (ADR-0002 decision 56): an end of 1.875 reads 1.88.
  it("passes a value within half a shown step of its bound on either side, and stops one shown outside it", () => {
    const model = {
      ...pmvPpdIso,
      info: { ...pmvPpdIso.info, inputs: { ...pmvPpdIso.info.inputs, met: { unit: "met", applicability: { min: 0, max: 1.875 } } } },
    };
    const rowsAt = (met: number) => outOfRangeRows(enteredSlotFor(model, { met }), model, DEFAULT_ATMOSPHERIC_PRESSURE);
    for (const met of [1.8749, 1.875, 1.8751, 1.88, -0.004]) {
      expect(rowsAt(met), String(met)).toEqual([]);
    }
    expect(rowsAt(1.885)).toEqual([{ quantity: q.met, value: 1.885, bound: { min: 0, max: 1.875 } }]);
    expect(rowsAt(-0.006)).toEqual([{ quantity: q.met, value: -0.006, bound: { min: 0, max: 1.875 } }]);
  });

  it("judges a humidity ratio at two decimals of g/kg, not of the kg/kg it is held in", () => {
    const at25 = (value: number) => withHumidity(startingSlot(pmvPpdIso), humidityMode.humidityRatio, value);
    const max = enteredBound(pmvPpdIso, q.hr, at25(0), DEFAULT_ATMOSPHERIC_PRESSURE)?.max ?? Number.NaN;
    // Saturated air at 25 °C holds about 20 g/kg. The end as the range reads it passes, and 0.01 g/kg more does not.
    const gramsPerKilogram = displayUnitFor(q.hr, unitSystem.si);
    const shownEnd = Number(formatNumber(gramsPerKilogram.fromSi(max)));
    expect(outOfRangeRows(at25(gramsPerKilogram.toSi(shownEnd)), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
    expect(quantitiesOutOfRange(at25(gramsPerKilogram.toSi(shownEnd + 0.01)), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([q.hr]);
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
    expect(quantitiesOutOfRange(enteredSlotFor(pmvPpdIso, { tdb: 10 }), minOnly, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([q.tdb]);
    expect(quantitiesOutOfRange(enteredSlotFor(pmvPpdIso, { tdb: 1000 }), minOnly, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
  });

  it("does not gate a value only a derived row bounds", () => {
    // tdb at the ISO bound, rh 95: no entered value breaks a row; the derived vapour pressure does.
    const slot = enteredSlotFor(pmvPpdIso, { tdb: 30, tr: 30 });
    const humid: Slot = { ...slot, humidity: { mode: humidityMode.rh, value: 95 } };
    expect(quantitiesOutOfRange(humid, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
  });
});

// Relative humidity is bounded 0 to 100 by its kind, not by the library (ADR-0002 decision 46).
describe("enteredBound / outOfRangeRows, on the humidity entry", () => {
  it("bounds relative humidity to 0 – 100 % and gates an entry outside it", () => {
    expect(enteredBound(pmvPpdIso, q.rh, startingSlot(pmvPpdIso), DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual({ min: 0, max: 100 });
    expect(quantitiesOutOfRange(withHumidity(startingSlot(pmvPpdIso), humidityMode.rh, 150), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([q.rh]);
    expect(quantitiesOutOfRange(withHumidity(startingSlot(pmvPpdIso), humidityMode.rh, -20), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([q.rh]);
    expect(quantitiesOutOfRange(withHumidity(startingSlot(pmvPpdIso), humidityMode.rh, 50), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
  });

  it("converts the bound into the entered humidity ratio at the slot's dry-bulb temperature", () => {
    const slot = withHumidity(enteredSlotFor(pmvPpdIso, { tdb: 25 }), humidityMode.humidityRatio, 0.05);
    expect(enteredBound(pmvPpdIso, q.hr, slot, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual({ min: psy_ta_rh(25, 0).hr, max: psy_ta_rh(25, 100).hr });
    // 0.05 kg/kg is about 238 % relative humidity at 25 °C.
    expect(quantitiesOutOfRange(slot, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([q.hr]);
    expect(quantitiesOutOfRange(withHumidity(slot, humidityMode.humidityRatio, 0.01), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
  });

  it("gates a dew point at the air temperature, above the library's saturation dew point, and drops the end 0 % has no dew point for", () => {
    // At 25 °C the library reads a 25 °C dew point as 100.95 %.
    const slot = withHumidity(enteredSlotFor(pmvPpdIso, { tdb: 25 }), humidityMode.dewPoint, 25);
    expect(enteredBound(pmvPpdIso, q.dew_point_tmp, slot, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual({ max: psy_ta_rh(25, 100).t_dp });
    expect(quantitiesOutOfRange(slot, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([q.dew_point_tmp]);
  });

  it("converts the bound into the entered humidity ratio at the atmospheric pressure, and gates at it", () => {
    // 0.022 kg/kg is above saturation at 25 °C and 101 325 Pa, and below it at 80 000 Pa.
    const slot = withHumidity(enteredSlotFor(pmvPpdIso, { tdb: 25 }), humidityMode.humidityRatio, 0.022);
    expect(enteredBound(pmvPpdIso, q.hr, slot, LOWER_PRESSURE)).toEqual({
      min: psy_ta_rh(25, 0, LOWER_PRESSURE).hr,
      max: psy_ta_rh(25, 100, LOWER_PRESSURE).hr,
    });
    expect(quantitiesOutOfRange(slot, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([q.hr]);
    expect(quantitiesOutOfRange(slot, pmvPpdIso, LOWER_PRESSURE)).toEqual([]);
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
    expect(quantitiesOutOfRange(slot, heatIndexRothfusz, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
  });

  it("bounds a wet-bulb entry at the mode's wet bulb of 100 %, and gates above it", () => {
    const at25 = (wetBulb: number) => withHumidity(enteredSlotFor(pmvPpdIso, { tdb: 25 }), humidityMode.wetBulb, wetBulb);
    const max = humidityMode.wetBulb.fromRelativeHumidity(100, 25, DEFAULT_ATMOSPHERIC_PRESSURE);
    expect(enteredBound(pmvPpdIso, q.wet_bulb_tmp, at25(20), DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual({ max });
    // A tenth of a degree above: the library's wet bulb is to one decimal.
    expect(outOfRangeRows(at25(max + 0.1), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([
      { quantity: q.wet_bulb_tmp, value: max + 0.1, bound: { max } },
    ]);
    expect(outOfRangeRows(at25(max), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
  });

  it("leaves a wet-bulb entry's lower end open, as the library's wet bulb of 0 % is approximate", () => {
    // 1.5 °C is below the library's wet bulb of 0 % at 10 °C, yet reads back inside the range (open-points B28).
    expect(psy_ta_rh(10, 0).t_wb).toBeGreaterThan(1.5);
    const slot = withHumidity(enteredSlotFor(pmvPpdIso, { tdb: 10, tr: 10 }), humidityMode.wetBulb, 1.5);
    expect(enteredBound(pmvPpdIso, q.wet_bulb_tmp, slot, DEFAULT_ATMOSPHERIC_PRESSURE)?.min).toBeUndefined();
    expect(quantitiesOutOfRange(slot, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
  });

  it("narrows the bound to a model's own relative-humidity row", () => {
    const bounded = {
      ...pmvPpdIso,
      info: { ...pmvPpdIso.info, inputs: { ...pmvPpdIso.info.inputs, rh: { unit: "%", applicability: { min: 30, max: 120 } } } },
    };
    expect(enteredBound(bounded, q.rh, startingSlot(pmvPpdIso), DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual({ min: 30, max: 100 });
    expect(quantitiesOutOfRange(withHumidity(startingSlot(pmvPpdIso), humidityMode.rh, 20), bounded, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([q.rh]);
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
    expect(quantitiesOutOfRange(withHumidity(holdsNone, humidityMode.rh, 150), pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([q.rh]);
    expect(outOfRangeRows(holdsNone, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
  });

  it("does not bound the humidity entry of a model that takes no humidity", () => {
    const slot = withHumidity(startingSlot(pmvPpdIso), humidityMode.rh, 150);
    expect(enteredBound(adaptiveAshrae, q.rh, slot, DEFAULT_ATMOSPHERIC_PRESSURE)).toBeUndefined();
    expect(quantitiesOutOfRange(slot, adaptiveAshrae, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
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

  it("bounds a relative-humidity, dew-point, wet-bulb and vapour-pressure entry as in range", () => {
    for (const mode of [humidityMode.rh, humidityMode.dewPoint, humidityMode.wetBulb, humidityMode.vapourPressure]) {
      const inRange = enteredBound(pmvPpdIso, mode.quantity, at25(mode, 0), DEFAULT_ATMOSPHERIC_PRESSURE);
      expect(inRange, mode.id).toBeDefined();
      for (const pressure of [PRESSURE_ABOVE_RANGE, PRESSURE_BELOW_RANGE]) {
        expect(enteredBound(pmvPpdIso, mode.quantity, at25(mode, 0), pressure), mode.id).toEqual(inRange);
      }
    }
  });

  it("reads which ends a mode is bounded at, and whether its bound reads the pressure, off the mode itself", () => {
    const vapourPressure = humidityMode.vapourPressure;
    const bothEnds = enteredBound(pmvPpdIso, vapourPressure.quantity, at25(vapourPressure, 1000), DEFAULT_ATMOSPHERIC_PRESSURE);
    expect(bothEnds?.min).toBeDefined();
    const upperOnly: HumidityMode = { ...vapourPressure, bounded: "upper" };
    expect(enteredBound(pmvPpdIso, vapourPressure.quantity, at25(upperOnly, 1000), DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual({ max: bothEnds?.max });
    const dewPoint = humidityMode.dewPoint;
    const inRange = enteredBound(pmvPpdIso, dewPoint.quantity, at25(dewPoint, 10), DEFAULT_ATMOSPHERIC_PRESSURE);
    expect(inRange).toBeDefined();
    const readsPressure: HumidityMode = { ...dewPoint, readsPressure: true };
    expect(enteredBound(pmvPpdIso, dewPoint.quantity, at25(readsPressure, 10), DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual(inRange);
    expect(enteredBound(pmvPpdIso, dewPoint.quantity, at25(readsPressure, 10), PRESSURE_ABOVE_RANGE)).toBeUndefined();
  });
});

// Judged apart from the entered values: no slot holds the pressure (ADR-0002 decision 49).
describe("isAtmosphericPressureOutOfRange", () => {
  it("answers out of range below 30 kPa and above 110 kPa, and in range at both ends", () => {
    expect(isAtmosphericPressureOutOfRange(29990)).toBe(true);
    expect(isAtmosphericPressureOutOfRange(30000)).toBe(false);
    expect(isAtmosphericPressureOutOfRange(DEFAULT_ATMOSPHERIC_PRESSURE)).toBe(false);
    expect(isAtmosphericPressureOutOfRange(110000)).toBe(false);
    expect(isAtmosphericPressureOutOfRange(110010)).toBe(true);
  });

  it("answers in range within half a shown step of either end, at two decimals of a kPa", () => {
    expect(isAtmosphericPressureOutOfRange(29996)).toBe(false);
    expect(isAtmosphericPressureOutOfRange(110004)).toBe(false);
    expect(isAtmosphericPressureOutOfRange(29994)).toBe(true);
    expect(isAtmosphericPressureOutOfRange(110006)).toBe(true);
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
      options: new Map([[optionsOf(pmvPpdAshrae)[0], false]]),
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
      options: new Map([[optionsOf(pmvPpdAshrae)[0], false]]),
    };
    expect(quantitiesOutOfRange(slot, pmvPpdAshrae, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
    const rows = violationRows(pmvPpdAshrae, runOn(slot, pmvPpdAshrae, DEFAULT_ATMOSPHERIC_PRESSURE), slot);
    expect(rows.map(({ quantity, bounded, value }) => [quantity, bounded, value])).toEqual([[q.vr, q.vr, 0.237]]);
    expect(rows.map((row) => warningFor(row, unitSystem.si))).toEqual([vrWarning("≤ 0.2", unitSystem.si)]);
  });

  // The library's `clo` of a model with the clothing entry group is the dynamic clothing insulation it is given.
  it("reports a clothing row on the clothing entered, in either clothing mode, bounding the dynamic clothing insulation", () => {
    const warnings = [{ key: "clo", role: "input", value: 2.5, bound: { max: 2 } }];
    const rowOf = (modes: Parameters<typeof violationRows>[2]) =>
      violationRows(pmvPpdIso, { warnings }, modes).map(({ quantity, bounded }) => [quantity, bounded]);
    expect(rowOf(defaultEntryModes)).toEqual([[q.clo, q.clo_dynamic]]);
    expect(rowOf(entryModesWithClothing(clothingMode.corrected))).toEqual([[q.clo_dynamic, q.clo_dynamic]]);
  });

  it("reports a run whose metabolic rate takes the entered clothing past the model's row, naming the dynamic clothing insulation", () => {
    // ASHRAE 55's rule gives 1.8 clo at 1.1 met as itself, over the model's 1.5.
    const slot = enteredSlotFor(pmvPpdAshrae, { met: 1.1, clo: 1.8 });
    expect(outOfRangeRows(slot, pmvPpdAshrae, DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([]);
    const rows = violationRows(pmvPpdAshrae, runOn(slot, pmvPpdAshrae, DEFAULT_ATMOSPHERIC_PRESSURE), slot);
    const clothing = rows.find((row) => row.quantity === q.clo);
    expect(clothing).toMatchObject({ bounded: q.clo_dynamic, value: 1.8, bound: { min: 0, max: 1.5 } });
    expect(clothing && warningFor(clothing, unitSystem.si)).toBe(
      copy.applicabilityWarning(q.clo_dynamic.label, valueWithUnit("0 – 1.5", displayUnitFor(q.clo_dynamic, unitSystem.si))),
    );
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

  // The library judges its bounds exactly; the app judges at the precision a row shows (ADR-0002 decision 56).
  it("names only a value shown outside its bound, and drops a warning a hair over", () => {
    const warningsAt = (value: number) => ({ warnings: [{ key: "clo", role: "input", value, bound: { min: 0, max: 2 } }] });
    expect(violationRows(pmvPpdIso, warningsAt(2.0000000004), defaultEntryModes)).toEqual([]);
    expect(violationRows(pmvPpdIso, warningsAt(2.004), defaultEntryModes)).toEqual([]);
    expect(violationRows(pmvPpdIso, warningsAt(2.006), defaultEntryModes).map((row) => row.quantity)).toEqual([q.clo]);
    // A derived row is judged in its SI display unit: 2700.4 Pa reads 2.7 kPa, 2706 Pa reads 2.71 kPa.
    const derivedAt = (value: number) => ({ warnings: [{ key: "pa", role: "derived", value, bound: { max: 2700 } }] });
    expect(violationRows(pmvPpdIso, derivedAt(2700.4), defaultEntryModes)).toEqual([]);
    expect(violationRows(pmvPpdIso, derivedAt(2706), defaultEntryModes).map((row) => row.quantity)).toEqual([q.pa]);
  });

  it("merges only the bounds a value is shown outside of", () => {
    const warnings = [
      { key: "vr", role: "input", value: 0.803, bound: { min: 0, max: 0.8 } },
      { key: "vr", role: "input", value: 0.803, bound: { max: 0.2 } },
    ];
    expect(violationRows(pmvPpdIso, { warnings }, defaultEntryModes).map((row) => row.bound)).toEqual([{ max: 0.2 }]);
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

describe("formatBound", () => {
  const si = unitSystem.si;
  const ip = unitSystem.ip;

  // The gate compares at this precision, so the end a person reads is accepted (ADR-0002 decision 56).
  it("writes each end as any number is written, nearest at two decimals", () => {
    expect(formatBound({ min: 0, max: 1.875 }, q.clo, si)).toBe("0 – 1.88");
    expect(formatBound({ min: 0, max: 1.934059254 }, q.clo, si)).toBe("0 – 1.93");
    expect(formatBound({ min: 1.654, max: 2 }, q.clo, si)).toBe("1.65 – 2");
  });

  it("writes a one-ended bound with its end nearest", () => {
    expect(formatBound({ min: 1.654 }, q.clo, si)).toBe("≥ 1.65");
    expect(formatBound({ max: 1.875 }, q.clo, si)).toBe("≤ 1.88");
  });

  it("leaves an end of no more than two decimals unchanged", () => {
    expect(formatBound({ min: 0, max: 0.7 }, q.v, si)).toBe("0 – 0.7");
    expect(formatBound({ min: 10, max: 30 }, q.tdb, si)).toBe("10 – 30");
    expect(formatBound({ max: 0.2 }, q.vr, si)).toBe("≤ 0.2");
  });

  it("writes each end nearest in IP, rounded in the IP unit", () => {
    // 0.2 m/s is 39.3700… fpm and 0.15 m/s is 29.5275… fpm; 27 °C is 80.6 °F and 10.03 °C is 50.054 °F.
    expect(formatBound({ min: 0, max: 0.2 }, q.v, ip)).toBe("0 – 39.37");
    expect(formatBound({ max: 0.15 }, q.v, ip)).toBe("≤ 29.53");
    expect(formatBound({ min: 27 }, q.tdb, ip)).toBe("≥ 80.6");
    expect(formatBound({ min: 10.03, max: 30 }, q.tdb, ip)).toBe("50.05 – 86");
    expect(formatBound({ min: 0, max: 1.875 }, q.clo, ip)).toBe("0 – 1.88");
  });

  // inHg's shown step is 33.9 Pa, coarser than the 10 Pa of kPa the gate judges a vapour pressure in.
  it("steps an end inward in IP where the nearest, typed back, would be stopped", () => {
    // 2700 Pa is 0.7973 inHg, and 0.8 inHg is 2709 Pa, which reads 2.71 kPa.
    expect(formatBound({ max: 2700 }, q.pa, ip)).toBe("≤ 0.79");
    expect(formatBound({ max: 2700 }, q.pa, si)).toBe("≤ 2.7");
    expect(formatBound({ min: 2720, max: 3700 }, q.pa, ip)).toBe("0.81 – 1.09");
  });

  it("leaves the atmospheric pressure's range in IP as its ends read nearest", () => {
    expect(formatBound(pressureBound, q.p_atm, ip)).toBe("8.86 – 32.48");
    expect(formatBound({ min: pressureBound.min }, q.p_atm, ip)).toBe("≥ 8.86");
  });

  it("writes ends that, typed into the row, the gate accepts", () => {
    const fahrenheit = displayUnitFor(q.tdb, ip);
    for (let celsius = 0; celsius <= 50; celsius += 0.1) {
      const bound = { min: celsius, max: celsius + 10 };
      for (const end of formatBound(bound, q.tdb, ip).split(" – ")) {
        expect(isShownBeyond(fahrenheit.toSi(Number(end)), bound, displayUnitFor(q.tdb, si)), `${celsius}: ${end}`).toBe(false);
      }
    }
  });
});

/** Every number in a range's text, in the order written. */
function endsOf(range: string): number[] {
  return (range.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
}

describe("formatBound, across the registry", () => {
  const humidityEntries = Object.values(humidityMode);
  /** Every bound an entry of `model` is held to at its starting slot, in each humidity entry mode, and every row of its info. */
  function boundsOf(model: RegisteredModel): (readonly [Quantity, Bound])[] {
    const bounds: (readonly [Quantity, Bound])[] = [];
    const starting = startingSlot(model);
    const slots = starting.humidity ? humidityEntries.map((mode) => withHumidity(starting, mode, 0)) : [starting];
    for (const slot of slots) {
      for (const quantity of Object.values(q)) {
        const bound = enteredBound(model, quantity, slot, DEFAULT_ATMOSPHERIC_PRESSURE);
        if (bound) {
          bounds.push([quantity, bound]);
        }
      }
    }
    for (const [key, variable] of Object.entries(model.info.inputs)) {
      const quantity = quantityFor(key);
      if (quantity && variable.applicability) {
        bounds.push([quantity, variable.applicability]);
      }
    }
    return bounds;
  }

  const bounded = [...registeredModels.flatMap(boundsOf), [q.p_atm, pressureBound] as const];

  it("reads a vapour-pressure bound among them, the one whose end steps", () => {
    expect(bounded.some(([quantity]) => quantity === q.pa)).toBe(true);
  });

  it.each([unitSystem.si, unitSystem.ip])("writes no end the gate would stop when typed back, in $id", (system) => {
    for (const [quantity, bound] of bounded) {
      const unit = displayUnitFor(quantity, system);
      const range = formatBound(bound, quantity, system);
      const ends = endsOf(range);
      expect(ends.length, `${quantity.key}: ${range}`).toBe([bound.min, bound.max].filter((end) => end !== undefined).length);
      for (const end of ends) {
        expect(isShownBeyond(unit.toSi(end), bound, displayUnitFor(quantity, unitSystem.si)), `${quantity.key}: ${range}`).toBe(false);
      }
    }
  });
});

describe("breaksNewLimit", () => {
  const airSpeedAt = (max: number): ViolationRow => ({ quantity: q.v, bounded: q.vr, role: "derived", value: 0.9, bound: { max } });
  const pmvOutput: ViolationRow = { quantity: q.pmv, bounded: q.pmv, role: "output", value: 2.4, bound: { min: -2, max: 2 } };

  it("is true when a limit is broken that was not, from none or beside another", () => {
    expect(breaksNewLimit([], [airSpeedAt(0.64)])).toBe(true);
    expect(breaksNewLimit([airSpeedAt(0.64)], [airSpeedAt(0.64), pmvOutput])).toBe(true);
  });

  it("is false while the same limits stay broken, whatever the bound's numbers or the value, and while they shrink", () => {
    // PMV (ASHRAE 55)'s air-speed rule builds its bound per call, so another temperature moves it.
    expect(breaksNewLimit([airSpeedAt(0.64)], [airSpeedAt(0.8)])).toBe(false);
    expect(breaksNewLimit([airSpeedAt(0.64), pmvOutput], [pmvOutput])).toBe(false);
    expect(breaksNewLimit([pmvOutput], [])).toBe(false);
    expect(breaksNewLimit([], [])).toBe(false);
  });

  it("tells a limit apart by the quantity it bounds and its role, not by the row it is reported on", () => {
    // An air-speed entry-mode switch moves the relative air speed's row from the entered air speed's to its own.
    const onRelativeAirSpeed: ViolationRow = { ...airSpeedAt(0.64), quantity: q.vr };
    const asInput: ViolationRow = { ...airSpeedAt(0.64), role: "input" };
    const ofAnother: ViolationRow = { ...airSpeedAt(0.64), bounded: q.v };
    expect(breaksNewLimit([airSpeedAt(0.64)], [onRelativeAirSpeed])).toBe(false);
    expect(breaksNewLimit([airSpeedAt(0.64)], [asInput])).toBe(true);
    expect(breaksNewLimit([airSpeedAt(0.64)], [ofAnother])).toBe(true);
  });
});
