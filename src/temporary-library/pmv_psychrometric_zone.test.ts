import { describe, expect, it } from "vitest";
import { Standard, pmv_ppd_ashrae, pmv_ppd_iso } from "jsthermalcomfort";
import online from "./chart-online.json" with { type: "json" };
import { pmv_psychrometric_zone } from "./pmv_psychrometric_zone.ts";
import type { PmvFunction } from "./pmv_psychrometric_zone.ts";
import { NO_ROOT_FOUND, bisect } from "./root_finding.ts";

// The chart module's claim is that it reproduces the geometry the CBE Thermal
// Comfort Tool draws at comfort.cbe.berkeley.edu. The fixture is that tool's
// own output, ported from the fork's `tests/fixtures/chart-online.json`
// (itself captured by the fork's `scripts/generate-chart-baseline.mjs`).

/**
 * How far the boundary is allowed to sit from the deployed tool's, in °C: one
 * bound for both standards, for two different reasons, neither of them the
 * geometry.
 *
 * ASHRAE: the main repository's `cooling_effect` rounds to two decimals
 * (matching pythermalcomfort), the CBE tool's does not, and a ~0.002 K
 * difference in the cooling effect shifts the boundary by about a hundredth
 * of a degree.
 *
 * ISO: the library's PMV kernel starts its clothing-temperature iteration from
 * ISO 7730 Annex D's initial guess, as pythermalcomfort 4.6.0 does, and the
 * fixture was recorded from the deployed tool's kernel, which does not.
 * Measured 2026-09-25: up to 0.007 °C at met 1.1, 0.00003 °C at met 1.4.
 * Regenerating the fixture from the library would make this test circular,
 * and matching the deployed kernel is ruled out by the library's ADR 0001.
 */
const DB_TOLERANCE = {
  ISO: 0.02,
  ASHRAE: 0.02,
} as const;

/** `wme = 0`, `limit_inputs: false`, `round_output: false`, unrounded return — the zone's own contract. */
const isoClosure: PmvFunction = (tdb, tr, vr, rh, met, clo) =>
  pmv_ppd_iso({ tdb, tr, vr, rh, met, clo, wme: 0, standard: Standard.iso_7730_2005, limit_inputs: false, round_output: false })
    .pmv;
const ashraeClosure: PmvFunction = (tdb, tr, vr, rh, met, clo) =>
  pmv_ppd_ashrae({ tdb, tr, vr, rh, met, clo, wme: 0, limit_inputs: false, round_output: false }).pmv;

/**
 * The fixture records which standard the deployed tool drew each zone under;
 * the zone takes a PMV closure rather than a model reference, so the recorded
 * string is resolved to one here.
 */
const PMV_FUNCTION_FOR: Record<keyof typeof DB_TOLERANCE, PmvFunction> = {
  ISO: isoClosure,
  ASHRAE: ashraeClosure,
};

/**
 * Humidity ratio tolerance, [kg/kg]. Both packages use the same formula; the
 * main repository's `p_sat` rounds to 0.1 Pa, which moves the ratio in its
 * seventh decimal.
 */
const HR_TOLERANCE = 1e-5;

/** The fixture's first zone's conditions, rounded, for the tests that are not about a fixture row. */
const conditions = { tr: 25, vr: 0.13, met: 1.1, clo: 0.5 };

