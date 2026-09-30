import { describe, expect, it } from "vitest";
import { clo_dynamic_ashrae, clo_dynamic_iso_vr } from "jsthermalcomfort";
import { clo_dynamic_inverse } from "./clo_dynamic_inverse.ts";

// The oracle is the library's own two corrections: the inverse is right when
// the correction turns its answer back into the dynamic clothing insulation it
// was given, and when it gives back the clothing insulation a correction took.

/** Metabolic rates from 1 to 4 met, ASHRAE 55's threshold of 1.2 met among them. */
const METABOLIC_RATES = [1, 1.1, 1.2, 1.3, 1.5, 2, 2.5, 3, 3.337, 4];

/** Relative air speeds from 0 to 2 m/s. */
const RELATIVE_AIR_SPEEDS = [0, 0.1, 0.15, 0.4, 0.7, 1, 1.5, 2];

/** Clothing insulations from 0 to 2 clo in steps of 0.01, which is as fine as a person enters one. */
const CLOTHING_INSULATIONS = Array.from({ length: 201 }, (_, step) => step / 100);

/** Each library correction at every metabolic rate and relative air speed above, as a function of the clothing insulation alone. */
const CORRECTIONS = METABOLIC_RATES.flatMap((met) => [
  { name: `clo_dynamic_ashrae at ${met} met`, correction: (clo: number) => clo_dynamic_ashrae(clo, met) },
  ...RELATIVE_AIR_SPEEDS.map((vr) => ({
    name: `clo_dynamic_iso_vr at ${met} met and ${vr} m/s`,
    correction: (clo: number) => clo_dynamic_iso_vr(clo, met, vr),
  })),
]);

describe("clo_dynamic_inverse", () => {
  // What the bisection relies on.
  it("is asked of corrections that never fall as the clothing insulation rises, and give 0 for 0", () => {
    for (const { name, correction } of CORRECTIONS) {
      expect(correction(0), name).toBe(0);
      for (let step = 1; step <= 400; step += 1) {
        expect(correction(step / 100), `${name}, ${step / 100} clo`).toBeGreaterThanOrEqual(correction((step - 1) / 100));
      }
    }
  });

  it("gives back the clothing insulation a correction took", () => {
    for (const { name, correction } of CORRECTIONS) {
      for (const clo of CLOTHING_INSULATIONS) {
        expect(clo_dynamic_inverse({ clo_dynamic: correction(clo), correction }), `${name}, ${clo} clo`).toBe(clo);
      }
    }
  });

  it("gives a clothing insulation the correction turns back into the dynamic one", () => {
    for (const { name, correction } of CORRECTIONS) {
      for (const clo_dynamic of [0.05, 0.3, 0.5, 0.8, 1, 1.234, 1.5, 2]) {
        const clo = clo_dynamic_inverse({ clo_dynamic, correction });
        expect(correction(clo), `${name}, ${clo_dynamic} clo`).toBeCloseTo(clo_dynamic, 8);
      }
    }
  });

  it("never gives a clothing insulation corrected to less than the dynamic one, at a step of a correction that rounds", () => {
    const correction = (clo: number) => clo_dynamic_ashrae(clo, 4);
    // 0.285 clo is corrected to 0.199, a float short of the step to 0.2.
    expect(correction(0.285)).toBe(0.199);
    for (let step = 1; step <= 2000; step += 1) {
      const clo_dynamic = step / 1000;
      expect(correction(clo_dynamic_inverse({ clo_dynamic, correction })), `${clo_dynamic} clo`).toBe(clo_dynamic);
    }
  });

  // `clo_dynamic_ashrae` rounds to 0.001, so what it never gives has no inverse.
  it("gives, for a dynamic clothing insulation a rounding correction never gives, the clothing corrected to the next one above", () => {
    const correction = (clo: number) => clo_dynamic_ashrae(clo, 2);
    expect(correction(clo_dynamic_inverse({ clo_dynamic: 0.8005, correction }))).toBe(0.801);
  });

  it("gives a clothing insulation of three decimals back as its neighbour where the correction's rounding gives both one value", () => {
    const correction = (clo: number) => clo_dynamic_ashrae(clo, 1.25);
    expect(correction(0.007)).toBe(correction(0.006));
    expect(clo_dynamic_inverse({ clo_dynamic: correction(0.007), correction })).toBe(0.006);
  });

  it("inverts ASHRAE 55's correction above 1.2 met to the roundest clothing insulation that gives the dynamic one", () => {
    expect(clo_dynamic_ashrae(1, 2)).toBe(0.8);
    expect(clo_dynamic_inverse({ clo_dynamic: 0.8, correction: (clo) => clo_dynamic_ashrae(clo, 2) })).toBe(1);
  });

  it("is the identity where the correction is: ASHRAE 55's at or below 1.2 met", () => {
    for (const met of [1, 1.1, 1.2]) {
      for (const clo_dynamic of [0.5, 0.84, 1.934, 0.123456789]) {
        expect(clo_dynamic_inverse({ clo_dynamic, correction: (clo) => clo_dynamic_ashrae(clo, met) }), `${met} met`).toBe(clo_dynamic);
      }
    }
  });

  it("inverts ISO 7730's correction, which has no closed inverse", () => {
    const correction = (clo: number) => clo_dynamic_iso_vr(clo, 2, 0.4);
    expect(clo_dynamic_inverse({ clo_dynamic: correction(1), correction })).toBe(1);
    // More clothing than the dynamic value in still, seated air: the correction raises it there.
    const seated = (clo: number) => clo_dynamic_iso_vr(clo, 1, 0);
    expect(seated(clo_dynamic_inverse({ clo_dynamic: 2, correction: seated }))).toBeCloseTo(2, 8);
    expect(clo_dynamic_inverse({ clo_dynamic: 2, correction: seated })).toBeCloseTo(1.934, 3);
  });

  it("inverts a dynamic clothing insulation past 1 clo, where the search starts", () => {
    const correction = (clo: number) => clo_dynamic_ashrae(clo, 2);
    expect(clo_dynamic_inverse({ clo_dynamic: 8, correction })).toBe(10);
  });

  it("ends, at Infinity, for a correction that never reaches the dynamic clothing insulation", () => {
    expect(clo_dynamic_inverse({ clo_dynamic: 2, correction: (clo) => Math.min(clo, 1) })).toBe(Infinity);
  });

  it("gives 0 for 0", () => {
    for (const { name, correction } of CORRECTIONS) {
      expect(clo_dynamic_inverse({ clo_dynamic: 0, correction }), name).toBe(0);
    }
  });

  it("gives a dynamic clothing insulation below 0 back as it is: no clothing insulation gives it", () => {
    expect(clo_dynamic_inverse({ clo_dynamic: -0.5, correction: (clo) => clo_dynamic_iso_vr(clo, 2, 0.4) })).toBe(-0.5);
  });

  it("is settled after one round: inverting what its answer is corrected to gives the answer again", () => {
    for (const { name, correction } of CORRECTIONS) {
      for (const clo_dynamic of [0.3, 0.8, 1.234]) {
        const clo = clo_dynamic_inverse({ clo_dynamic, correction });
        expect(clo_dynamic_inverse({ clo_dynamic: correction(clo), correction }), `${name}, ${clo_dynamic} clo`).toBe(clo);
      }
    }
  });
});
