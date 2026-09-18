import { describe, expect, it } from "vitest";
import { Standard, pmv_ppd_ashrae, pmv_ppd_iso } from "jsthermalcomfort";
import online from "./chart-online.json" with { type: "json" };
import { NO_ROOT_FOUND, pmv_psychrometric_zone, type PmvFunction } from "./pmv_psychrometric_zone";
import { bisect, secant } from "./root_finding";

// The chart module's claim is that it reproduces the geometry the CBE Thermal
// Comfort Tool draws at comfort.cbe.berkeley.edu. The fixture is that tool's
// own output, ported from the fork's `tests/fixtures/chart-online.json`
// (itself captured by the fork's `scripts/generate-chart-baseline.mjs`).

/**
 * How far the boundary is allowed to sit from the deployed tool's, in °C.
 *
 * ISO zones land on it exactly. ASHRAE zones do not, and the reason is not the
 * geometry: the main repository's `cooling_effect` rounds to two decimals
 * (matching pythermalcomfort), the CBE tool's does not, and a ~0.002 K
 * difference in the cooling effect shifts the boundary by about a hundredth
 * of a degree.
 */
const DB_TOLERANCE = {
  ISO: 1e-9,
  ASHRAE: 0.02,
} as const;

/** `wme = 0`, `limit_inputs: false`, `round_output: false`, unrounded return — the zone's own contract. */
const isoClosure: PmvFunction = (tdb, tr, vr, rh, met, clo) =>
  pmv_ppd_iso(tdb, tr, vr, rh, met, clo, 0, Standard.iso_7730_2005, { limit_inputs: false, round_output: false }).pmv;
const ashraeClosure: PmvFunction = (tdb, tr, vr, rh, met, clo) =>
  pmv_ppd_ashrae(tdb, tr, vr, rh, met, clo, 0, { limit_inputs: false, round_output: false }).pmv;

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

