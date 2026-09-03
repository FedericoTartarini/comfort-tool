import { describe, expect, it } from "vitest";
import { formatNumber } from "./numberFormat";

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
