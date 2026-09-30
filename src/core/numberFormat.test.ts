import { describe, expect, it } from "vitest";
import { formatNumber, shownNumber } from "./numberFormat";
import { quantities } from "./quantities";
import { displayUnitFor } from "./units";
import { unitSystem } from "./unitSystem";

describe("formatNumber", () => {
  it("strips trailing zeros", () => {
    expect(formatNumber(26.0)).toBe("26");
    expect(formatNumber(78.8)).toBe("78.8");
    expect(formatNumber(0.5)).toBe("0.5");
  });

  it("keeps at most two decimals", () => {
    expect(formatNumber(0.51)).toBe("0.51");
    expect(formatNumber(78.804)).toBe("78.8");
    expect(formatNumber(0.126)).toBe("0.13");
    expect(formatNumber(-0.19)).toBe("-0.19");
  });

  it("never prints negative zero", () => {
    expect(formatNumber(-0.001)).toBe("0");
    expect(formatNumber(-0)).toBe("0");
  });

  it("formats non-finite values as empty", () => {
    expect(formatNumber(Number.NaN)).toBe("");
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe("");
  });
});

describe("shownNumber", () => {
  const clo = displayUnitFor(quantities.clo, unitSystem.si);
  const feetPerMinute = displayUnitFor(quantities.v, unitSystem.ip);
  const fahrenheit = displayUnitFor(quantities.tdb, unitSystem.ip);
  const gramsPerKilogram = displayUnitFor(quantities.hr, unitSystem.si);

  it("gives the nearest number a row shows when there is no bound", () => {
    expect(shownNumber(0.4238, clo)).toBe(0.42);
    expect(shownNumber(0.126, clo)).toBe(0.13);
    expect(shownNumber(-0.196, clo)).toBe(-0.2);
    expect(shownNumber(-0.001, clo)).toBe(0);
  });

  it("returns a number of no more than two decimals as it is", () => {
    for (const value of [0, 0.7, 0.29, 1.5, 30, -0.19]) {
      expect(shownNumber(value, clo), String(value)).toBe(value);
      expect(shownNumber(value, clo, { min: value, max: value }), String(value)).toBe(value);
    }
  });

  it("gives the neighbour inside the bound when the value is inside and the nearest is not", () => {
    // At an upper end: 1.875 rounds to 1.88, above it.
    expect(shownNumber(1.875, clo, { min: 0, max: 1.875 })).toBe(1.87);
    expect(shownNumber(1.8751, clo, { min: 0, max: 1.8755 })).toBe(1.87);
    // At a lower end: 1.6549 rounds to 1.65, below it.
    expect(shownNumber(1.6549, clo, { min: 1.6548 })).toBe(1.66);
    expect(shownNumber(1.6548, clo, { min: 1.6548, max: 2 })).toBe(1.66);
  });

  it("gives the nearest inside a bound that the nearest satisfies", () => {
    expect(shownNumber(1.934059254, clo, { min: 0, max: 1.934059254 })).toBe(1.93);
    expect(shownNumber(1.657136061, clo, { min: 1.657136061 })).toBe(1.66);
    expect(shownNumber(0.4238, clo, { min: 0, max: 1.5 })).toBe(0.42);
  });

  it("gives the nearest when the value itself is outside the bound, for the gate to mark", () => {
    expect(shownNumber(1.8751, clo, { min: 0, max: 1.875 })).toBe(1.88);
    expect(shownNumber(2.004, clo, { min: 0, max: 1.875 })).toBe(2);
    expect(shownNumber(-0.204, clo, { min: 0 })).toBe(-0.2);
  });

  it("rounds in a display unit whose conversion is not the identity, and answers in SI", () => {
    // 0.15 m/s is 29.5275… fpm, 25.33 °C is 77.594 °F, 0.007886 kg/kg is 7.886 g/kg.
    expect(shownNumber(0.15, feetPerMinute)).toBe(feetPerMinute.toSi(29.53));
    expect(shownNumber(0.15, feetPerMinute, { min: 0, max: 0.15 })).toBe(feetPerMinute.toSi(29.52));
    expect(shownNumber(25.33, fahrenheit)).toBe(fahrenheit.toSi(77.59));
    expect(shownNumber(25.33, fahrenheit, { min: 25.33 })).toBe(fahrenheit.toSi(77.6));
    expect(shownNumber(0.007886, gramsPerKilogram)).toBe(gramsPerKilogram.toSi(7.89));
    expect(shownNumber(0.007886, gramsPerKilogram, { max: 0.007886 })).toBe(gramsPerKilogram.toSi(7.88));
  });

  it("keeps an end that has no more than two decimals in the display unit, whatever it converts back to", () => {
    // 27 °C is 80.6 °F, and 80.6 °F converts back to a hair under 27 °C.
    expect(shownNumber(27, fahrenheit, { min: 27 })).toBe(fahrenheit.toSi(80.6));
    expect(shownNumber(28, fahrenheit, { max: 28 })).toBe(fahrenheit.toSi(82.4));
    expect(shownNumber(0.00071, gramsPerKilogram, { min: 0.00071 })).toBe(gramsPerKilogram.toSi(0.71));
  });
});