describe("psychrometric comfort zone", () => {
  it("reproduces the boundary the CBE tool draws", () => {
    for (const zone of online.zones) {
      const standard = zone.standard as keyof typeof DB_TOLERANCE;
      const label = `${standard} ±${zone.pmvLimit} met=${zone.met} clo=${zone.clo}`;
      const pmvFunction = PMV_FUNCTION_FOR[standard];
      const mine = pmv_psychrometric_zone(zone.tr, zone.vr, zone.met, zone.clo, pmvFunction, {
        pmv_limit: zone.pmvLimit,
      });
      expect(mine.pmvFunction, `${label} echoes the PMV function it used`).toBe(pmvFunction);

      expect(mine.polygon.length, `${label} vertex count`).toBe(zone.boundary.length);
      expect(mine.unsolved, `${label} unsolved rows`).toEqual([]);
      for (const [index, expected] of zone.boundary.entries()) {
        const actual = mine.polygon[index]!;
        expect(Math.abs(actual.db - expected.db), `${label} point ${index} db`).toBeLessThan(DB_TOLERANCE[standard]);
        expect(Math.abs(actual.hr - expected.hr), `${label} point ${index} hr`).toBeLessThan(HR_TOLERANCE);
      }
    }
  });

  it("gives the same points as separate edges and as one polygon", () => {
    // Adjacent bands have to share the vertices of an isopleth, which only the
    // separated edges can express; the polygon is the drawing order.
    const zone = pmv_psychrometric_zone(25, 0.13, 1.1, 0.5, ashraeClosure);
    expect(zone.polygon).toEqual([...zone.coolEdge, ...zone.saturationEdge, ...[...zone.warmEdge].reverse()]);
    expect(zone.coolEdge.map((p) => p.rh)).toEqual(zone.warmEdge.map((p) => p.rh));
    expect(zone.coolEdge.map((p) => p.rh)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it("reports rows it could not solve instead of clamping them", () => {
    // No set of conditions in the bracket reaches PMV = ±20.
    const zone = pmv_psychrometric_zone(25, 0.13, 1.1, 0.5, isoClosure, { pmv_limit: 20 });
    expect(zone.unsolved.length).toBeGreaterThan(0);
    // The value the CBE bisection returns is kept, so its chart can be
    // reproduced; the report is what tells a caller not to trust the point.
    expect(zone.unsolved[0]!.db).toBe(NO_ROOT_FOUND);
    expect(zone.coolEdge[0]!.db).toBe(NO_ROOT_FOUND);
  });

  it("solves against tr = db when tr_follows_db is set", () => {
    // The operative-temperature chart: every vertex must satisfy the PMV
    // equation with tr taken from the x axis, not from the tr argument. The tr
    // passed in is deliberately far from the zone so a solve that still read
    // it could not land on the boundary.
    const epsilon = 0.001;
    const zone = pmv_psychrometric_zone(50, 0.13, 1.1, 0.5, isoClosure, { tr_follows_db: true, epsilon });
    expect(zone.unsolved).toEqual([]);
    for (const edge of [zone.coolEdge, zone.warmEdge]) {
      for (const { db, rh } of edge) {
        const pmv = isoClosure(db, db, 0.13, rh, 1.1, 0.5);
        expect(Math.abs(Math.abs(pmv) - zone.pmvLimit)).toBeLessThan(epsilon);
      }
    }
  });

  it("leaves the default zone reading the tr argument", () => {
    // Guards the switch itself: the same call without the flag must not
    // reproduce the operative geometry.
    const following = pmv_psychrometric_zone(50, 0.13, 1.1, 0.5, isoClosure, { tr_follows_db: true });
    const fixed = pmv_psychrometric_zone(50, 0.13, 1.1, 0.5, isoClosure);
    expect(fixed.coolEdge[0]!.db).not.toBeCloseTo(following.coolEdge[0]!.db, 3);
    // With tr already equal to the solved db there is nothing left to differ.
    const matched = pmv_psychrometric_zone(25, 0.13, 1.1, 0.5, isoClosure, { tr_follows_db: true });
    expect(matched.coolEdge[0]!.db).toBeCloseTo(following.coolEdge[0]!.db, 9);
  });
});

describe("the CBE tool's two defects", () => {
  const [tr, vr, met, clo] = [25, 0.13, 1.1, 0.5];

  it("clamps secant candidates to [0, 100], hiding roots below zero", () => {
    const root = (x: number): number => x + 20;
    expect(secant(-50, 50, root, 0.001)).toBeNaN();
    expect(secant(-50, 50, root, 0.001, { clamp_candidates: false })).toBeCloseTo(-20, 9);
  });

  it("falls back to bisection, which is how sub-zero roots still get found", () => {
    // The clamp would strand the search; bisection has no clamp, so the zone
    // comes out right anyway. That is why defect 1 is invisible on the site.
    const zone = pmv_psychrometric_zone(tr, vr, met, clo, isoClosure, { pmv_limit: 8 });
    expect(zone.coolEdge[0]!.db).toBeLessThan(0);
    expect(zone.unsolved).toEqual([]);
  });

  it("returns a sentinel, not NaN, when the bracket holds no root", () => {
    expect(bisect(-50, 50, (x) => x * x + 1, 0.001, 0)).toBe(NO_ROOT_FOUND);
  });

  it("solves the saturation line at ±0.5 whatever the limit is", () => {
    const asDrawn = pmv_psychrometric_zone(tr, vr, met, clo, isoClosure, { pmv_limit: 0.2 });
    const corrected = pmv_psychrometric_zone(tr, vr, met, clo, isoClosure, {
      pmv_limit: 0.2,
      correct_known_defects: true,
    });
    // The edges are the same — only the top segment moves.
    expect(corrected.coolEdge).toEqual(asDrawn.coolEdge);
    expect(corrected.saturationEdge.length).toBeLessThan(asDrawn.saturationEdge.length);
    // A Category I zone should not reach as far along the saturation line as
    // the ±0.5 zone does, but as drawn it does.
    const wider = pmv_psychrometric_zone(tr, vr, met, clo, isoClosure);
    expect(asDrawn.saturationEdge).toEqual(wider.saturationEdge);
  });

  it("changes nothing at the limit the tool actually uses", () => {
    // pmvlimit is 0.5 on the ASHRAE chart, so defect 2 is latent there.
    expect(
      pmv_psychrometric_zone(tr, vr, met, clo, ashraeClosure, { correct_known_defects: true }).saturationEdge,
    ).toEqual(pmv_psychrometric_zone(tr, vr, met, clo, ashraeClosure).saturationEdge);
  });
});
