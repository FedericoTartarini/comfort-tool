// The inverses of the library's two clothing corrections, `clo_dynamic_ashrae`
// and `clo_dynamic_iso_vr`: the clothing insulation a dynamic clothing
// insulation came from. ISO 7730's correction has no closed inverse, so both
// search their correction, and neither standard's formula is written here.
// pythermalcomfort has no counterpart.
import { clo_dynamic_ashrae, clo_dynamic_iso_vr } from "jsthermalcomfort";

/** Decimals kept of the clothing insulation at most: far finer than a person enters one, far coarser than float noise. */
const CLO_DECIMALS = 9;

/**
 * Estimates the clothing insulation (I_cl) that ASHRAE 55's correction,
 * `clo_dynamic_ashrae`, turns into a dynamic clothing insulation (I_cl,r) at a
 * metabolic rate, by bisection over that function.
 *
 * The bisection runs to the last float, so it finds the smallest clothing
 * insulation corrected to at least `clo_dynamic`. `clo_dynamic_ashrae` rounds
 * to 0.001, so a whole interval of clothing insulations is corrected to one
 * value, and the smallest of them is not the one a person entered: the answer
 * is the roundest decimal beside it that is corrected to exactly
 * `clo_dynamic`, which is 1 clo for 0.8 clo at 2 met. An entry of two
 * decimals is given back exactly; one of three may come back as its
 * neighbour, where the rounding gives both the same dynamic value. Where no
 * decimal is corrected to exactly `clo_dynamic`, the answer is the search's
 * own raised to nine decimals, corrected to the next value above
 * `clo_dynamic` that the correction gives (0.8005 clo has no clothing
 * insulation at 2 met; the answer is corrected to 0.801).
 *
 * At or below 1.2 met the correction is the identity, and so is its inverse.
 * A `clo_dynamic` at or below 0 is returned as it is: 0 for 0, and no
 * clothing insulation gives a negative one. NaN in any argument gives NaN.
 *
 * @param clo_dynamic - dynamic clothing insulation (I_cl,r), [clo]
 * @param met - metabolic rate, [met]
 * @returns clothing insulation (I_cl), [clo]
 * @throws `TypeError` for an argument that is not a number.
 *
 * @example
 * ```ts
 * import { clo_dynamic_ashrae_inverse } from "jsthermalcomfort";
 * console.log(clo_dynamic_ashrae_inverse(0.8, 2)); // 1
 * ```
 */
export function clo_dynamic_ashrae_inverse(clo_dynamic: number, met: number): number {
  for (const [key, value] of Object.entries({ clo_dynamic, met })) {
    if (typeof (value as unknown) !== "number") throw new TypeError(`${key} must be a number.`);
  }
  if ([clo_dynamic, met].some((value) => Number.isNaN(value))) return NaN;
  return inverseByBisection(clo_dynamic, (clo) => clo_dynamic_ashrae(clo, met));
}

/**
 * Estimates the clothing insulation (I_cl) that ISO 7730's correction,
 * `clo_dynamic_iso_vr`, turns into a dynamic clothing insulation (I_cl,r) at a
 * metabolic rate and relative air speed, by bisection over that function,
 * which has no closed inverse.
 *
 * The bisection runs to the last float, so it finds the smallest clothing
 * insulation corrected to at least `clo_dynamic`; the answer is the roundest
 * decimal beside it that is corrected to exactly `clo_dynamic`, so an entry
 * of two decimals is given back exactly. Where no decimal is, the answer is
 * the search's own raised to nine decimals, corrected to within about 1e-9
 * clo of `clo_dynamic`. Nine decimals and not the float's last digit, where
 * the correction's own arithmetic is no longer monotone.
 *
 * A `clo_dynamic` at or below 0 is returned as it is: 0 for 0, and no
 * clothing insulation gives a negative one. NaN in any argument gives NaN.
 *
 * @param clo_dynamic - dynamic clothing insulation (I_cl,r), [clo]
 * @param met - metabolic rate, [met]
 * @param vr - relative air speed, [m/s]
 * @param i_a - thermal insulation of the boundary (surface) air layer around the outer clothing
 * or, when nude, around the skin surface, [clo]
 * @returns clothing insulation (I_cl), [clo]
 * @throws `TypeError` for an argument that is not a number.
 *
 * @example
 * ```ts
 * import { clo_dynamic_iso_vr, clo_dynamic_iso_vr_inverse } from "jsthermalcomfort";
 * console.log(clo_dynamic_iso_vr_inverse(clo_dynamic_iso_vr(1, 2, 0.4), 2, 0.4)); // 1
 * ```
 */
export function clo_dynamic_iso_vr_inverse(clo_dynamic: number, met: number, vr: number, i_a = 0.7): number {
  for (const [key, value] of Object.entries({ clo_dynamic, met, vr, i_a })) {
    if (typeof (value as unknown) !== "number") throw new TypeError(`${key} must be a number.`);
  }
  if ([clo_dynamic, met, vr, i_a].some((value) => Number.isNaN(value))) return NaN;
  return inverseByBisection(clo_dynamic, (clo) => clo_dynamic_iso_vr(clo, met, vr, i_a));
}

/**
 * The clothing insulation `correction` turns into `clo_dynamic`, by bisection
 * to the last float and then the roundest decimal beside the answer that is
 * corrected to exactly `clo_dynamic`, at most nine decimals. `correction` gives
 * 0 for 0, never falls as the clothing insulation rises, and rises without
 * bound, as both of the library's do.
 */
function inverseByBisection(clo_dynamic: number, correction: (clo: number) => number): number {
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
