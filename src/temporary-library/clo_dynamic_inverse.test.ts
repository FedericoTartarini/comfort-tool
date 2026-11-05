import { describe, expect, it } from "vitest";
import { clo_dynamic_ashrae, clo_dynamic_iso_vr } from "jsthermalcomfort";
import { clo_dynamic_ashrae_inverse, clo_dynamic_iso_vr_inverse } from "./clo_dynamic_inverse.ts";

// The oracle is each inverse's forward function: the inverse is right when the
// forward function turns its answer back into the dynamic clothing insulation
// it was given, and when it gives back the clothing insulation the forward
// function took.

/** Metabolic rates from 1 to 4 met, ASHRAE 55's threshold of 1.2 met among them. */
const METABOLIC_RATES = [1, 1.1, 1.2, 1.3, 1.5, 2, 2.5, 3, 3.337, 4];

/** Relative air speeds from 0 to 2 m/s. */
const RELATIVE_AIR_SPEEDS = [0, 0.1, 0.15, 0.4, 0.7, 1, 1.5, 2];

/** Clothing insulations from 0 to 2 clo in steps of 0.01, which is as fine as a person enters one. */
const CLOTHING_INSULATIONS = Array.from({ length: 201 }, (_, step) => step / 100);

/** Dynamic clothing insulations no entry of two decimals need give. */
const DYNAMIC_CLOTHING_INSULATIONS = [0.05, 0.3, 0.5, 0.8, 1, 1.234, 1.5, 2];

/** Values of a type other than a number. */
const NOT_NUMBERS = [null, undefined, true, "1", [1], {}];

/** One condition of a forward function, the clothing insulation aside, with the forward function and its inverse there. */
interface Condition {
  readonly name: string;
  readonly forward: (clo: number) => number;
  readonly inverse: (clo_dynamic: number) => number;
}

/** `clo_dynamic_ashrae` and its inverse at each metabolic rate above. */
const ASHRAE_CONDITIONS: readonly Condition[] = METABOLIC_RATES.map((met) => ({
  name: `${met} met`,
  forward: (clo) => clo_dynamic_ashrae(clo, met),
  inverse: (clo_dynamic) => clo_dynamic_ashrae_inverse(clo_dynamic, met),
}));

/** `clo_dynamic_iso_vr` and its inverse at each metabolic rate and relative air speed above. */
const ISO_CONDITIONS: readonly Condition[] = METABOLIC_RATES.flatMap((met) =>
  RELATIVE_AIR_SPEEDS.map((vr) => ({
    name: `${met} met and ${vr} m/s`,
    forward: (clo: number) => clo_dynamic_iso_vr(clo, met, vr),
    inverse: (clo_dynamic: number) => clo_dynamic_iso_vr_inverse(clo_dynamic, met, vr),
  })),
);

/** Calls `inverse` with arguments its type does not allow. */
const call =
  (inverse: (...args: never[]) => number, ...args: unknown[]) =>
  () =>
    (inverse as (...a: unknown[]) => unknown)(...args);

/** The round trips both inverses share, over the conditions of one forward function. */
function itRoundTrips(conditions: readonly Condition[]) {
  // What the bisection relies on.
  it("is asked of a forward function that never falls as the clothing insulation rises, and gives 0 for 0", () => {
    for (const { name, forward } of conditions) {
      expect(forward(0), name).toBe(0);
      for (let step = 1; step <= 400; step += 1) {
        expect(forward(step / 100), `${name}, ${step / 100} clo`).toBeGreaterThanOrEqual(forward((step - 1) / 100));
      }
    }
  });

  it("gives back the clothing insulation the forward function took", () => {
    for (const { name, forward, inverse } of conditions) {
      for (const clo of CLOTHING_INSULATIONS) {
        expect(inverse(forward(clo)), `${name}, ${clo} clo`).toBe(clo);
      }
    }
  });

  it("gives a clothing insulation the forward function turns back into the dynamic one", () => {
    for (const { name, forward, inverse } of conditions) {
      for (const clo_dynamic of DYNAMIC_CLOTHING_INSULATIONS) {
        expect(forward(inverse(clo_dynamic)), `${name}, ${clo_dynamic} clo`).toBeCloseTo(clo_dynamic, 8);
      }
    }
  });

  it("gives 0 for 0", () => {
    for (const { name, inverse } of conditions) expect(inverse(0), name).toBe(0);
  });

  it("is settled after one round: inverting what its answer is corrected to gives the answer again", () => {
    for (const { name, forward, inverse } of conditions) {
      for (const clo_dynamic of [0.3, 0.8, 1.234]) {
        const clo = inverse(clo_dynamic);
        expect(inverse(forward(clo)), `${name}, ${clo_dynamic} clo`).toBe(clo);
      }
    }
  });
}

