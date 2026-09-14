import { io, pmv_ppd_iso } from "jsthermalcomfort";
import type { PmvPpdIsoEdition } from "jsthermalcomfort";
import { PMV_PPD_ISO_INFO, Standard, pmv_ppd_iso as pmvPpdIsoMain } from "jsthermalcomfort-main";
import type { PmvPpdIsoInit } from "jsthermalcomfort/io";
import { chartType } from "$lib/core/chartType";
import { defineModel } from "$lib/core/modelDeclaration";
import { quantities } from "$lib/core/quantities";

const q = quantities;

// 7730-2005, not the library's 2025 default: rewrite plan, Phase 3.6 item 3.
// One constant for both calls below (ADR-0002 decision 9): the main
// repository's `Standard` value is the literal the fork's own edition type
// accepts, so `run` and the comfort-zone closure can never name two editions.
const ISO_EDITION = Standard.iso_7730_2005 satisfies PmvPpdIsoEdition;

/**
 * The PMV closure the psychrometric chart solves its comfort zone with:
 * Fanger's equation unmodified, at this model's own edition — the same
 * reason the results table's numbers are (ADR-0002 decision 9). `wme` is
 * fixed at the library default; nothing in v1 enters external work.
 */
const pmvIsoZoneModel = (tdb: number, tr: number, vr: number, rh: number, met: number, clo: number): number =>
  pmvPpdIsoMain(tdb, tr, vr, rh, met, clo, 0, ISO_EDITION, { limit_inputs: false, round_output: false }).pmv;

export const pmvIso = defineModel({
  run: (init: PmvPpdIsoInit) => io.pmvPpdIso({ ...init, edition: ISO_EDITION }),
  edition: ISO_EDITION,
  model: pmv_ppd_iso,
  info: PMV_PPD_ISO_INFO,
  pathSegment: "pmv-iso",
  inputs: [
    [q.tdb, 25],
    [q.tr, 25],
    [q.v, 0.1],
    [q.rh, 50],
    [q.met, 1.1],
    [q.clo, 0.5],
  ],
  relativeAirSpeed: true,
  // The extents the deployed CBE tool draws, not ISO 7730's applicability
  // bounds (ADR §4.4) — the charts show what the field looks like around the
  // standard, and `info`'s applicability says which of it the user may enter.
  axisRanges: [
    [q.tdb, 10, 40],
    [q.tr, 10, 40],
    [q.operative_tmp, 10, 40],
    [q.hr, 0, 0.03],
    [q.v, 0, 2],
    [q.rh, 0, 100],
    [q.met, 1, 4],
    [q.clo, 0, 2],
  ],
  table: [q.pmv, q.ppd],
  charts: [
    // Fanger unmodified, the same equation this model runs — the
    // elevated-air-speed cooling effect belongs to `pmv_ppd_ashrae`.
    { type: chartType.psychrometric, pmvModel: pmvIsoZoneModel },
    { type: chartType.dynamic, axes: { x: q.tdb, y: q.v }, output: q.pmv },
  ],
});
