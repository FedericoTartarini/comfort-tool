import { io, pmv_ppd_iso } from "jsthermalcomfort";
import type { PmvPpdIsoEdition } from "jsthermalcomfort";
import type { PmvPpdIsoInit } from "jsthermalcomfort/io";
import { chartType } from "$lib/core/chartType";
import { defineModel } from "$lib/core/modelDeclaration";

const q = io.quantities;

// 7730-2005, not the library's 2025 default: rewrite plan, Phase 3.6 item 3.
const ISO_EDITION: PmvPpdIsoEdition = "7730-2005";

export const pmvIso = defineModel({
  run: (init: PmvPpdIsoInit) => io.pmvPpdIso({ ...init, edition: ISO_EDITION }),
  edition: ISO_EDITION,
  model: pmv_ppd_iso,
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
  // limits (ADR §4.4) — the charts show what the field looks like around the
  // standard, and `limits` says which of it the user may enter.
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
    // The same function this model runs, so the zone is Fanger unmodified for
    // the same reason the results are — the elevated-air-speed cooling effect
    // belongs to `pmv_ppd_ashrae`.
    { type: chartType.psychrometric, pmvModel: pmv_ppd_iso },
    { type: chartType.dynamic, axes: { x: q.tdb, y: q.v }, output: q.pmv },
  ],
});
