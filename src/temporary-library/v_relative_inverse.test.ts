import { describe, expect, it } from "vitest";
import { v_relative } from "jsthermalcomfort";
import { v_relative_inverse } from "./v_relative_inverse.ts";

// The oracle is the library's own `v_relative`: the inverse is right when
// `v_relative` turns its answer back into the relative air speed it was given.

/** Metabolic rates from 1 to 4 met in steps of 0.001, which is as fine as `v_relative` rounds the activity's share. */
const METABOLIC_RATES = Array.from({ length: 3001 }, (_, step) => 1 + step / 1000);

/** Values of a type other than a number. */
const NOT_NUMBERS = [null, undefined, true, "1", [1], {}];

/** Calls the inverse with arguments its type does not allow. */
const call = (...args: unknown[]) => () => (v_relative_inverse as (...a: unknown[]) => unknown)(...args);

describe("v_relative_inverse", () => {
  it("takes the activity-generated air speed off above 1 met", () => {
    expect(v_relative_inverse(0.7, 2)).toBe(0.4);
    expect(v_relative(0.4, 2)).toBe(0.7);
  });

  it("is the identity at or below 1 met, as v_relative is", () => {
    expect(v_relative_inverse(0.7, 1)).toBe(0.7);
    expect(v_relative_inverse(0.7, 0.8)).toBe(0.7);
  });

  it("gives still air back as exactly 0 at every metabolic rate", () => {
    for (const met of METABOLIC_RATES) {
      expect(v_relative_inverse(v_relative(0, met), met), `${met} met`).toBe(0);
    }
  });

  it("gives an air speed that v_relative turns back into the relative air speed, at every metabolic rate", () => {
    for (const met of METABOLIC_RATES) {
      for (const v of [0.1, 0.123, 0.4, 1, 2]) {
        const vr = v_relative(v, met);
        expect(v_relative(v_relative_inverse(vr, met), met), `${v} m/s at ${met} met`).toBe(vr);
      }
    }
  });

  it("gives an air speed of three decimals back within v_relative's rounding of 0.001", () => {
    for (const met of METABOLIC_RATES) {
      const v = v_relative_inverse(v_relative(0.123, met), met);
      expect(Math.abs(v - 0.123), `${met} met`).toBeLessThanOrEqual(0.0005 + 1e-9);
    }
  });

  it("is negative for a relative air speed below the activity's share, which no air speed gives", () => {
    expect(v_relative_inverse(0.1, 2)).toBe(-0.2);
  });

  it("keeps nine decimals, so the subtraction's float noise is not the answer", () => {
    expect(v_relative_inverse(0.7, 1.3)).toBe(0.61);
  });

  it("returns NaN for a NaN argument, at or below 1 met and above it", () => {
    for (const met of [0.8, 1, 2]) expect(v_relative_inverse(NaN, met), `${met} met`).toBeNaN();
    expect(v_relative_inverse(0.7, NaN)).toBeNaN();
  });

  it("throws TypeError for an argument of the wrong type, naming it", () => {
    for (const bad of NOT_NUMBERS) {
      expect(call(bad, 2)).toThrow(new TypeError("vr must be a number."));
      expect(call(0.7, bad)).toThrow(new TypeError("met must be a number."));
    }
  });
});
