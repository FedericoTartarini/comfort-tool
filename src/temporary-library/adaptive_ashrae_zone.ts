/**
 * The 80 % and 90 % acceptability bands of ASHRAE 55's adaptive model as
 * polygons, reproducing the chart the CBE Thermal Comfort Tool draws at
 * comfort.cbe.berkeley.edu (`static/js/ASHRAE/adaptive-chart-ashrae.js` of
 * {@link https://github.com/CenterForTheBuiltEnvironment/comfort_tool | comfort_tool}),
 * whose vertices are hand-written there and are this file's test oracle.
 *
 * Every number is read off `adaptive_ashrae` and `ADAPTIVE_ASHRAE_INFO` but
 * one: {@link COOLING_EFFECT_ONSET}, the 25 °C at and above which the standard applies
 * the cooling effect, which the model applies but does not return.
 *
 * Leaves the app when jsthermalcomfort publishes adaptive band geometry
 * (ADR-0002 decision 24).
 */
import { ADAPTIVE_ASHRAE_INFO, adaptive_ashrae, type AdaptiveAshraeResult } from "jsthermalcomfort";

/** A point on the adaptive chart, in SI units. */
export interface AdaptivePoint {
  /** Prevailing mean (running mean) outdoor temperature, [°C]. */
  readonly t_running_mean: number;
  /** Operative temperature, [°C]. */
  readonly operative_tmp: number;
}

/** One acceptability band of the adaptive chart. */
export interface AdaptiveAshraeBand {
  /** The upper limit, in ascending running mean. */
  readonly upper_limit: readonly AdaptivePoint[];
  /** The lower limit, in ascending running mean. */
  readonly lower_limit: readonly AdaptivePoint[];
  /**
   * The closed polygon, in the order the CBE tool draws it: upper limit out,
   * lower limit back, and the first vertex again.
   */
  readonly polygon: readonly AdaptivePoint[];
}

/** The two bands, each under the name of the `adaptive_ashrae` output it is the region of. */
export interface AdaptiveAshraeZone {
  readonly acceptability_80: AdaptiveAshraeBand;
  readonly acceptability_90: AdaptiveAshraeBand;
}

/** Parameters of {@link adaptive_ashrae_zone}, documented on the function. */
export interface AdaptiveAshraeZoneParams {
  readonly v: number;
  readonly t_running_mean_range: readonly [number, number];
}

/** Reads the limit a side of the band follows off a result. */
type LimitOf = (limits: AdaptiveAshraeResult) => number;

/**
 * ASHRAE 55's operative temperature, [°C], at and above which elevated air
 * speed widens the upper limits: the standard's, and the one number here that
 * `adaptive_ashrae` does not return.
 */
const COOLING_EFFECT_ONSET = 25;

/**
 * Draws the 80 % and 90 % acceptability bands of the ASHRAE 55 adaptive model
 * on running mean outdoor temperature × operative temperature.
 *
 * The bands are not something the model returns: `adaptive_ashrae` gives the
 * limits at one running mean, and shifts the upper ones by the cooling effect
 * of the operative temperature it is given. So the model is evaluated at chosen
 * points instead: at the ends of the running-mean interval in still air for the
 * base lines, and at the given air speed at the limit's own operative
 * temperature for the shifted upper limits. Each upper limit runs along its base
 * line until that line reaches 25 °C, steps up by the cooling effect there and
 * continues shifted; the lower limits never shift. As the CBE tool draws them,
 * the step sits on the base line's own 25 °C crossing, found by interpolation
 * along the straight line.
 *
 * Output is SI and ungarnished: no unit conversion, no styling. The running
 * mean is clipped to the model's applicability, 10–33.5 °C, whatever range is
 * asked for.
 *
 * @public
 *
 * @param {Object} params - the bands' parameters, snake_case as the library's models name theirs.
 * @param {number} params.v - Air speed [m/s]. Below 0.6 m/s there is no cooling effect and no step
 * @param {[number, number]} params.t_running_mean_range - The running means to draw, [°C], lowest first
 * @returns the two bands under the names of the `adaptive_ashrae` outputs they
 *   are the regions of, see {@link AdaptiveAshraeZone}
 *
 * @example
 * const zone = adaptive_ashrae_zone({ v: 0.6, t_running_mean_range: [10, 33.5] });
 * zone.acceptability_80.upper_limit;
 * // [{ t_running_mean: 10, operative_tmp: 24.4 }, { t_running_mean: 11.94, operative_tmp: 25 },
 * //  { t_running_mean: 11.94, operative_tmp: 26.2 }, { t_running_mean: 33.5, operative_tmp: 32.89 }]
 */
