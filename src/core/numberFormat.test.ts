import { describe, expect, it } from "vitest";
import { formatNumber, shownAtLeast, shownAtMost } from "./numberFormat";

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

describe("shownAtMost / shownAtLeast", () => {
  it("keep a number that has no more decimals than the formatter", () => {
    for (const value of [0, 0.7, 0.29, 1.5, 30, -0.19]) {
      expect(shownAtMost(value), String(value)).toBe(value);
      expect(shownAtLeast(value), String(value)).toBe(value);
    }
  });

  it("give the formatter's step on either side of a number with more decimals", () => {
    expect(shownAtMost(1.934059254)).toBe(1.93);
    expect(shownAtMost(1.875)).toBe(1.87);
    expect(shownAtLeast(1.657136061)).toBe(1.66);
    expect(shownAtLeast(1.934059254)).toBe(1.94);
    expect(shownAtMost(-0.195)).toBe(-0.2);
  });
});
