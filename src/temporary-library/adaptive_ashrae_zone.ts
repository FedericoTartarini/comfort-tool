// The 80 % and 90 % acceptability bands of ASHRAE 55's adaptive model as
// polygons: the region of running mean × operative temperature where
// `adaptive_ashrae` answers `acceptability_80` or `acceptability_90` true.
// Every number is read off `adaptive_ashrae` and `ADAPTIVE_ASHRAE_INFO` but
// one, the 25 °C at and above which the model applies the cooling effect.
import { ADAPTIVE_ASHRAE_INFO, adaptive_ashrae } from "jsthermalcomfort";
import type { AdaptiveASHRAE, ASHRAEInputs } from "jsthermalcomfort";

/** A point of running mean × operative temperature, in SI units. */
export interface AdaptivePoint {
  /** Prevailing mean (running mean) outdoor temperature, [°C]. */
  readonly t_running_mean: number;
  /** Operative temperature, [°C]. */
  readonly operative_tmp: number;
}

/** One acceptability band. */
export interface AdaptiveAshraeBand {
  /**
   * The upper limit, from the lowest running mean to the highest: along the
   * base line, back along 25 °C wherever the band holds a strip above it, and
   * along the shifted line. Where the shifted line is past 25 °C at the lowest
   * running mean already, it runs back to there and up that end to it.
   */
  readonly upper_limit: readonly AdaptivePoint[];
  /** The lower limit, in ascending running mean. */
  readonly lower_limit: readonly AdaptivePoint[];
  /**
   * The closed polygon, crossing and touching itself nowhere: upper limit out,
   * lower limit back, and the first vertex again.
   */
  readonly polygon: readonly AdaptivePoint[];
}

/** The two bands, each under the name of the `adaptive_ashrae` output it is the region of. */
export interface AdaptiveAshraeZone {
  readonly acceptability_80: AdaptiveAshraeBand;
  readonly acceptability_90: AdaptiveAshraeBand;
}

/** The four limits of `adaptive_ashrae` the bands follow. */
type LimitKey = "tmp_cmf_80_low" | "tmp_cmf_80_up" | "tmp_cmf_90_low" | "tmp_cmf_90_up";

/** The model the bands are drawn off: `adaptive_ashrae`, as far as the bands read it. */
type AdaptiveModel = (inputs: ASHRAEInputs) => Pick<AdaptiveASHRAE, LimitKey>;

/**
 * The operative temperature, [°C], at and above which `adaptive_ashrae` widens
 * the upper limits by the cooling effect of elevated air speed: the library
 * holds it unexported, in `src/_internal/adaptive_cooling_effect.ts:13` at
 * `88015e5`.
 */
const COOLING_EFFECT_ONSET = 25;

