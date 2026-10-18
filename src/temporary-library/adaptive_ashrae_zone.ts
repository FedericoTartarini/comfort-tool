/**
 * The 80 % and 90 % acceptability bands of ASHRAE 55's adaptive model as
 * polygons: the region of running mean × operative temperature where
 * `adaptive_ashrae` answers `acceptability_80` or `acceptability_90` true.
 *
 * Every number is read off `adaptive_ashrae` and `ADAPTIVE_ASHRAE_INFO` but
 * one: {@link COOLING_EFFECT_ONSET}, the 25 °C at and above which the model
 * applies the cooling effect, which it applies but does not return.
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

/** Parameters of {@link adaptive_ashrae_zone}, documented on the function. */
export interface AdaptiveAshraeZoneParams {
  readonly v: number;
  readonly t_running_mean_range: readonly [number, number];
}

/** Reads the limit a side of the band follows off a result. */
type LimitOf = (limits: AdaptiveAshraeResult) => number;

/**
 * The operative temperature, [°C], at and above which `adaptive_ashrae` widens
 * the upper limits by the cooling effect of elevated air speed: ASHRAE 55's,
 * and the one number here that the model does not return.
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
 * pythermalcomfort does, from 25 °C itself (`to >= 25`). So at an operative temperature below 25 °C a
 * band's upper limit is its base line, and at 25 °C or more it is the shifted
 * line, the base line plus the cooling effect. Where the base line lies below
 * 25 °C and the shifted line above it, the band holds two runs of operative
 * temperature: up to the base line, and from 25 °C up to the shifted line. The
 * run between the base line and 25 °C is left out.
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
 * Output is SI and ungarnished: no unit conversion, no styling. The running
 * mean is clipped to the model's applicability, 10–33.5 °C, whatever range is
 * asked for.
 *
 * @public
 *
 * @param {Object} params - the bands' parameters, snake_case as the library's models name theirs.
 * @param {number} params.v - Air speed [m/s]. Below 0.6 m/s there is no cooling effect
 * @param {[number, number]} params.t_running_mean_range - The running means to draw, [°C], lowest first
 * @returns the two bands under the names of the `adaptive_ashrae` outputs they
 *   are the regions of, see {@link AdaptiveAshraeZone}
 * @throws {RangeError} where a band's shifted line reaches 25 °C by the end of
 *   the range and its base line does not pass it: the strip there touches the
 *   rest of the band nowhere, or at one point, and one polygon cannot hold both
 *
 * @example
 * const zone = adaptive_ashrae_zone({ v: 0.6, t_running_mean_range: [10, 33.5] });
 * zone.acceptability_90.upper_limit;
 * // [{ t_running_mean: 10, operative_tmp: 23.4 }, { t_running_mean: 15.16, operative_tmp: 25 },
 * //  { t_running_mean: 11.29, operative_tmp: 25 }, { t_running_mean: 33.5, operative_tmp: 31.89 }]
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
  // The entered air speed at the onset, where any cooling effect applies.
  const movingStart = readLimits(start, v, COOLING_EFFECT_ONSET);
  const movingEnd = readLimits(end, v, COOLING_EFFECT_ONSET);
  const point = (t_running_mean: number, operative_tmp: number): AdaptivePoint => ({ t_running_mean, operative_tmp });
  // Where a straight line from `from` at the start to `to` at the end reaches the onset.
  const onsetAlong = (from: number, to: number): number => start + ((COOLING_EFFECT_ONSET - from) * (end - start)) / (to - from);

  const traceUpperLimit = (percent: number, upperOf: LimitOf): [AdaptivePoint, ...AdaptivePoint[]] => {
    const [baseStart, baseEnd] = [upperOf(stillStart), upperOf(stillEnd)];
    const [shiftedStart, shiftedEnd] = [upperOf(movingStart), upperOf(movingEnd)];
    const base: [AdaptivePoint, AdaptivePoint] = [point(start, baseStart), point(end, baseEnd)];
    const shifted: [AdaptivePoint, AdaptivePoint] = [point(start, shiftedStart), point(end, shiftedEnd)];
    // The library applies no cooling effect below 0.6 m/s.
    if (shiftedStart === baseStart && shiftedEnd === baseEnd) return base;
    // Every limit at the onset or above: shifted end to end.
    if (baseStart >= COOLING_EFFECT_ONSET) return shifted;
    // The shifted line never reaches the onset, so there is no strip.
    if (shiftedEnd < COOLING_EFFECT_ONSET) return base;
    if (baseEnd <= COOLING_EFFECT_ONSET) {
      throw new RangeError(
        `The ${percent} % band over running means ${start}–${end} °C at ${v} m/s: its shifted upper limit reaches ` +
          `${COOLING_EFFECT_ONSET} °C and the base one does not, so the strip above it touches no other part of the band`,
      );
    }
    const baseOnset = point(onsetAlong(baseStart, baseEnd), COOLING_EFFECT_ONSET);
    const alongOnset =
      shiftedStart > COOLING_EFFECT_ONSET
        ? [point(start, COOLING_EFFECT_ONSET), shifted[0]]
        : [point(onsetAlong(shiftedStart, shiftedEnd), COOLING_EFFECT_ONSET)];
    return [base[0], baseOnset, ...alongOnset, shifted[1]];
  };

  const traceBand = (percent: number, upperOf: LimitOf, lowerOf: LimitOf): AdaptiveAshraeBand => {
    const upper = traceUpperLimit(percent, upperOf);
    const lower = [point(start, lowerOf(stillStart)), point(end, lowerOf(stillEnd))];
    return { upper_limit: upper, lower_limit: lower, polygon: [...upper, ...[...lower].reverse(), upper[0]] };
  };

  return {
    acceptability_80: traceBand(80, (limits) => limits.tmp_cmf_80_up, (limits) => limits.tmp_cmf_80_low),
    acceptability_90: traceBand(90, (limits) => limits.tmp_cmf_90_up, (limits) => limits.tmp_cmf_90_low),
  };
}
