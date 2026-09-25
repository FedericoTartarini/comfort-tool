import { psy_ta_rh } from "jsthermalcomfort";
import { NO_ROOT_FOUND, bisect, secant } from "./root_finding";

export { NO_ROOT_FOUND };

/**
 * The PMV closure a zone is traced with: `(tdb, tr, vr, rh, met, clo) => pmv`,
 * unrounded and ungated.
 *
 * Positional, although every library model takes one params object: this is
 * the solver's own callback, spelled once here and called once per candidate,
 * not a library model, so it has no keys to check (ADR-0002 decision 18).
 * The caller writes it beside its call to the model, binding the same edition,
 * so the zone and the results can never disagree about which standard produced
 * them. External work is not an argument: a caller that wants non-zero `wme`
 * bakes it into the closure, the same way it bakes in the edition.
 *
 * The zone is a root of the raw PMV, and a rounded or NaN-clamped model cannot
 * be root-found, so the closure must pass `limit_inputs: false` and
 * `round_output: false` to whatever it calls.
 */
export type PmvFunction = (tdb: number, tr: number, vr: number, rh: number, met: number, clo: number) => number;

/** A point on a psychrometric chart, in SI units. */
export interface PsychrometricPoint {
  /** Dry-bulb air temperature, [°C]. */
  readonly db: number;
  /** Humidity ratio, [kg water / kg dry air]. */
  readonly hr: number;
  /** The relative humidity this point was solved at, [%]. */
  readonly rh: number;
}

/** A row of the zone where the solver did not find a root. */
export interface UnsolvedRow {
  /** Relative humidity, [%]. */
  readonly rh: number;
  /** The PMV the solver was looking for. */
  readonly target: number;
  /**
   * What the solver returned: NaN from the secant method, or
   * {@link NO_ROOT_FOUND} from the bisection fallback.
   */
  readonly db: number;
}

/** A comfort zone traced on a psychrometric chart. */
export interface PmvPsychrometricZone {
  /** The |PMV| the edges were solved at. */
  readonly pmvLimit: number;
  /** The PMV function the edges were solved with, echoed back. */
  readonly pmvFunction: PmvFunction;
  /** The `PMV = -pmv_limit` edge, in ascending relative humidity. */
  readonly coolEdge: readonly PsychrometricPoint[];
  /** The saturation line between the two edges, in ascending temperature. */
  readonly saturationEdge: readonly PsychrometricPoint[];
  /**
   * The `PMV = +pmv_limit` edge, also in ascending relative humidity — so that
   * two zones solved at different limits can be compared row by row, and so
   * adjacent bands share vertices along the same isopleth.
   */
  readonly warmEdge: readonly PsychrometricPoint[];
  /**
   * The closed polygon, in the order the CBE tool draws it: cool edge upward,
   * along the saturation line, warm edge back down.
   */
  readonly polygon: readonly PsychrometricPoint[];
  /**
   * Rows where no root was found. Reported rather than clamped or dropped: the
   * points are still in the edges, carrying whatever the solver returned, so a
   * caller decides what to do about them.
   */
  readonly unsolved: readonly UnsolvedRow[];
}

/** Parameters of {@link pmv_psychrometric_zone}, documented on the function. */
export interface PmvPsychrometricZoneParams {
  readonly tr: number;
  readonly vr: number;
  readonly met: number;
  readonly clo: number;
  readonly pmv_function: PmvFunction;
  readonly pmv_limit: number;
  readonly rh_step?: number;
  readonly saturation_step?: number;
  readonly epsilon?: number;
  readonly p_atm?: number;
  readonly tr_follows_db?: boolean;
}