describe("psychrometric comfort zone", () => {
  it.each(online.zones)("reproduces the boundary the CBE tool draws: $standard ±$pmvLimit met=$met clo=$clo", (zone) => {
    const standard = zone.standard as keyof typeof DB_TOLERANCE;
    const mine = pmv_psychrometric_zone({
      tr: zone.tr,
      vr: zone.vr,
      met: zone.met,
      clo: zone.clo,
      pmv_function: PMV_FUNCTION_FOR[standard],
      pmv_limit: zone.pmvLimit,
    });
    expect(mine.polygon.length).toBe(zone.boundary.length);
    expect(mine.unsolved).toEqual([]);
    // Each point that is off, by its index, so a failure says which.
    const off = zone.boundary.flatMap((expected, point) => {
      const actual = mine.polygon[point]!;
      const on = Math.abs(actual.tdb - expected.db) < DB_TOLERANCE[standard] && Math.abs(actual.hr - expected.hr) < HR_TOLERANCE;
      return on ? [] : [{ point, actual, expected }];
    });
    expect(off).toEqual([]);
  });

  it("returns the zone's sides, its polygon and its unsolved rows, and no echo of its arguments", () => {
    const zone = pmv_psychrometric_zone({ ...conditions, pmv_function: ashraeClosure, pmv_limit: 0.5 });
    expect(Object.keys(zone).sort()).toEqual([
      "cool_boundary",
      "polygon",
      "saturation_line",
      "unsolved",
      "warm_boundary",
    ]);
  });

  it("gives the same points as separate sides and as one polygon", () => {
    // Adjacent bands have to share the vertices of an isopleth, which only the
    // separated sides can express; the polygon is the drawing order.
    const zone = pmv_psychrometric_zone({ ...conditions, pmv_function: ashraeClosure, pmv_limit: 0.5 });
    expect(zone.polygon).toEqual([...zone.cool_boundary, ...zone.saturation_line, ...[...zone.warm_boundary].reverse()]);
    expect(zone.cool_boundary.map((p) => p.rh)).toEqual(zone.warm_boundary.map((p) => p.rh));
    expect(zone.cool_boundary.map((p) => p.rh)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it("reports rows it could not solve instead of clamping them", () => {
    // A PMV that never moves has no root anywhere: the secant's slope is zero
    // and the bisection finds no sign change.
    const zone = pmv_psychrometric_zone({ ...conditions, pmv_function: () => 0, pmv_limit: 1 });
    // The point carries NaN, so a finite check is all a caller needs to drop
    // it; the value the CBE bisection returned is kept in the report.
    expect(zone.cool_boundary[0]!.tdb).toBeNaN();
    expect(zone.cool_boundary[0]!.hr).toBeNaN();
    expect(zone.unsolved[0]).toEqual({ rh: 0, tdb: NO_ROOT_FOUND });
    // With the 100 % row unsolved, the saturation line has no ends to run between.
    expect(zone.saturation_line).toEqual([]);
  });

  it("solves against tr = db when tr_follows_db is set", () => {
    // The operative-temperature chart: every vertex must satisfy the PMV
    // equation with tr taken from the x axis, not from the tr argument. The tr
    // passed in is deliberately far from the zone so a solve that still read
    // it could not land on the boundary.
    const epsilon = 0.001;
    const pmv_limit = 0.5;
    const zone = pmv_psychrometric_zone({
      ...conditions,
      tr: 50,
      pmv_function: isoClosure,
      pmv_limit,
      tr_follows_db: true,
      epsilon,
    });
    expect(zone.unsolved).toEqual([]);
    for (const boundary of [zone.cool_boundary, zone.warm_boundary]) {
      for (const { tdb, rh } of boundary) {
        const pmv = isoClosure(tdb, tdb, 0.13, rh, 1.1, 0.5);
        expect(Math.abs(Math.abs(pmv) - pmv_limit)).toBeLessThan(epsilon);
      }
    }
  });

  it("leaves the default zone reading the tr argument", () => {
    // Guards the switch itself: the same call without the flag must not
    // reproduce the operative geometry.
    const farTr = { ...conditions, tr: 50, pmv_function: isoClosure, pmv_limit: 0.5 };
    const following = pmv_psychrometric_zone({ ...farTr, tr_follows_db: true });
    const fixed = pmv_psychrometric_zone(farTr);
    expect(fixed.cool_boundary[0]!.tdb).not.toBeCloseTo(following.cool_boundary[0]!.tdb, 3);
    // With tr already equal to the solved db there is nothing left to differ.
    const matched = pmv_psychrometric_zone({
      ...conditions,
      pmv_function: isoClosure,
      pmv_limit: 0.5,
      tr_follows_db: true,
    });
    expect(matched.cool_boundary[0]!.tdb).toBeCloseTo(following.cool_boundary[0]!.tdb, 9);
  });

  it("runs the saturation line between the zone's own boundaries", () => {
    const saturation_step = 0.5;
    const narrow = pmv_psychrometric_zone({ ...conditions, pmv_function: isoClosure, pmv_limit: 0.2, saturation_step });
    const wide = pmv_psychrometric_zone({ ...conditions, pmv_function: isoClosure, pmv_limit: 0.5, saturation_step });
    for (const zone of [narrow, wide]) {
      // Both ends are solved at 100 % like the top rows of the boundaries, at
      // the zone's own limit, so the line starts on the cool boundary's top
      // vertex and stops within one step of the warm boundary's.
      const top = zone.saturation_line[zone.saturation_line.length - 1]!.tdb;
      const warmTop = zone.warm_boundary[zone.warm_boundary.length - 1]!.tdb;
      expect(zone.saturation_line[0]!.tdb).toBe(zone.cool_boundary[zone.cool_boundary.length - 1]!.tdb);
      expect(top).toBeLessThanOrEqual(warmTop);
      expect(top).toBeGreaterThan(warmTop - saturation_step);
    }
    expect(narrow.saturation_line.length).toBeLessThan(wide.saturation_line.length);
  });
});

describe("root finding", () => {
  it("finds roots below 0 °C", () => {
    const zone = pmv_psychrometric_zone({ ...conditions, pmv_function: isoClosure, pmv_limit: 8 });
    expect(zone.cool_boundary[0]!.tdb).toBeLessThan(0);
    expect(zone.unsolved).toEqual([]);
  });

  it("returns a sentinel, not NaN, when the bracket holds no root", () => {
    expect(bisect(-50, 50, (x) => x * x + 1, 0.001, 0)).toBe(NO_ROOT_FOUND);
  });
});

/**
 * Type-level proof, compiled by `npm run check` and never called: the solver
 * has no default limit, so each `@ts-expect-error` here fails the build the
 * day a call without one compiles. Exported only because `noUnusedLocals`
 * would otherwise flag it.
 */
export function zoneLimitTypeProof(): void {
  // @ts-expect-error a missing limit: every caller names its zone
  pmv_psychrometric_zone({ ...conditions, pmv_function: isoClosure });
}
