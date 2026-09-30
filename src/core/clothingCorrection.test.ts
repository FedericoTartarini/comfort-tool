import { describe, expect, it } from "vitest";
import { clo_dynamic_ashrae, clo_dynamic_iso, Standard, v_relative } from "jsthermalcomfort";
import { clothingCorrectionFor } from "./clothingCorrection";

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

  it("has no correction for a standard that corrects no clothing, or for none", () => {
    expect(clothingCorrectionFor(Standard.iso_7933_2023)).toBeUndefined();
    expect(clothingCorrectionFor(Standard.iso_9920_2007)).toBeUndefined();
    expect(clothingCorrectionFor(undefined)).toBeUndefined();
  });
});
