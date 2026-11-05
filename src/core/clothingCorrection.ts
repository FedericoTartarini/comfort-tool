/**
 * The clothing correction of every standard that has one: the rule that turns
 * the clothing insulation a person looks up into the dynamic clothing
 * insulation the standard's models take (ADR-0002 decision 54). One row per
 * standard that corrects, keyed by the library's standard constants; a
 * standard without a row corrects nothing, and its models are given the
 * clothing insulation as entered. A standard's row lands here ahead of its
 * first model, as a quantity lands in `core/quantities.ts`.
 *
 * The one reader of the library's two clothing corrections, and of the
 * temporary library's inverse of each.
 */
import { clo_dynamic_ashrae, clo_dynamic_iso_vr, Standard } from "jsthermalcomfort";
import type { StandardId } from "jsthermalcomfort";
import { clo_dynamic_ashrae_inverse, clo_dynamic_iso_vr_inverse } from "$lib/temporary-library/clo_dynamic_inverse";

/**
 * What a correction may read beside the clothing insulation, of the slot's
 * resolved values. Each is read only by the rule that takes it, so a model
 * under a standard whose rule takes no air speed need not enter one.
 */
export interface ClothingCorrectionInputs {
  readonly met: number;
  readonly vr: number;
}

/** One standard's rule and its inverse. */
export interface ClothingCorrection {
  /** The dynamic clothing insulation for the clothing insulation `clo`. */
  readonly correct: (clo: number, resolved: ClothingCorrectionInputs) => number;
  /** The clothing insulation {@link ClothingCorrection.correct} turns into `clo_dynamic`. */
  readonly invert: (clo_dynamic: number, resolved: ClothingCorrectionInputs) => number;
}

/** ASHRAE 55's: `clo × (0.6 + 0.4 / met)` above 1.2 met, `clo` itself at or below it. */
const ashrae55: ClothingCorrection = {
  correct: (clo, { met }) => clo_dynamic_ashrae(clo, met),
  invert: (clo_dynamic, { met }) => clo_dynamic_ashrae_inverse(clo_dynamic, met),
};

/**
 * ISO 7730 Annex C's, by ISO 9920, at the library's default air-layer
 * insulation. Called at the relative air speed, which is what a slot resolves
 * to in either air-speed entry mode: the library's `clo_dynamic_iso(clo, met,
 * v)` is this function at `v_relative(v, met)`, and passing it a relative air
 * speed would add the activity's share twice.
 */
const iso7730: ClothingCorrection = {
  correct: (clo, { met, vr }) => clo_dynamic_iso_vr(clo, met, vr),
  invert: (clo_dynamic, { met, vr }) => clo_dynamic_iso_vr_inverse(clo_dynamic, met, vr),
};

const clothingCorrections: ReadonlyMap<StandardId, ClothingCorrection> = new Map([
  [Standard.ashrae_55_2023, ashrae55],
  // Both editions give the same equations in their Annex C.
  [Standard.iso_7730_2005, iso7730],
  [Standard.iso_7730_2025, iso7730],
]);

/** The clothing correction of `standard`, or `undefined` for one that has none, and for no standard. */
export function clothingCorrectionFor(standard: StandardId | undefined): ClothingCorrection | undefined {
  return standard === undefined ? undefined : clothingCorrections.get(standard);
}
