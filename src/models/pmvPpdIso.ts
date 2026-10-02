import {
  PMV_CATEGORY_BINS_ISO,
  pmv_ppd_iso,
  PMV_PPD_ISO_INFO,
  PMV_THERMAL_SENSATION_VOTE_BINS_ISO,
  Standard,
} from "jsthermalcomfort";
import { chartType } from "$lib/core/chartType";
import { categoryZones } from "$lib/core/comfortZones";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { quantities } from "$lib/core/quantities";

const q = quantities;

// 7730-2025, the library's default: its kernel follows ISO 7730:2025 Annex D
// (ADR-0002 decision 6).
const ISO_EDITION = Standard.iso_7730_2025;

export const pmvPpdIso = {
  info: PMV_PPD_ISO_INFO,
  standard: ISO_EDITION,
  // After the quantities, the app's fixed policy: `wme: 0`, since external
  // work is not an input of the app; `limit_inputs: false`, since the app
  // gates entered values itself and reads the rows the run breaks off
  // `warnings`; `round_output: false`, since the charts contour the zones on
  // a scan of this `pmv` and the display rounds. No `units`: the library's
  // default is SI, and so is the boundary (ADR-0002 decision 1).
  run: (values) =>
    pmv_ppd_iso({
      tdb: values.tdb,
      tr: values.tr,
      vr: values.vr,
      rh: values.rh,
      met: values.met,
      clo: values.clo,
      wme: 0,
      standard: ISO_EDITION,
      limit_inputs: false,
      round_output: false,
    }),
  inputs: [
    { quantity: q.tdb, value: 25 },
    { quantity: q.tr, value: 25 },
    { quantity: q.v, value: 0.1 },
    { quantity: q.rh, value: 50 },
    { quantity: q.met, value: 1.1 },
    { quantity: q.clo, value: 0.5 },
  ],
  options: [],
  // The ranges the deployed CBE tool draws, not ISO 7730's applicability
  // bounds (ADR §4.4) — the charts show what the field looks like around the
  // standard, and `info`'s applicability says which of it the user may enter.
  axisRanges: [
    { quantity: q.tdb, min: 10, max: 40 },
    { quantity: q.tr, min: 10, max: 40 },
    { quantity: q.operative_tmp, min: 10, max: 40 },
    { quantity: q.hr, min: 0, max: 0.03 },
    { quantity: q.v, min: 0, max: 2 },
    { quantity: q.vr, min: 0, max: 2 },
    { quantity: q.rh, min: 0, max: 100 },
    { quantity: q.met, min: 1, max: 4 },
    { quantity: q.clo, min: 0, max: 2 },
    { quantity: q.clo_dynamic, min: 0, max: 2 },
  ],
  table: [q.pmv, q.ppd],
  // The scanned number is `pmv`, cut by the same thermal-sensation bins the
  // kernel classifies `tsv` with. The category bins cannot be the classifier:
  // they cut |PMV|, not the signed `pmv` scanned here, and the drift test
  // pairs the classifier with the output it classifies by identity.
  //
  // The zones are cut from a scan of `run` itself: Fanger unmodified at this edition.
  // The elevated-air-speed cooling effect belongs to `pmv_ppd_ashrae`.
  // Categories A, B and C, read off the bins the library classifies
  // `category` with: the category on the result is the library's, strict at
  // both ends, so a PMV of exactly 0.5 is C. The deployed tool's `≤` is a
  // difference not ported.
  scan: {
    output: q.pmv,
    classifier: PMV_THERMAL_SENSATION_VOTE_BINS_ISO,
    comfortZones: categoryZones(PMV_CATEGORY_BINS_ISO),
  },
  charts: [{ type: chartType.psychrometric }, { type: chartType.dynamic, axes: { x: q.tdb, y: q.v } }],
} satisfies RegisteredModel;
