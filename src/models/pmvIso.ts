import { io, pmv_ppd_iso } from "jsthermalcomfort";
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
});
