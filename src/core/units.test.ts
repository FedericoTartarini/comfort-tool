import { describe, expect, it } from "vitest";
import { quantities } from "jsthermalcomfort/io";
import { displayUnitFor } from "./units";
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
    const kilopascals = displayUnitFor(quantities.p_vap, unitSystem.si);
    expect(kilopascals.symbol).toBe("kPa");
    expect(kilopascals.fromSi(2700)).toBe(2.7);
    expect(kilopascals.toSi(2.7)).toBeCloseTo(2700, 9);
    const inchesOfMercury = displayUnitFor(quantities.p_atm, unitSystem.ip);
    expect(inchesOfMercury.fromSi(101325)).toBeCloseTo(29.92, 2);
    expect(inchesOfMercury.toSi(29.92)).toBeCloseTo(101325, -1);
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
  });
});
