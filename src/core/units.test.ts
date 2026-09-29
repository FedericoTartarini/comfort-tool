import { describe, expect, it } from "vitest";
import { copy } from "$lib/text/copy";
import { humidityMode } from "./entryModes";
import { formatNumber } from "./numberFormat";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities } from "./quantities";
import { displayUnitFor, labelWithUnit, numberWithUnit, valueWithUnit } from "./units";
import { unitSystem } from "./unitSystem";

describe("displayUnitFor", () => {
  it("converts temperature between °C and °F", () => {
    const fahrenheit = displayUnitFor(quantities.tdb, unitSystem.ip);
    expect(fahrenheit.symbol).toBe("°F");
    expect(fahrenheit.fromSi(0)).toBeCloseTo(32);
    expect(fahrenheit.fromSi(100)).toBeCloseTo(212);
    expect(fahrenheit.toSi(212)).toBeCloseTo(100);
    expect(fahrenheit.toSi(-40)).toBeCloseTo(-40);
  });

  it("converts air speed between m/s and fpm, not the library's fps", () => {
    const feetPerMinute = displayUnitFor(quantities.v, unitSystem.ip);
    expect(feetPerMinute.symbol).toBe("fpm");
    expect(feetPerMinute.fromSi(1)).toBeCloseTo(196.85, 2);
    expect(feetPerMinute.toSi(196.850394)).toBeCloseTo(1, 6);
  });

  it("converts pressure from the library's pascals to kPa and inHg", () => {
    const kilopascals = displayUnitFor(quantities.pa, unitSystem.si);
    expect(kilopascals.symbol).toBe("kPa");
    expect(kilopascals.fromSi(2700)).toBe(2.7);
    expect(kilopascals.toSi(2.7)).toBeCloseTo(2700, 9);
    const inchesOfMercury = displayUnitFor(quantities.pa, unitSystem.ip);
    expect(inchesOfMercury.fromSi(101325)).toBeCloseTo(29.92, 2);
    expect(inchesOfMercury.toSi(29.92)).toBeCloseTo(101325, -1);
  });

  it("shows atmospheric pressure in the library's pascals in SI, so 101325 reads as 101325, and in inHg in IP", () => {
    const pascals = displayUnitFor(quantities.p_atm, unitSystem.si);
    expect(pascals.fromSi(101325)).toBe(101325);
    expect(pascals.toSi(101325)).toBe(101325);
    expect(formatNumber(pascals.fromSi(101325))).toBe("101325");
    const inchesOfMercury = displayUnitFor(quantities.p_atm, unitSystem.ip);
    expect(inchesOfMercury.fromSi(101325)).toBeCloseTo(29.92, 2);
    expect(inchesOfMercury.toSi(29.92)).toBeCloseTo(101325, -1);
  });

  it("shows humidity ratio in g/kg, so 30, 50 and 70 % relative humidity at 25 °C read apart", () => {
    const gramsPerKilogram = displayUnitFor(quantities.hr, unitSystem.si);
    expect(gramsPerKilogram.symbol).toBe("g/kg");
    const shown = [30, 50, 70].map((rh) =>
      formatNumber(gramsPerKilogram.fromSi(humidityMode.humidityRatio.fromRelativeHumidity(rh, 25, DEFAULT_ATMOSPHERIC_PRESSURE))),
    );
    expect(shown).toEqual(["5.89", "9.88", "13.92"]);
    expect(gramsPerKilogram.toSi(9.88)).toBeCloseTo(0.00988, 12);
  });

  it("shows humidity ratio in the deployed tool's lb/klb in IP, the same number as g/kg", () => {
    const poundsPerKilopound = displayUnitFor(quantities.hr, unitSystem.ip);
    expect(poundsPerKilopound.symbol).toBe("lb/klb");
    expect(poundsPerKilopound.fromSi(0.00988)).toBeCloseTo(9.88, 12);
    expect(poundsPerKilopound.toSi(13.92)).toBeCloseTo(0.01392, 12);
    const stored = humidityMode.humidityRatio.fromRelativeHumidity(50, 25, DEFAULT_ATMOSPHERIC_PRESSURE);
    expect(poundsPerKilopound.toSi(poundsPerKilopound.fromSi(stored))).toBeCloseTo(stored, 15);
  });

  it("is the identity in SI and for quantities that do not convert", () => {
    for (const quantity of [quantities.tdb, quantities.v, quantities.met, quantities.clo, quantities.rh]) {
      expect(displayUnitFor(quantity, unitSystem.si).fromSi(1.234)).toBe(1.234);
    }
    expect(displayUnitFor(quantities.met, unitSystem.ip).fromSi(1.1)).toBe(1.1);
    expect(displayUnitFor(quantities.rh, unitSystem.ip).symbol).toBe("%");
  });

  it("round-trips without drift", () => {
    for (const quantity of Object.values(quantities)) {
      for (const system of Object.values(unitSystem)) {
        const unit = displayUnitFor(quantity, system);
        for (const value of [-40, 0, 0.1, 25.37, 1000]) {
          expect(unit.toSi(unit.fromSi(value))).toBeCloseTo(value, 10);
        }
      }
    }
  });

  it("takes the step from the displayed unit", () => {
    expect(displayUnitFor(quantities.v, unitSystem.si).step).toBe(0.05);
    expect(displayUnitFor(quantities.v, unitSystem.ip).step).toBe(10);
    expect(displayUnitFor(quantities.tdb, unitSystem.ip).step).toBe(0.1);
    // 1 g/kg is the deployed tool's input step of 0.001 kg/kg.
    expect(displayUnitFor(quantities.hr, unitSystem.si).step).toBe(1);
    expect(displayUnitFor(quantities.hr, unitSystem.ip).step).toBe(1);
  });
});

