/**
 * The inverse of a clothing correction, `clo_dynamic_ashrae` or
 * `clo_dynamic_iso_vr`: the clothing insulation a dynamic clothing insulation
 * came from. ISO 7730's correction has no closed inverse, so the correction
 * is taken as a function and searched, and neither standard's formula is
 * written here. pythermalcomfort has no counterpart; the CBE Thermal Comfort
 * Tool needs one because it lets a person enter either and switch between
 * them.
 *
 * Leaves the app when jsthermalcomfort publishes it (ADR-0002 decision 24).
 */

/** Parameters of {@link clo_dynamic_inverse}, documented on the function. */
export interface CloDynamicInverseParams {
  readonly clo_dynamic: number;
  readonly correction: (clo: number) => number;
}

/** Decimals kept of the clothing insulation at most: far finer than a person enters one, far coarser than float noise. */
const CLO_DECIMALS = 9;

/**
 * Estimates the clothing insulation (I_cl) a correction turns into a dynamic
 * clothing insulation (I_cl,r), by bisection over the correction itself.
 *
 * `correction` is a clothing correction at fixed conditions, for instance
 * `(clo) => clo_dynamic_iso_vr(clo, met, vr)`. It must give 0 for 0, never
 * fall as the clothing insulation rises, and rise without bound, as both of
 * the library's do. For one that never reaches `clo_dynamic` the answer is
 * `Infinity`.
 *
 * The bisection runs to the last float, so it finds the smallest clothing
 * insulation corrected to at least `clo_dynamic`. `clo_dynamic_ashrae` rounds
 * to 0.001, so a whole interval of clothing insulations is corrected to one
 * value, and the smallest of them is not the one a person entered: the answer
 * is the roundest decimal beside it that is corrected to exactly
 * `clo_dynamic`, which is the entered 1 clo for ASHRAE 55's 0.8 clo at 2 met.
 * An entry of two decimals is given back exactly; one of three may come back
 * as its neighbour, where the correction's rounding gives both the same
 * dynamic value.
 * Where no decimal is corrected to exactly `clo_dynamic`, as for a dynamic
 * clothing insulation that no entry of so few decimals gives, the answer is
 * the search's own, raised to nine decimals, and is never corrected to less
 * than `clo_dynamic`: to within about 1e-9 clo of it by a correction that
 * does not round, and to the next value above it that the correction gives by
 * one that does (0.8005 clo has no clothing insulation under ASHRAE 55 at
 * 2 met; the answer is corrected to 0.801). Nine decimals and not the float's
 * last digit, where a correction's own arithmetic is no longer monotone.
 *
 * A `clo_dynamic` at or below 0 is returned as it is: 0 for 0, and no
 * clothing insulation gives a negative one.
 *
 * @public
 *
 * @param {Object} params - the inverse's parameters, snake_case as the library's models name theirs.
 * @param {number} params.clo_dynamic - dynamic clothing insulation (I_cl,r), [clo]
 * @param {(clo: number) => number} params.correction - the correction to invert: clothing insulation in, dynamic clothing insulation out, [clo]
 * @returns clothing insulation (I_cl), [clo]
 *
 * @example
 * import { clo_dynamic_ashrae } from "jsthermalcomfort";
 * clo_dynamic_inverse({ clo_dynamic: 0.8, correction: (clo) => clo_dynamic_ashrae(clo, 2) }); // 1
 */
export function clo_dynamic_inverse(params: CloDynamicInverseParams): number {
  const { clo_dynamic, correction } = params;
  if (!(clo_dynamic > 0)) return clo_dynamic;

  // correction(lower) < clo_dynamic <= correction(upper), from here to the end.
  let lower = 0;
  let upper = 1;
  while (correction(upper) < clo_dynamic && upper < Infinity) {
    lower = upper;
    upper *= 2;
  }
  for (;;) {
    const midpoint = lower + (upper - lower) / 2;
    if (midpoint <= lower || midpoint >= upper) break;
    if (correction(midpoint) < clo_dynamic) lower = midpoint;
    else upper = midpoint;
  }

  for (let decimals = 0; ; decimals += 1) {
    const nearest = Number(upper.toFixed(decimals));
    if (correction(nearest) === clo_dynamic) return nearest;
    // The nearest decimal may lie below the search's answer, and be corrected to less.
    const above = nearest < upper ? Number((nearest + 10 ** -decimals).toFixed(decimals)) : nearest;
    if (correction(above) === clo_dynamic || decimals === CLO_DECIMALS) return above;
  }
}
