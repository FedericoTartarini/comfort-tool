/**
 * The inverse of the library's `v_relative`: the air speed a relative air
 * speed came from. pythermalcomfort has no counterpart; the CBE Thermal
 * Comfort Tool needs one because it lets a person enter either and switch
 * between them.
 *
 * Leaves the app when jsthermalcomfort publishes it (ADR-0002 decision 24).
 */
import { v_relative } from "jsthermalcomfort";

/** Parameters of {@link v_relative_inverse}, documented on the function. */
export interface VRelativeInverseParams {
  readonly vr: number;
  readonly met: number;
}

/** The air speed `v_relative` adds per met above 1 met, [m/s]. */
const ACTIVITY_AIR_SPEED_PER_MET = 0.3;

/** Decimals kept of the air speed: far finer than `v_relative`'s 0.001, far coarser than float noise. */
const AIR_SPEED_DECIMALS = 9;

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
 * air speed gives.
 *
 * @public
 *
 * @param {Object} params - the inverse's parameters, snake_case as the library's models name theirs.
 * @param {number} params.vr - relative air speed, [m/s]
 * @param {number} params.met - metabolic rate, [met]
 * @returns air speed, [m/s]
 *
 * @example
 * v_relative_inverse({ vr: 0.7, met: 2 }); // 0.4
 */
export function v_relative_inverse(params: VRelativeInverseParams): number {
  const { vr, met } = params;
  if (v_relative(0, met) === vr) return 0;
  if (met <= 1) return vr;
  return Number((vr - ACTIVITY_AIR_SPEED_PER_MET * (met - 1)).toFixed(AIR_SPEED_DECIMALS));
}
