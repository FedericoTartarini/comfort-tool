/**
 * The clothing correction of every standard that has one: the rule that turns
 * the clothing insulation a person looks up into the dynamic clothing
 * insulation the standard's models take (ADR-0002 decision 54). One row per
 * standard that corrects, keyed by the library's standard constants; a
 * standard without a row corrects nothing, and its models are given the
 * clothing insulation as entered. A standard's row lands here ahead of its
 * first model, as a quantity lands in `core/quantities.ts`.
 *
 * The one reader of the library's two clothing corrections.
 */
import { clo_dynamic_ashrae, clo_dynamic_iso_vr, Standard } from "jsthermalcomfort";

/**
 * What a correction may read beside the clothing insulation, of the slot's
 * resolved values. Each is read only by the rule that takes it, so a model
 * under a standard whose rule takes no air speed need not enter one.
 */
export interface ClothingCorrectionInputs {
  readonly met: number;
  readonly vr: number;
}

/** The dynamic clothing insulation for the clothing insulation `clo`, by one standard's rule. */
export type ClothingCorrection = (clo: number, resolved: ClothingCorrectionInputs) => number;

/** ASHRAE 55's: `clo × (0.6 + 0.4 / met)` above 1.2 met, `clo` itself at or below it. */
const ashrae55: ClothingCorrection = (clo, { met }) => clo_dynamic_ashrae(clo, met);

/**
 * ISO 7730 Annex C's, by ISO 9920, at the library's default air-layer
 * insulation. Called at the relative air speed, which is what a slot resolves
 * to in either air-speed entry mode: the library's `clo_dynamic_iso(clo, met,
 * v)` is this function at `v_relative(v, met)`, and passing it a relative air
 * speed would add the activity's share twice.
 */
const iso7730: ClothingCorrection = (clo, { met, vr }) => clo_dynamic_iso_vr(clo, met, vr);

const clothingCorrections: ReadonlyMap<Standard, ClothingCorrection> = new Map([
  [Standard.ashrae_55_2023, ashrae55],
  // Both editions give the same equations in their Annex C.
  [Standard.iso_7730_2005, iso7730],
  [Standard.iso_7730_2025, iso7730],
]);

/** The clothing correction of `standard`, or `undefined` for one that has none, and for no standard. */
export function clothingCorrectionFor(standard: Standard | undefined): ClothingCorrection | undefined {
  return standard === undefined ? undefined : clothingCorrections.get(standard);
}