export function adaptive_ashrae_zone(params: AdaptiveAshraeZoneParams): AdaptiveAshraeZone {
  return _adaptive_ashrae_zone(params, adaptive_ashrae);
}

/**
 * {@link adaptive_ashrae_zone}, drawn off the model it is given rather than the
 * library's `adaptive_ashrae`, so a test can show the geometry follows
 * whatever the model returns.
 *
 * @param {Object} params - the bands' parameters, as {@link adaptive_ashrae_zone} takes them
 * @param {typeof adaptive_ashrae} model - The model to evaluate; the public function passes `adaptive_ashrae`
 * @returns the two bands, see {@link AdaptiveAshraeZone}
 */
export function _adaptive_ashrae_zone(params: AdaptiveAshraeZoneParams, model: typeof adaptive_ashrae): AdaptiveAshraeZone {
  const { v, t_running_mean_range } = params;
  // An input with no bound would clip nothing; `ADAPTIVE_ASHRAE_INFO` bounds this one.
  const bound = ADAPTIVE_ASHRAE_INFO.inputs.t_running_mean?.applicability;
  const start = Math.max(t_running_mean_range[0], bound?.min ?? -Infinity);
  const end = Math.min(t_running_mean_range[1], bound?.max ?? Infinity);
  if (start >= end) {
    const nothing: AdaptiveAshraeBand = { upper_limit: [], lower_limit: [], polygon: [] };
    return { acceptability_80: nothing, acceptability_90: nothing };
  }

  // `tdb = tr` makes the operative temperature that value whatever the air
  // speed's weighting of the two.
  const readLimits = (t_running_mean: number, air_speed: number, operative_tmp: number): AdaptiveAshraeResult =>
    model({
      tdb: operative_tmp,
      tr: operative_tmp,
      t_running_mean,
      v: air_speed,
      limit_inputs: false,
      round_output: false,
    });
  // Still air, so no cooling effect whatever the operative temperature.
  const stillStart = readLimits(start, 0, COOLING_EFFECT_ONSET);
  const stillEnd = readLimits(end, 0, COOLING_EFFECT_ONSET);
  const point = (t_running_mean: number, operative_tmp: number): AdaptivePoint => ({ t_running_mean, operative_tmp });

  const traceUpperLimit = (upperOf: LimitOf): [AdaptivePoint, ...AdaptivePoint[]] => {
    const upperStart = upperOf(stillStart);
    const upperEnd = upperOf(stillEnd);
    // The limit at the entered air speed, read where this side itself stands.
    const shiftedAt = (t_running_mean: number, base: number): number => upperOf(readLimits(t_running_mean, v, base));
    const shiftedEnd = shiftedAt(end, upperEnd);
    // Unshifted at the end means unshifted throughout: the library applies no
    // cooling effect below 0.6 m/s, nor below the onset.
    if (shiftedEnd === upperEnd) return [point(start, upperStart), point(end, upperEnd)];
    if (upperStart >= COOLING_EFFECT_ONSET) return [point(start, shiftedAt(start, upperStart)), point(end, shiftedEnd)];
    // The base line is straight, so where it reaches the onset is interpolated.
    const step = start + ((COOLING_EFFECT_ONSET - upperStart) * (end - start)) / (upperEnd - upperStart);
    return [
      point(start, upperStart),
      point(step, COOLING_EFFECT_ONSET),
      point(step, COOLING_EFFECT_ONSET + shiftedEnd - upperEnd),
      point(end, shiftedEnd),
    ];
  };

  const traceBand = (upperOf: LimitOf, lowerOf: LimitOf): AdaptiveAshraeBand => {
    const upper = traceUpperLimit(upperOf);
    const lower = [point(start, lowerOf(stillStart)), point(end, lowerOf(stillEnd))];
    return { upper_limit: upper, lower_limit: lower, polygon: [...upper, ...[...lower].reverse(), upper[0]] };
  };

  return {
    acceptability_80: traceBand((limits) => limits.tmp_cmf_80_up, (limits) => limits.tmp_cmf_80_low),
    acceptability_90: traceBand((limits) => limits.tmp_cmf_90_up, (limits) => limits.tmp_cmf_90_low),
  };
}
