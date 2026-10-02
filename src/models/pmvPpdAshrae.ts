import {
  PMV_COMPLIANCE_INTERVAL_ASHRAE,
  pmv_ppd_ashrae,
  PMV_PPD_ASHRAE_INFO,
  PMV_THERMAL_SENSATION_VOTE_BINS_ASHRAE,
  Standard,
} from "jsthermalcomfort";
import { chartType } from "$lib/core/chartType";
import { intervalZone } from "$lib/core/comfortZones";
import type { OptionSpec, RegisteredModel } from "$lib/core/modelDeclaration";
import { quantities } from "$lib/core/quantities";
import { copy } from "$lib/text/copy";

const q = quantities;

// The one version `pmv_ppd_ashrae` accepts.
const ASHRAE_55 = Standard.ashrae_55_2023;

// Off by default, the deployed CBE tool's default, where the library's own is
// on (Phase 4b spec, PMV (ASHRAE 55)'s declaration).
//
// The air-speed rule, which applies only with it off, follows the library, not
// the deployed tool (rewrite plan, Phase 4b item 1): up to three upper bounds
// on `vr`, at ISO 7726's air-speed-weighted operative temperature, applied
// only below 0.7 clo and 1.3 met, and shown on the entered `v`. The deployed
// tool checks the entered `v` against one limit clamped to 0.2–0.8 m/s, at
// `(tdb + tr) / 2`, at every clothing and activity level. The difference is
// not ported.
const airSpeedControl: OptionSpec = {
  key: "airspeed_control",
  label: "Occupants control the air speed",
  default: false,
};

export const pmvPpdAshrae = {
  info: PMV_PPD_ASHRAE_INFO,
  standard: ASHRAE_55,
  // After the quantities and the option, the app's fixed policy: `wme: 0`,
  // since external work is not an input of the app; `limit_inputs: false`,
  // since the app gates entered values itself and reads the rows the run
  // breaks off `warnings`, the air-speed rule's among them; `round_output:
  // false`, since the charts contour the zone on a scan of this `pmv` and
  // the display rounds; `suppress_warnings: true`, since the cooling effect logs
  // each time it assumes 0 and a chart scan calls it per cell. No `units`: the
  // library's default is SI, and so is the boundary (ADR-0002 decision 1).
  run: (values, options) =>
    pmv_ppd_ashrae({
      tdb: values.tdb,
      tr: values.tr,
      vr: values.vr,
      rh: values.rh,
      met: values.met,
      clo: values.clo,
      wme: 0,
      standard: ASHRAE_55,
      limit_inputs: false,
      round_output: false,
      suppress_warnings: true,
      airspeed_control: options(airSpeedControl),
    }),
  inputs: [
    { quantity: q.tdb, value: 25 },
    { quantity: q.tr, value: 25 },
    { quantity: q.v, value: 0.1 },
    { quantity: q.rh, value: 50 },
    { quantity: q.met, value: 1.1 },
    { quantity: q.clo, value: 0.5 },
  ],
  options: [airSpeedControl],
  // The same ranges as PMV (ISO 7730) today; each declaration owns its own.
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
  // `compliance` reads Yes or No, as Adaptive's acceptabilities do.
  table: [q.pmv, q.ppd, q.compliance],
  // The scanned number is `pmv`, cut by the same thermal-sensation bins the
  // kernel classifies `tsv` with: ISO's Edges, right-inclusive where ISO's
  // are not, so a PMV of exactly 0.5 is Neutral here. The zone is cut from
  // a scan of `run` itself, so of the cooling-effect PMV at the relative air speed
  // derived from the entered one. One zone, the interval `compliance` is read
  // against.
  scan: {
    output: q.pmv,
    classifier: PMV_THERMAL_SENSATION_VOTE_BINS_ASHRAE,
    comfortZones: [intervalZone(copy.comfortZone, PMV_COMPLIANCE_INTERVAL_ASHRAE)],
  },
  charts: [{ type: chartType.psychrometric }, { type: chartType.dynamic, axes: { x: q.tdb, y: q.v } }],
} satisfies RegisteredModel;
