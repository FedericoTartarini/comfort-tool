import { psy_ta_rh } from "jsthermalcomfort";
import { NO_ROOT_FOUND, bisect, secant } from "./rootFinding";

export { NO_ROOT_FOUND };

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
export interface PsychrometricZone {
  /** The |PMV| the edges were solved at. */
  readonly pmvLimit: number;
  /** The PMV closure the edges were solved with, echoed back. */
  readonly model: PsychrometricZoneOptions["model"];
  /** The `PMV = -pmvLimit` edge, in ascending relative humidity. */
  readonly coolEdge: readonly PsychrometricPoint[];
  /** The saturation line between the two edges, in ascending temperature. */
  readonly saturationEdge: readonly PsychrometricPoint[];
  /**
   * The `PMV = +pmvLimit` edge, also in ascending relative humidity — so that
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

/** Arguments to {@link psychrometricZone}. */
export interface PsychrometricZoneOptions {
  /** Mean radiant temperature, [°C]. Ignored when {@link PsychrometricZoneOptions.trFollowsDb} is `true`. */
  readonly tr: number;
  /**
   * Solve with `tr` equal to the dry-bulb temperature at every point, so the
   * x axis is operative temperature rather than air temperature. Default
   * `false`.
   *
   * This is the geometry of the CBE Thermal Comfort Tool's operative-temperature
   * psychrometric chart. `tr` is not read at all in this mode.
   */
  readonly trFollowsDb?: boolean;
  /**
   * Relative air speed, [m/s] — `v_relative` already applied, as everywhere
   * else in the app. The CBE tool applies it inside its PMV wrapper instead,
   * so a caller reproducing its chart must apply it first.
   */
  readonly vr: number;
  /** Metabolic rate, [met]. */
  readonly met: number;
  /** Dynamic clothing insulation, [clo] — `clo_dynamic_ashrae` / `clo_dynamic_iso` already applied. */
  readonly clo: number;
  /**
   * External work, [met]. Default `0`.
   *
   * Not forwarded to {@link PsychrometricZoneOptions.model}: the model
   * argument used to be the library's own PMV function, which took `wme` as a
   * positional argument; ADR-0002 decision 9 narrowed it to a six-argument
   * closure `(tdb, tr, vr, rh, met, clo) => pmv` so that a model whose wrapper
   * takes the edition and kwargs positionally still fits one signature. A
   * declaration that wants non-zero external work bakes it into the closure
   * itself, the same way it bakes in the edition. Kept here, at its old
   * default, for parity with the fork's option shape.
   */
  readonly wme?: number;
  /** The |PMV| to trace. Default `0.5`. */
  readonly pmvLimit?: number;
  /**
   * The PMV closure to trace the zone with: `(tdb, tr, vr, rh, met, clo) =>
   * pmv`, unrounded and ungated. A model declaration writes this beside its
   * `run`, binding the same edition (or `Standard`) constant, so the zone and
   * the results can never disagree about which standard produced them.
   *
   * This was the library model function itself, taken directly — a workaround
   * for `psychrometricZone` taking a `standard` string that defaulted to
   * `"ASHRAE"`. The main repository's ISO wrapper takes the edition as its
   * eighth positional argument and kwargs as its ninth, so a raw function
   * reference no longer fits one signature; a closure does.
   *
   * The zone controls `limit_inputs: false` and `round_output: false`
   * internally — the boundary is a root of the raw PMV, and a rounded or
   * NaN-clamped model cannot be root-found — so the closure itself must pass
   * those through to whatever it calls.
   */
  readonly model: (tdb: number, tr: number, vr: number, rh: number, met: number, clo: number) => number;
  /** Relative humidity step between rows, [%]. Default `10`. */
  readonly rhStep?: number;
  /** Temperature step along the saturation line, [°C]. Default `0.5`. */
  readonly saturationStep?: number;
  /**
   * The residual the root finder accepts. Default `0.001`.
   *
   * This is a **PMV** residual, not a temperature tolerance — the upstream
   * comment calls it "ta precision", which it is not.
   */
  readonly epsilon?: number;
  /** Atmospheric pressure, [Pa]. Default `101325`. */
  readonly p_atm?: number;
  /**
   * Repair the two defects this algorithm inherits from the deployed CBE tool.
   * Default `false`, so that the output reproduces the published chart.
   *
   * 1. The secant method clamps every candidate temperature to `[0, 100]`
   *    even though the bracket is `[-50, 50]`, so roots below 0 °C cannot be
   *    reached.
   * 2. The saturation line runs between the roots of `PMV = ±0.5`, hard-coded,
   *    instead of `PMV = ±pmvLimit`. Every EN category therefore gets the same
   *    top segment as the ±0.5 zone.
   *
   * Turning this on gives the geometry the algorithm was evidently meant to
   * produce; leave it off to match what the website draws.
   */
  readonly correctKnownDefects?: boolean;
}

/**
 * Traces a PMV comfort zone across a psychrometric chart.
 *
 * The zone is not something a model returns: for each relative humidity, the
 * dry-bulb temperature at which PMV reaches ±`pmvLimit` has to be solved for.
 * Ported verbatim in behaviour from the fork's `charts/comfort_zone.ts`, which
 * is itself a port of `findComfortBoundary` in `static/js/psychchart.js` of
 * the CBE Thermal Comfort Tool — secant method with a bisection fallback,
 * both bracketed on `[-50, 50]`, at a PMV residual of 0.001.
 *
 * Output is SI and ungarnished: no unit conversion, no clipping to a viewport,
 * no styling. Those are the caller's business.
 */
export function psychrometricZone(options: PsychrometricZoneOptions): PsychrometricZone {
  const {
    tr,
    vr,
    met,
    clo,
    pmvLimit = 0.5,
    model,
    rhStep = 10,
    saturationStep = 0.5,
    epsilon = 0.001,
    p_atm = 101325,
    correctKnownDefects = false,
    trFollowsDb = false,
  } = options;

  const unsolved: UnsolvedRow[] = [];

  const point = (db: number, rh: number): PsychrometricPoint => ({
    db,
    hr: psy_ta_rh(db, rh, p_atm).hr,
    rh,
  });

  const solve = (rh: number, target: number): PsychrometricPoint => {
    const fn = (db: number): number => {
      // The secant method can hand back a non-finite candidate: its clamp lets
      // NaN through, because every comparison with NaN is false. A model that
      // validates its arguments would throw on such an input rather than
      // report it as an unsolved row, so this is checked before the call.
      if (!Number.isFinite(db)) return NaN;
      return model(db, trFollowsDb ? db : tr, vr, rh, met, clo) - target;
    };
    let db = secant(-50, 50, fn, epsilon, {
      clampCandidates: !correctKnownDefects,
    });
    if (Number.isNaN(db)) db = bisect(-50, 50, fn, epsilon, 0);
    if (Number.isNaN(db) || db === NO_ROOT_FOUND) {
      unsolved.push({ rh, target, db });
    }
    return point(db, rh);
  };

  const coolEdge: PsychrometricPoint[] = [];
  const warmEdge: PsychrometricPoint[] = [];
  for (let rh = 0; rh <= 100; rh += rhStep) {
    coolEdge.push(solve(rh, -pmvLimit));
  }
  for (let rh = 0; rh <= 100; rh += rhStep) {
    warmEdge.push(solve(rh, pmvLimit));
  }

  // Defect 2: the deployed tool solves the ends of the saturation line at
  // ±0.5 whatever pmvLimit is.
  const saturationLimit = correctKnownDefects ? pmvLimit : 0.5;
  const tMin = solve(100, -saturationLimit).db;
  const tMax = solve(100, saturationLimit).db;
  const saturationEdge: PsychrometricPoint[] = [];
  for (let t = tMin; t <= tMax; t += saturationStep) {
    saturationEdge.push(point(t, 100));
  }

  return {
    pmvLimit,
    model,
    coolEdge,
    saturationEdge,
    warmEdge,
    polygon: [...coolEdge, ...saturationEdge, ...[...warmEdge].reverse()],
    unsolved,
  };
}
