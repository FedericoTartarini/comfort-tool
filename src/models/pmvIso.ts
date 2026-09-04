import { io, pmv_ppd_iso } from "jsthermalcomfort";
import { chartType } from "$lib/core/chartType";
import { defineModel } from "$lib/core/modelDeclaration";

const q = io.quantities;

export const pmvIso = defineModel({
  run: io.pmvPpdIso,
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
  table: [q.pmv, q.ppd],
  charts: [
    // ISO 7730 is Fanger unmodified; the elevated-air-speed cooling effect is
    // the ASHRAE variant's.
    { type: chartType.psychrometric, pmvVariant: "ISO" },
    { type: chartType.dynamic, axes: { x: q.tdb, y: q.v }, output: q.pmv },
  ],
});
