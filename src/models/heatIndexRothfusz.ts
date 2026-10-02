import { heat_index_rothfusz, HEAT_INDEX_ROTHFUSZ_INFO, HEAT_INDEX_STRESS_CATEGORY_BINS } from "jsthermalcomfort";
import { chartType } from "$lib/core/chartType";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { quantities } from "$lib/core/quantities";

const q = quantities;

export const heatIndexRothfusz = {
  info: HEAT_INDEX_ROTHFUSZ_INFO,
  // No `standard`: `HEAT_INDEX_ROTHFUSZ_INFO.standards` is empty. The Rothfusz
  // regression is not published by one, so the model has no Standard page and
  // is reached through Explore alone.
  // `round_output: false`: `run` returns the unrounded number and the display
  // rounds, so the scanned surface is continuous rather than quantised to
  // 0.1 °C. `limit_inputs: false`: the app gates entered values itself and
  // reads the rows the run breaks off `warnings`. The function takes no
  // `units`, and no `wme` or `standard`.
  run: (values) => heat_index_rothfusz({ tdb: values.tdb, rh: values.rh, round_output: false, limit_inputs: false }),
  inputs: [
    { quantity: q.tdb, value: 30 },
    { quantity: q.rh, value: 50 },
  ],
  options: [],
  // Both quantities declared, because the applicability fallback can answer for
  // neither: `rh` has no bound at all and `tdb`'s is `min`-only (ADR §4.4).
  axisRanges: [
    { quantity: q.tdb, min: 20, max: 50 },
    { quantity: q.rh, min: 0, max: 100 },
  ],
  table: [q.hi],
  // The scanned number is `hi`, cut by the same stress-category bins the
  // kernel classifies `stress_category` with. No Comfort zones: the model has
  // no standard to draw a limit on it.
  scan: { output: q.hi, classifier: HEAT_INDEX_STRESS_CATEGORY_BINS },
  charts: [{ type: chartType.dynamic, axes: { x: q.tdb, y: q.rh } }],
} satisfies RegisteredModel;
