import { pmv_ppd_iso, PMV_PPD_ISO_INFO, PMV_THERMAL_SENSATION_VOTE_BINS_ISO } from "jsthermalcomfort";
import { customEnsemble } from "$lib/core/calculators";
import { chartType } from "$lib/core/chartType";
import { categoryZones } from "$lib/core/comfortZones";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { quantities } from "$lib/core/quantities";

const q = quantities;

export const pmvPpdIso = {
  // The edition and the category bins are the library's default: `run` passes
  // no `standard`, so the library picks its default edition, the one its info
  // lists first (ADR-0002 decision 86, rule 3), and the zones are cut from the
  // bins its info classifies `category` with, that edition's (decision 80). A
  // library release that changes its default changes both.
  info: PMV_PPD_ISO_INFO,
  // After the quantities, the app's fixed policy: `wme: 0`, since external
  // work is not an input of the app; `limit_inputs: false`, since the app
  // gates entered values itself and reads the rows the run breaks off
  // `warnings`; `round_output: false`, since the charts trace the zones on
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
      limit_inputs: false,
      round_output: false,
    }),
  inputs: [
    { quantity: q.tdb, value: 25 },
    { quantity: q.tr, value: 25 },
    { quantity: q.v, value: 0.1 },
    { quantity: q.rh, value: 50 },
    { quantity: q.met, value: 1.1 },
    { quantity: q.clo, value: 0.5, calculators: [customEnsemble] },
  ],
  // Demonstration ranges: the deployed tool's where it draws the quantity and
  // its range holds what may be entered (`hr`, 30 g/kg past the 27.2 g/kg of
  // saturated air at 30 °C; `rh`), else what may be entered (`tr`), or what
  // the model is given inside its rows (`v` by `vr`'s bound; the clothing
  // insulation, and the dynamic one with it, past the 3.13 clo given as the
  // model's 2 at 4 met where `vr` is 1 m/s).
  // `tdb` and `operative_tmp` end at 35 °C, one short of the deployed EN
  // page's 36, where the single-column Image's 80 % and 90 % labels would
  // overlap. The Comfort zones end at ISO 7730's 30 °C and 2 700 Pa inside
  // the plot.
  axisRanges: [
    { quantity: q.tdb, min: 10, max: 35 },
    { quantity: q.tr, min: 10, max: 40 },
    { quantity: q.operative_tmp, min: 10, max: 35 },
    { quantity: q.hr, min: 0, max: 0.03 },
    { quantity: q.v, min: 0, max: 1 },
    { quantity: q.vr, min: 0, max: 1 },
    { quantity: q.rh, min: 0, max: 100 },
    { quantity: q.met, min: 0.8, max: 4 },
    { quantity: q.clo, min: 0, max: 4 },
    { quantity: q.clo_dynamic, min: 0, max: 4 },
  ],
  table: [q.tsv, q.category, q.pmv, q.ppd],
  // The scanned number is `pmv`, cut by the same thermal-sensation bins the
  // kernel classifies `tsv` with. The category bins cannot be the classifier:
  // they cut |PMV|, not the signed `pmv` scanned here, and the drift test
  // pairs the classifier with the output it classifies by identity.
  //
  // The zones are cut from a scan of `run` itself: Fanger unmodified at this edition.
  // The elevated-air-speed cooling effect belongs to `pmv_ppd_ashrae`.
  // Categories I to IV, read off the bins the library classifies `category`
  // with: the category on the result is the library's, strict at both ends,
  // so a PMV of exactly 0.5 is III. The deployed tool's `≤` is a difference
  // not ported.
  scan: {
    output: q.pmv,
    classifier: PMV_THERMAL_SENSATION_VOTE_BINS_ISO,
    comfortZones: categoryZones(PMV_PPD_ISO_INFO.outputs.category.classifier),
  },
  charts: [{ type: chartType.psychrometric }, { type: chartType.dynamic, axes: { x: q.tdb, y: q.v } }],
} satisfies RegisteredModel;