/**
 * Draws the 80 % and 90 % acceptability bands of the ASHRAE 55 adaptive model
 * on running mean outdoor temperature × operative temperature, as the regions
 * where `adaptive_ashrae` answers the acceptability true.
 *
 * ASHRAE 55-2013 §5.4.2.4 reads: "If t0 > 25°C (77°F), then it shall be
 * permitted to increase the upper acceptability temperature limits … by the
 * corresponding Δt0 in Table 5.4.2.4." The condition is on the operative
 * temperature, not on the limit. `adaptive_ashrae` reads it so, as
 * pythermalcomfort does, from 25 °C itself (`to >= 25.0`,
 * `pythermalcomfort/_internal/adaptive_cooling_effect.py:35` at 4.8.0). So at
 * an operative temperature below 25 °C a band's upper limit is its base line,
 * and at 25 °C or more it is the shifted line, the base line plus the cooling
 * effect. Where the base line lies below 25 °C and the shifted line above it,
 * the band holds two runs of operative temperature: up to the base line, and
 * from 25 °C up to the shifted line. The run between the base line and 25 °C
 * is left out.
 *
 * Each band is traced as one simple polygon:
 * - its upper limit runs along the base line to where it reaches 25 °C;
 * - back along 25 °C to where the shifted line reaches it;
 * - along the shifted line.
 * Where the shifted line is past 25 °C at the lowest running mean already, the
 * run along 25 °C goes back to there instead and up that end to the shifted
 * line. Below 0.6 m/s the model adds no cooling effect, and each upper limit is
 * the one straight base line. The lower limits never shift.
 *
 * The bands are not something the model returns: `adaptive_ashrae` gives the
 * limits at one running mean, and shifts the upper ones by the cooling effect
 * of the operative temperature it is given. So the model is evaluated at the
 * ends of the running-mean interval: in still air for the base lines, and at
 * the given air speed at 25 °C for the shifted lines. Where a line reaches
 * 25 °C is interpolated along it, the lines being straight.
 *
 * Output is SI: no unit conversion. The running mean is clipped to the
 * model's applicability, 10–33.5 °C, whatever range is asked for. The zone,
 * its bands, their limits and their points are frozen.
 *
 * @param v - air speed, [m/s]. Below 0.6 m/s there is no cooling effect
 * @param t_running_mean_min - the lowest running mean to draw, [°C]
 * @param t_running_mean_max - the highest running mean to draw, [°C]
 * @returns the two bands under the names of the `adaptive_ashrae` outputs they
 * are the regions of
 * @throws `TypeError` for an argument that is not a number; `adaptive_ashrae`'s
 * own error for a NaN `v` or running mean; `RangeError` where a band's shifted
 * line reaches 25 °C by `t_running_mean_max` and its base line does not pass
 * it, since the strip there touches the rest of the band nowhere, or at one
 * point, and one polygon cannot hold both; `Error` for a limit the model gives
 * no value for.
 *
 * @example
 * ```ts
 * import { adaptive_ashrae_zone } from "jsthermalcomfort";
 * const zone = adaptive_ashrae_zone(0.6, 10, 33.5);
 * console.log(zone.acceptability_90.upper_limit);
 * // to two decimals: [{ t_running_mean: 10, operative_tmp: 23.4 }, { t_running_mean: 15.16, operative_tmp: 25 },
 * //  { t_running_mean: 11.29, operative_tmp: 25 }, { t_running_mean: 33.5, operative_tmp: 31.89 }]
 * ```
 */
export function adaptive_ashrae_zone(v: number, t_running_mean_min: number, t_running_mean_max: number): AdaptiveAshraeZone {
  return _adaptive_ashrae_zone(v, t_running_mean_min, t_running_mean_max, adaptive_ashrae);
}

/**
 * {@link adaptive_ashrae_zone}, drawn off the model it is given rather than the
 * library's `adaptive_ashrae`, so a test can show the geometry follows
 * whatever the model returns.
 *
 * @param v - air speed, [m/s]
 * @param t_running_mean_min - the lowest running mean to draw, [°C]
 * @param t_running_mean_max - the highest running mean to draw, [°C]
 * @param model - the model to evaluate; {@link adaptive_ashrae_zone} passes `adaptive_ashrae`
 * @returns the two bands, as {@link adaptive_ashrae_zone} returns them
 * @throws as {@link adaptive_ashrae_zone} throws.
 */