describe("clo_dynamic_ashrae_inverse", () => {
  itRoundTrips(ASHRAE_CONDITIONS);

  it("never gives a clothing insulation corrected to less than the dynamic one, at a step of the rounding", () => {
    // 0.285 clo is corrected to 0.199, a float short of the step to 0.2.
    expect(clo_dynamic_ashrae(0.285, 4)).toBe(0.199);
    for (let step = 1; step <= 2000; step += 1) {
      const clo_dynamic = step / 1000;
      expect(clo_dynamic_ashrae(clo_dynamic_ashrae_inverse(clo_dynamic, 4), 4), `${clo_dynamic} clo`).toBe(clo_dynamic);
    }
  });

  // `clo_dynamic_ashrae` rounds to 0.001, so what it never gives has no inverse.
  it("gives, for a dynamic clothing insulation the forward function never gives, the clothing corrected to the next one above", () => {
    expect(clo_dynamic_ashrae(clo_dynamic_ashrae_inverse(0.8005, 2), 2)).toBe(0.801);
  });

  it("gives a clothing insulation of three decimals back as its neighbour where the rounding gives both one value", () => {
    expect(clo_dynamic_ashrae(0.007, 1.25)).toBe(clo_dynamic_ashrae(0.006, 1.25));
    expect(clo_dynamic_ashrae_inverse(clo_dynamic_ashrae(0.007, 1.25), 1.25)).toBe(0.006);
  });

  it("inverts the correction above 1.2 met to the roundest clothing insulation that gives the dynamic one", () => {
    expect(clo_dynamic_ashrae(1, 2)).toBe(0.8);
    expect(clo_dynamic_ashrae_inverse(0.8, 2)).toBe(1);
  });

  it("is the identity where the correction is, at or below 1.2 met", () => {
    for (const met of [1, 1.1, 1.2]) {
      for (const clo_dynamic of [0.5, 0.84, 1.934, 0.123456789]) {
        expect(clo_dynamic_ashrae_inverse(clo_dynamic, met), `${met} met`).toBe(clo_dynamic);
      }
    }
  });

  it("inverts a dynamic clothing insulation past 1 clo, where the search starts", () => {
    expect(clo_dynamic_ashrae_inverse(8, 2)).toBe(10);
  });

  it("gives a dynamic clothing insulation below 0 back as it is, since no clothing insulation gives it", () => {
    expect(clo_dynamic_ashrae_inverse(-0.5, 2)).toBe(-0.5);
  });

  it("returns NaN for a NaN argument, where the correction would give the clothing insulation back", () => {
    expect(clo_dynamic_ashrae(1, NaN)).toBe(1);
    expect(clo_dynamic_ashrae_inverse(1, NaN)).toBeNaN();
    expect(clo_dynamic_ashrae_inverse(NaN, 2)).toBeNaN();
  });

  it("throws TypeError for an argument of the wrong type, naming it", () => {
    for (const bad of NOT_NUMBERS) {
      expect(call(clo_dynamic_ashrae_inverse, bad, 2)).toThrow(new TypeError("clo_dynamic must be a number."));
      expect(call(clo_dynamic_ashrae_inverse, 0.8, bad)).toThrow(new TypeError("met must be a number."));
    }
  });
});

describe("clo_dynamic_iso_vr_inverse", () => {
  itRoundTrips(ISO_CONDITIONS);

  it("inverts the correction, which has no closed inverse", () => {
    expect(clo_dynamic_iso_vr_inverse(clo_dynamic_iso_vr(1, 2, 0.4), 2, 0.4)).toBe(1);
    // More clothing than the dynamic value in still, seated air: the correction raises it there.
    expect(clo_dynamic_iso_vr(clo_dynamic_iso_vr_inverse(2, 1, 0), 1, 0)).toBeCloseTo(2, 8);
    expect(clo_dynamic_iso_vr_inverse(2, 1, 0)).toBeCloseTo(1.934, 3);
  });

  it("inverts the correction at the boundary air layer insulation it is given, 0.7 clo by default", () => {
    expect(clo_dynamic_iso_vr_inverse(clo_dynamic_iso_vr(1, 2, 0.4, 0.5), 2, 0.4, 0.5)).toBe(1);
    expect(clo_dynamic_iso_vr_inverse(0.8, 2, 0.4)).toBe(clo_dynamic_iso_vr_inverse(0.8, 2, 0.4, 0.7));
  });

  it("gives a dynamic clothing insulation below 0 back as it is, since no clothing insulation gives it", () => {
    expect(clo_dynamic_iso_vr_inverse(-0.5, 2, 0.4)).toBe(-0.5);
  });

  it("returns NaN for a NaN argument", () => {
    expect(clo_dynamic_iso_vr_inverse(NaN, 2, 0.4)).toBeNaN();
    expect(clo_dynamic_iso_vr_inverse(0.8, NaN, 0.4)).toBeNaN();
    expect(clo_dynamic_iso_vr_inverse(0.8, 2, NaN)).toBeNaN();
    expect(clo_dynamic_iso_vr_inverse(0.8, 2, 0.4, NaN)).toBeNaN();
  });

  it("throws TypeError for an argument of the wrong type, naming it", () => {
    for (const bad of NOT_NUMBERS) {
      expect(call(clo_dynamic_iso_vr_inverse, bad, 2, 0.4)).toThrow(new TypeError("clo_dynamic must be a number."));
      expect(call(clo_dynamic_iso_vr_inverse, 0.8, bad, 0.4)).toThrow(new TypeError("met must be a number."));
      expect(call(clo_dynamic_iso_vr_inverse, 0.8, 2, bad)).toThrow(new TypeError("vr must be a number."));
    }
    // An `i_a` left out takes its default, so `undefined` is not a wrong type there.
    for (const bad of NOT_NUMBERS.filter((value) => value !== undefined)) {
      expect(call(clo_dynamic_iso_vr_inverse, 0.8, 2, 0.4, bad)).toThrow(new TypeError("i_a must be a number."));
    }
  });
});
