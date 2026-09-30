import { describe, expect, it } from "vitest";
import { clo_dynamic_ashrae, clo_dynamic_iso, Standard, v_relative } from "jsthermalcomfort";
import { clo_dynamic_inverse } from "$lib/temporary-library/clo_dynamic_inverse";
import { clothingCorrectionFor, type ClothingCorrection } from "./clothingCorrection";

/** Above and below ASHRAE 55's 1.2 met, and at it. */
const METABOLIC_RATES = [0.8, 1, 1.1, 1.2, 1.21, 2, 4];

describe("clothingCorrectionFor", () => {
  it("corrects by the library's clo_dynamic_ashrae under ASHRAE 55, whatever the air speed", () => {
    const correct = clothingCorrectionFor(Standard.ashrae_55_2023);
    for (const met of METABOLIC_RATES) {
      expect(correct?.(0.5, { met, vr: 0.1 }), `${met} met`).toBe(clo_dynamic_ashrae(0.5, met));
      expect(correct?.(0.5, { met, vr: 1 }), `${met} met`).toBe(clo_dynamic_ashrae(0.5, met));
    }
  });

  it("leaves the clothing insulation as it is at or below 1.2 met under ASHRAE 55, and lowers it above", () => {
    const correct = clothingCorrectionFor(Standard.ashrae_55_2023);
    expect(correct?.(0.5, { met: 1.2, vr: 0.1 })).toBe(0.5);
    expect(correct?.(0.5, { met: 2, vr: 0.1 })).toBe(0.4);
  });

  it("asks ASHRAE 55's rule for no air speed, so a model under it need not enter one", () => {
    const correct = clothingCorrectionFor(Standard.ashrae_55_2023);
    const withoutAirSpeed = {
      met: 2,
      get vr(): number {
        throw new Error("ASHRAE 55's clothing correction takes no air speed");
      },
    };
    expect(correct?.(0.5, withoutAirSpeed)).toBe(0.4);
  });

  it.each([Standard.iso_7730_2005, Standard.iso_7730_2025])(
    "corrects by the library's clo_dynamic_iso under ISO %s, at the relative air speed of the air speed it takes",
    (standard) => {
      const correct = clothingCorrectionFor(standard);
      for (const met of METABOLIC_RATES) {
        for (const v of [0, 0.1, 0.4]) {
          expect(correct?.(0.5, { met, vr: v_relative(v, met) }), `${met} met, ${v} m/s`).toBe(clo_dynamic_iso(0.5, met, v));
        }
      }
    },
  );

  /** Every row of the table: each standard the library names that has a correction. */
  const rows = Object.values(Standard).flatMap((standard): [string, ClothingCorrection][] => {
    const correct = clothingCorrectionFor(standard);
    return correct ? [[standard, correct]] : [];
  });

  /** Metabolic rates from 1 to 4 met and relative air speeds from 0 to 2 m/s, as the inverse is asked at. */
  const conditions = [1, 1.1, 1.2, 1.3, 2, 3, 4].flatMap((met) => [0, 0.1, 0.4, 1, 2].map((vr) => ({ met, vr })));

  it("has a row for ASHRAE 55 and for both editions of ISO 7730", () => {
    expect(rows.map(([standard]) => standard)).toEqual([Standard.ashrae_55_2023, Standard.iso_7730_2005, Standard.iso_7730_2025]);
  });

  // What `clo_dynamic_inverse`'s bisection relies on, of every row.
  it.each(rows)("never falls as the clothing insulation rises, and gives 0 for 0, under %s", (_, correct) => {
    for (const resolved of conditions) {
      expect(correct(0, resolved)).toBe(0);
      for (let step = 1; step <= 400; step += 1) {
        const label = `${step / 100} clo at ${resolved.met} met and ${resolved.vr} m/s`;
        expect(correct(step / 100, resolved), label).toBeGreaterThanOrEqual(correct((step - 1) / 100, resolved));
      }
    }
  });

  it.each(rows)("is inverted by the temporary library's clo_dynamic_inverse, both ways, under %s", (_, correct) => {
    for (const resolved of conditions) {
      const correction = (clo: number) => correct(clo, resolved);
      const label = `${resolved.met} met and ${resolved.vr} m/s`;
      for (let step = 0; step <= 40; step += 1) {
        // Read once as a clothing insulation entered and once as a dynamic one.
        const entry = step / 20;
        expect(clo_dynamic_inverse({ clo_dynamic: correction(entry), correction }), `${entry} clo at ${label}`).toBe(entry);
        expect(correction(clo_dynamic_inverse({ clo_dynamic: entry, correction })), `dynamic ${entry} clo at ${label}`).toBeCloseTo(entry, 2);
      }
    }
  });

  it("has no correction for a standard that corrects no clothing, or for none", () => {
    expect(clothingCorrectionFor(Standard.iso_7933_2023)).toBeUndefined();
    expect(clothingCorrectionFor(Standard.iso_9920_2007)).toBeUndefined();
    expect(clothingCorrectionFor(undefined)).toBeUndefined();
  });
});
