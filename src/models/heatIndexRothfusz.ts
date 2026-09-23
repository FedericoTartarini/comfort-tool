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
  run: (values) =>
    heat_index_rothfusz(...values(q.tdb, q.rh), {
      // `round` is this function's name for the switch, and it defaults to on.
      // Off here: `run` returns the unrounded number and the display rounds, so
      // the scanned surface is continuous rather than quantised to 0.1 °C.
      round: false,
      units: "SI",
      limit_inputs: false,
    }),
  name: "heat_index_rothfusz",
  inputs: [
    { quantity: q.tdb, value: 30 },
    { quantity: q.rh, value: 50 },
  ],
  options: [],
  relativeAirSpeed: false,
  // Both quantities declared, because the applicability fallback can answer for
  // neither: `rh` has no bound at all and `tdb`'s is `min`-only (ADR §4.4).
  axisRanges: [
    { quantity: q.tdb, min: 20, max: 50 },
    { quantity: q.rh, min: 0, max: 100 },
  ],
  table: [q.hi, q.stress_category],
  charts: [
    // The scanned number is `hi`, cut by the same stress-category bins the
    // kernel classifies `stress_category` with.
    // `HEAT_INDEX_ROTHFUSZ_INFO.outputs.stress_category.classifier` is the same
    // object but types as possibly undefined, and a declaration carries no cast
    // (ADR-0002 decision 27).
    {
      type: chartType.dynamic,
      axes: { x: q.tdb, y: q.rh },
      output: q.hi,
      bands: HEAT_INDEX_STRESS_CATEGORY_BINS,
    },
  ],
} satisfies RegisteredModel;
