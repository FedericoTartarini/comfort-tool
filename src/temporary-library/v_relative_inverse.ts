// The inverse of the library's `v_relative`: the air speed a relative air
// speed came from. pythermalcomfort has no counterpart.
import { v_relative } from "jsthermalcomfort";

/**
 * The air speed `v_relative` adds per met above 1 met, [m/s]: the library
 * holds it unexported, in `src/environment/v_relative.js:32` at `88015e5`.
 */
const activity_air_speed_per_met = 0.3;

/** Decimals kept of the air speed: far finer than `v_relative`'s 0.001, far coarser than float noise. */
const air_speed_decimals = 9;

/**
 * Estimates the air speed that gives a relative air speed at a metabolic
 * rate: the inverse of `v_relative`, `vr − 0.3 (M − 1)` above 1 met and `vr`
 * itself at or below it.
 *
 * `v_relative` of the answer is `vr` to that function's rounding of 0.001,
 * which is why the answer is not itself rounded to 0.001: that would move the
 * relative air speed by 0.001 where 0.3 (M − 1) falls half way between two
 * steps.
 *
 * Still air is asked first. `v_relative` rounds the activity's share, so the
 * subtraction would give still air back up to 0.0005 either side of 0. The
 * answer is negative only when `vr` is below the activity's share, which no
 * air speed gives. NaN propagates through it.
 *
 * @param vr - relative air speed, [m/s]
 * @param met - metabolic rate, [met]
 * @returns air speed, [m/s]
 * @throws `TypeError` for an argument that is not a number.
 *
 * @example
 * ```ts
 * import { v_relative_inverse } from "jsthermalcomfort";
 * console.log(v_relative_inverse(0.7, 2)); // 0.4
 * ```
 */
export function v_relative_inverse(vr: number, met: number): number {
  for (const [key, value] of Object.entries({ vr, met })) {
    if (typeof (value as unknown) !== "number") throw new TypeError(`${key} must be a number.`);
  }
  if (v_relative(0, met) === vr) return 0;
  if (met <= 1) return vr;
  return Number((vr - activity_air_speed_per_met * (met - 1)).toFixed(air_speed_decimals));
}
