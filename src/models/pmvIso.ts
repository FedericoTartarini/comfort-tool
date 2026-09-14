import { pmv_ppd_iso, PMV_PPD_ISO_INFO, Standard } from "jsthermalcomfort-main";
import { chartType } from "$lib/core/chartType";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { quantities } from "$lib/core/quantities";

const q = quantities;

// 7730-2005, not the library's 2025 default: rewrite plan, Phase 3.6 item 3.
// One constant for both calls below (ADR-0002 decision 9): `run` and the
// comfort-zone closure can never name two editions.
const ISO_EDITION = Standard.iso_7730_2005;

/**
 * The PMV closure the psychrometric chart solves its comfort zone with:
 * Fanger's equation unmodified, at this model's own edition — the same
 * reason the results table's numbers are (ADR-0002 decision 9). `wme` is
 * fixed at the library default; nothing in v1 enters external work.
 */
const pmvIsoZoneModel = (tdb: number, tr: number, vr: number, rh: number, met: number, clo: number): number =>
  pmv_ppd_iso(tdb, tr, vr, rh, met, clo, 0, ISO_EDITION, { limit_inputs: false, round_output: false }).pmv;

export const pmvIso = {
  info: PMV_PPD_ISO_INFO,
  standard: ISO_EDITION,
  run: (init: Record<string, number>) =>
    pmv_ppd_iso(init.tdb, init.tr, init.vr, init.rh, init.met, init.clo, init.wme ?? 0, ISO_EDITION, {
      units: "SI",
      limit_inputs: false,
    }),
  pathSegment: "pmv-iso",
  inputs: [
    { quantity: q.tdb, value: 25 },
    { quantity: q.tr, value: 25 },
    { quantity: q.v, value: 0.1 },
    { quantity: q.rh, value: 50 },
    { quantity: q.met, value: 1.1 },
    { quantity: q.clo, value: 0.5 },
  ],
  relativeAirSpeed: true,
  // The extents the deployed CBE tool draws, not ISO 7730's applicability
  // bounds (ADR §4.4) — the charts show what the field looks like around the
  // standard, and `info`'s applicability says which of it the user may enter.
  axisRanges: [
    { quantity: q.tdb, min: 10, max: 40 },
    { quantity: q.tr, min: 10, max: 40 },
    { quantity: q.operative_tmp, min: 10, max: 40 },
    { quantity: q.hr, min: 0, max: 0.03 },
    { quantity: q.v, min: 0, max: 2 },
    { quantity: q.rh, min: 0, max: 100 },
    { quantity: q.met, min: 1, max: 4 },
    { quantity: q.clo, min: 0, max: 2 },
  ],
  table: [q.pmv, q.ppd],
  charts: [
    // Fanger unmodified, the same equation this model runs — the
    // elevated-air-speed cooling effect belongs to `pmv_ppd_ashrae`.
    { type: chartType.psychrometric, pmvModel: pmvIsoZoneModel },
    { type: chartType.dynamic, axes: { x: q.tdb, y: q.v }, output: q.tsv },
  ],
} satisfies RegisteredModel;