describe("labelWithUnit", () => {
  it("puts the display unit in brackets after the label", () => {
    expect(labelWithUnit(quantities.tdb, displayUnitFor(quantities.tdb, unitSystem.ip))).toBe("Dry-bulb air temperature (°F)");
  });

  it("is the bare label when the unit has no symbol", () => {
    expect(labelWithUnit(quantities.pmv, displayUnitFor(quantities.pmv, unitSystem.si))).toBe(quantities.pmv.label);
  });
});

describe("valueWithUnit", () => {
  it("puts the symbol after the value, a space between them", () => {
    expect(valueWithUnit("6.15", displayUnitFor(quantities.ppd, unitSystem.si))).toBe("6.15 %");
    expect(valueWithUnit("≤ 0.2", displayUnitFor(quantities.v, unitSystem.si))).toBe("≤ 0.2 m/s");
  });

  it("is the bare value when the unit has no symbol", () => {
    expect(valueWithUnit("0.5", displayUnitFor(quantities.pmv, unitSystem.si))).toBe("0.5");
  });
});

describe("numberWithUnit", () => {
  it("converts the SI number to the display unit, formats it and adds the symbol", () => {
    expect(numberWithUnit(25, displayUnitFor(quantities.tdb, unitSystem.si))).toBe("25 °C");
    expect(numberWithUnit(25, displayUnitFor(quantities.tdb, unitSystem.ip))).toBe("77 °F");
  });

  it("is the bare number when the unit has no symbol", () => {
    expect(numberWithUnit(0.126, displayUnitFor(quantities.pmv, unitSystem.si))).toBe("0.13");
  });

  it("is the dash for a value that is not a finite number", () => {
    const celsius = displayUnitFor(quantities.tdb, unitSystem.si);
    expect(numberWithUnit(Number.NaN, celsius)).toBe(copy.notAvailable);
    expect(numberWithUnit(Number.POSITIVE_INFINITY, celsius)).toBe(copy.notAvailable);
  });
});