/**
 * Traces a PMV comfort zone across a psychrometric chart.
 *
 * The zone is not something a model returns: for each relative humidity, the
 * dry-bulb temperature at which PMV reaches ±`pmv_limit` has to be solved for.
 * Ported from the fork's `charts/comfort_zone.ts`, which is itself a port of
 * `findComfortBoundary` in `static/js/psychchart.js` of the CBE Thermal
 * Comfort Tool — secant method started from -50 and 50 °C, with a bisection
 * fallback bracketed on `[-50, 50]`, at a PMV residual of 0.001. The saturation
 * line ends at the zone's own limit, and the secant does not clamp its
 * candidates to `[0, 100]`, so it can return a root outside the bracket;
 * neither moves a vertex of any chart the deployed tool publishes.
 *
 * Output is SI and ungarnished: no unit conversion, no clipping to a viewport,
 * no styling. Those are the caller's business.
 *
 * @public
 *
 * @param {Object} params - the zone's parameters, snake_case as the library's models name theirs.
 * @param {number} params.tr - Mean radiant temperature [°C]; not read when `tr_follows_db` is true
 * @param {number} params.vr - Relative air speed [m/s], `v_relative` already applied. The CBE tool
 *   applies it inside its PMV wrapper instead, so a caller reproducing its chart must apply it first
 * @param {number} params.met - Metabolic rate [met]
 * @param {number} params.clo - Dynamic clothing insulation [clo], `clo_dynamic_ashrae` /
 *   `clo_dynamic_iso` already applied
 * @param {PmvFunction} params.pmv_function - The PMV closure to trace the zone with, see {@link PmvFunction}
 * @param {number} params.pmv_limit - The |PMV| to trace. Required: the zone is the caller's, so is its limit
 * @param {number} [params.rh_step=10] - Relative humidity step between rows [%]
 * @param {number} [params.saturation_step=0.5] - Temperature step along the saturation line [°C]
 * @param {number} [params.epsilon=0.001] - The residual the root finder accepts. A **PMV** residual,
 *   not a temperature tolerance: the upstream comment calls it "ta precision", which it is not
 * @param {number} [params.p_atm=101325] - Atmospheric pressure [Pa]
 * @param {boolean} [params.tr_follows_db=false] - Solve with `tr` equal to the dry-bulb temperature
 *   at every point, so the x axis is operative temperature rather than air temperature: the geometry
 *   of the CBE Thermal Comfort Tool's operative-temperature psychrometric chart
 * @returns the two edges, the saturation line, the closed polygon and the rows
 *   that could not be solved, see {@link PmvPsychrometricZone}
 *
 * @example
 * const ashrae = (tdb, tr, vr, rh, met, clo) =>
 *   pmv_ppd_ashrae({
 *     tdb, tr, vr, rh, met, clo,
 *     wme: 0,
 *     limit_inputs: false,
 *     round_output: false,
 *   }).pmv;
 * const zone = pmv_psychrometric_zone({
 *   tr: 25, vr: 0.13, met: 1.1, clo: 0.61,
 *   pmv_function: ashrae,
 *   pmv_limit: PMV_COMPLIANCE_INTERVAL_ASHRAE.max,
 *   rh_step: 5,
 * });
 * zone.polygon; // [{ db, hr, rh }, ...]
 */
export function pmv_psychrometric_zone(params: PmvPsychrometricZoneParams): PmvPsychrometricZone {
  const {
    tr,
    vr,
    met,
    clo,
    pmv_function,
    pmv_limit,
    rh_step = 10,
    saturation_step = 0.5,
    epsilon = 0.001,
    p_atm = 101325,
    tr_follows_db = false,
  } = params;

  const unsolved: UnsolvedRow[] = [];

  const point = (db: number, rh: number): PsychrometricPoint => ({
    db,
    hr: psy_ta_rh(db, rh, p_atm).hr,
    rh,
  });

  const solve = (rh: number, target: number): PsychrometricPoint => {
    const fn = (db: number): number => {
      // The secant method can hand back a non-finite candidate, when a slope
      // that is not quite zero overflows its step. A model that validates its
      // arguments would throw on such an input rather than report it as an
      // unsolved row, so this is checked before the call.
      if (!Number.isFinite(db)) return NaN;
      return pmv_function(db, tr_follows_db ? db : tr, vr, rh, met, clo) - target;
    };
    let db = secant(-50, 50, fn, epsilon);
    if (Number.isNaN(db)) db = bisect(-50, 50, fn, epsilon, 0);
    if (Number.isNaN(db) || db === NO_ROOT_FOUND) {
      unsolved.push({ rh, target, db });
    }
    return point(db, rh);
  };

  const coolEdge: PsychrometricPoint[] = [];
  const warmEdge: PsychrometricPoint[] = [];
  for (let rh = 0; rh <= 100; rh += rh_step) {
    coolEdge.push(solve(rh, -pmv_limit));
  }
  for (let rh = 0; rh <= 100; rh += rh_step) {
    warmEdge.push(solve(rh, pmv_limit));
  }

  const tMin = solve(100, -pmv_limit).db;
  const tMax = solve(100, pmv_limit).db;
  const saturationEdge: PsychrometricPoint[] = [];
  for (let t = tMin; t <= tMax; t += saturation_step) {
    saturationEdge.push(point(t, 100));
  }

  return {
    pmvLimit: pmv_limit,
    pmvFunction: pmv_function,
    coolEdge,
    saturationEdge,
    warmEdge,
    polygon: [...coolEdge, ...saturationEdge, ...[...warmEdge].reverse()],
    unsolved,
  };
}