export function _adaptive_ashrae_zone(
  v: number,
  t_running_mean_min: number,
  t_running_mean_max: number,
  model: AdaptiveModel,
): AdaptiveAshraeZone {
  for (const [key, value] of Object.entries({ v, t_running_mean_min, t_running_mean_max })) {
    if (typeof (value as unknown) !== "number") throw new TypeError(`${key} must be a number.`);
  }
  const bound = ADAPTIVE_ASHRAE_INFO.inputs.t_running_mean.applicability;
  const start = Math.max(t_running_mean_min, bound.min);
  const end = Math.min(t_running_mean_max, bound.max);
  if (start >= end) {
    const nothing: AdaptiveAshraeBand = Object.freeze({
      upper_limit: Object.freeze([]),
      lower_limit: Object.freeze([]),
      polygon: Object.freeze([]),
    });
    return Object.freeze({ acceptability_80: nothing, acceptability_90: nothing });
  }

  // `tdb = tr` makes the operative temperature that value whatever the air
  // speed's weighting of the two.
  const readLimits = (t_running_mean: number, air_speed: number, operative_tmp: number): Readonly<Record<LimitKey, number>> => {
    const limits = model({
      tdb: operative_tmp,
      tr: operative_tmp,
      t_running_mean,
      v: air_speed,
      limit_inputs: false,
      round_output: false,
    });
    const limitOf = (key: LimitKey): number => {
      const value = limits[key];
      if (value === null) {
        throw new Error(`${key} of adaptive_ashrae is null at a running mean of ${t_running_mean} °C and ${air_speed} m/s.`);
      }
      return value;
    };
    return {
      tmp_cmf_80_low: limitOf("tmp_cmf_80_low"),
      tmp_cmf_80_up: limitOf("tmp_cmf_80_up"),
      tmp_cmf_90_low: limitOf("tmp_cmf_90_low"),
      tmp_cmf_90_up: limitOf("tmp_cmf_90_up"),
    };
  };
  // Still air, so no cooling effect whatever the operative temperature.
  const still_start = readLimits(start, 0, COOLING_EFFECT_ONSET);
  const still_end = readLimits(end, 0, COOLING_EFFECT_ONSET);
  // The entered air speed at the onset, where any cooling effect applies.
  const moving_start = readLimits(start, v, COOLING_EFFECT_ONSET);
  const moving_end = readLimits(end, v, COOLING_EFFECT_ONSET);
  const point = (t_running_mean: number, operative_tmp: number): AdaptivePoint => Object.freeze({ t_running_mean, operative_tmp });
  // Where a straight line from `from` at the start to `to` at the end reaches the onset.
  const onsetAlong = (from: number, to: number): number => start + ((COOLING_EFFECT_ONSET - from) * (end - start)) / (to - from);

  const traceUpperLimit = (percent: number, upper: LimitKey): [AdaptivePoint, ...AdaptivePoint[]] => {
    const [base_start, base_end] = [still_start[upper], still_end[upper]];
    const [shifted_start, shifted_end] = [moving_start[upper], moving_end[upper]];
    const base: [AdaptivePoint, AdaptivePoint] = [point(start, base_start), point(end, base_end)];
    const shifted: [AdaptivePoint, AdaptivePoint] = [point(start, shifted_start), point(end, shifted_end)];
    // The library applies no cooling effect below 0.6 m/s.
    if (shifted_start === base_start && shifted_end === base_end) return base;
    // Every limit at the onset or above: shifted end to end.
    if (base_start >= COOLING_EFFECT_ONSET) return shifted;
    // The shifted line never reaches the onset, so there is no strip.
    if (shifted_end < COOLING_EFFECT_ONSET) return base;
    if (base_end <= COOLING_EFFECT_ONSET) {
      throw new RangeError(
        `t_running_mean_max ${t_running_mean_max} °C ends the ${percent} % band at ${v} m/s where its shifted upper ` +
          `limit reaches ${COOLING_EFFECT_ONSET} °C and the base one does not, so the strip above it touches no other ` +
          `part of the band.`,
      );
    }
    const base_onset = point(onsetAlong(base_start, base_end), COOLING_EFFECT_ONSET);
    const along_onset =
      shifted_start > COOLING_EFFECT_ONSET
        ? [point(start, COOLING_EFFECT_ONSET), shifted[0]]
        : [point(onsetAlong(shifted_start, shifted_end), COOLING_EFFECT_ONSET)];
    return [base[0], base_onset, ...along_onset, shifted[1]];
  };

  const traceBand = (percent: number, upper: LimitKey, lower: LimitKey): AdaptiveAshraeBand => {
    const upper_limit = traceUpperLimit(percent, upper);
    const lower_limit = [point(start, still_start[lower]), point(end, still_end[lower])];
    return Object.freeze({
      upper_limit: Object.freeze(upper_limit),
      lower_limit: Object.freeze(lower_limit),
      polygon: Object.freeze([...upper_limit, ...[...lower_limit].reverse(), upper_limit[0]]),
    });
  };

  return Object.freeze({
    acceptability_80: traceBand(80, "tmp_cmf_80_up", "tmp_cmf_80_low"),
    acceptability_90: traceBand(90, "tmp_cmf_90_up", "tmp_cmf_90_low"),
  });
}
