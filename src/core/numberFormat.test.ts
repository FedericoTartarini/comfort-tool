import { describe, expect, it } from "vitest";
import { formatNumber, isShownBeyond } from "./numberFormat";
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

describe("isShownBeyond", () => {
  const clo = displayUnitFor(quantities.clo, unitSystem.si);
  const fahrenheit = displayUnitFor(quantities.tdb, unitSystem.ip);
  const gramsPerKilogram = displayUnitFor(quantities.hr, unitSystem.si);

  it("answers no for a value inside the bound, and yes for one outside it", () => {
    expect(isShownBeyond(1, { min: 0, max: 2 }, clo)).toBe(false);
    expect(isShownBeyond(2.5, { min: 0, max: 2 }, clo)).toBe(true);
    expect(isShownBeyond(-0.2, { min: 0, max: 2 }, clo)).toBe(true);
  });

  it("answers no at both ends, and within half a shown step of either", () => {
    expect(isShownBeyond(0, { min: 0, max: 2 }, clo)).toBe(false);
    expect(isShownBeyond(2, { min: 0, max: 2 }, clo)).toBe(false);
    expect(isShownBeyond(2.0000000004, { min: 0, max: 2 }, clo)).toBe(false);
    expect(isShownBeyond(-0.004, { min: 0, max: 2 }, clo)).toBe(false);
    expect(isShownBeyond(2.006, { min: 0, max: 2 }, clo)).toBe(true);
    expect(isShownBeyond(-0.006, { min: 0, max: 2 }, clo)).toBe(true);
  });

  it("judges a bound end that is not a shown number as the row shows it", () => {
    // 1.875 reads 1.88, and so do 1.8751 and 1.88 itself; 1.885 reads 1.89.
    const bound = { min: 0, max: 1.875 };
    for (const inside of [1.8749, 1.875, 1.8751, 1.88]) {
      expect(isShownBeyond(inside, bound, clo), String(inside)).toBe(false);
    }
    expect(isShownBeyond(1.885, bound, clo)).toBe(true);
    // At a lower end: 1.6549 reads 1.65, and so does 1.651.
    expect(isShownBeyond(1.651, { min: 1.6549 }, clo)).toBe(false);
    expect(isShownBeyond(1.644, { min: 1.6549 }, clo)).toBe(true);
  });

  it("rounds in the display unit, where the conversion is not the identity", () => {
    // 0.0198765 kg/kg is 19.8765 g/kg, which reads 19.88; two decimals of kg/kg would pass everything here.
    expect(isShownBeyond(0.01988, { max: 0.0198765 }, gramsPerKilogram)).toBe(false);
    expect(isShownBeyond(0.01989, { max: 0.0198765 }, gramsPerKilogram)).toBe(true);
    // 27 °C is 80.6 °F, and 80.6 °F converts back to a hair under 27 °C.
    expect(fahrenheit.toSi(80.6)).toBeLessThan(27);
    expect(isShownBeyond(fahrenheit.toSi(80.6), { min: 27 }, fahrenheit)).toBe(false);
    expect(isShownBeyond(fahrenheit.toSi(80.59), { min: 27 }, fahrenheit)).toBe(true);
  });

  it("answers no for any value under a bound with no end", () => {
    expect(isShownBeyond(1e9, {}, clo)).toBe(false);
    expect(isShownBeyond(-1e9, {}, clo)).toBe(false);
  });

  it("judges a bound with one end at that end only", () => {
    expect(isShownBeyond(-1e9, { max: 2 }, clo)).toBe(false);
    expect(isShownBeyond(2.01, { max: 2 }, clo)).toBe(true);
    expect(isShownBeyond(1e9, { min: 0 }, clo)).toBe(false);
    expect(isShownBeyond(-0.01, { min: 0 }, clo)).toBe(true);
  });
});
