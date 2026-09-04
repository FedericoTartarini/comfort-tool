import { NO_ROOT_FOUND, psychrometricZone, type PsychrometricPoint } from "jsthermalcomfort/charts";
import { quantities } from "jsthermalcomfort/io";
import { psy_ta_rh } from "jsthermalcomfort/psychrometrics";
import { chartInk } from "$lib/core/bandPalette";
import { temperatureMode } from "$lib/core/entryModes";
import { requireValue, resolveQuantities } from "$lib/core/libraryInputs";
import type { PsychrometricDeclaration } from "$lib/core/modelDeclaration";
import { displayUnitFor } from "$lib/core/units";
import { copy } from "$lib/text/copy";
import { axisTitle, type ChartRequest, type ChartSpec, type LegendEntry, type Trace } from "./chartSpec";

const q = quantities;

/**
 * The viewport of the psychrometric chart, in SI. A presentation choice, not a
 * threshold: these are the axis limits the CBE tool publishes, and the zone is
 * simply clipped to them. The library returns geometry unclipped.
 */
const VIEWPORT = {
  db: [10, 36],
  hr: [0, 0.03],
} as const;

/** Relative humidity of each isoline, [%]. The saturation line is the last one. */
const ISOLINE_STEP = 10;
/** Temperature step along an isoline, [°C]. Fine enough that the curve reads as smooth. */
const ISOLINE_STEP_DB = 0.5;

/** One line per 5% relative humidity, as the ADR §4.7 precision requires. */
const ZONE_RH_STEP = 5;

/** Every isoline is sampled at the same temperatures. */
const ISOLINE_TEMPERATURES: readonly number[] = Array.from(
  { length: Math.floor((VIEWPORT.db[1] - VIEWPORT.db[0]) / ISOLINE_STEP_DB) + 1 },
  (_, index) => VIEWPORT.db[0] + index * ISOLINE_STEP_DB,
);

/**
 * The psychrometric chart: relative-humidity isolines, the compliance zone
 * traced by `charts.psychrometricZone`, and the slot's current state.
 *
 * The x axis quantity is the temperature entry mode's (`tdb` when the two
 * temperatures are entered separately, `t_o` under operative entry), and
 * operative entry solves the zone with `trFollowsDb`, which is the geometry
 * the CBE tool's psychtop chart draws. No root finder is written here — the
 * library owns that (ADR §4.1.4).
 */
export function psychrometricSpec(request: ChartRequest, chart: PsychrometricDeclaration): ChartSpec {
  const { model, slot, slotLabel, unitSystem } = request;
  const operative = slot.temperature.mode === temperatureMode.operative;
  const axisQuantity = slot.temperature.mode.axis;
  const dbUnit = displayUnitFor(axisQuantity, unitSystem);
  const hrUnit = displayUnitFor(q.hr, unitSystem);

  const resolved = resolveQuantities(slot, model);
  const zone = psychrometricZone({
    tr: requireValue(resolved, q.tr),
    trFollowsDb: operative,
    vr: requireValue(resolved, model.relativeAirSpeed ? q.vr : q.v),
    met: requireValue(resolved, q.met),
    clo: requireValue(resolved, q.clo),
    standard: chart.pmvVariant,
    rhStep: ZONE_RH_STEP,
    // Decided in the rewrite plan: reproduce the chart the CBE tool publishes.
    correctKnownDefects: false,
  });

  const traces: Trace[] = [];
  const legend: LegendEntry[] = [];

  for (let rh = ISOLINE_STEP; rh <= 100; rh += ISOLINE_STEP) {
    const saturation = rh === 100;
    traces.push({
      kind: "path",
      x: ISOLINE_TEMPERATURES.map((db) => dbUnit.fromSi(db)),
      y: ISOLINE_TEMPERATURES.map((db) => hrUnit.fromSi(psy_ta_rh(db, rh).hr)),
      color: saturation ? chartInk.saturationLine : chartInk.isoline,
      width: saturation ? 1.5 : 1,
      label: `${q.rh.label} ${rh}%`,
    });
  }
  legend.push({ label: q.rh.label, swatch: "line", color: chartInk.isoline });

  const polygon = zone.polygon.filter(isSolved);
  if (polygon.length > 2) {
    traces.push({
      kind: "path",
      x: polygon.map((point) => dbUnit.fromSi(point.db)),
      y: polygon.map((point) => hrUnit.fromSi(point.hr)),
      color: chartInk.zoneLine,
      width: 1.5,
      fill: chartInk.zoneFill,
      label: copy.comfortZone(zone.pmvLimit),
    });
    legend.push({ label: copy.comfortZone(zone.pmvLimit), swatch: "fill", color: chartInk.zoneFill });
  }

  traces.push({
    kind: "point",
    x: dbUnit.fromSi(requireValue(resolved, q.tdb)),
    y: hrUnit.fromSi(psy_ta_rh(requireValue(resolved, q.tdb), requireValue(resolved, q.rh)).hr),
    color: chartInk.marker,
    label: slotLabel,
  });
  legend.push({ label: slotLabel, swatch: "marker", color: chartInk.marker });

  return {
    traces,
    layout: {
      x: { title: axisTitle(axisQuantity, dbUnit.symbol), range: [dbUnit.fromSi(VIEWPORT.db[0]), dbUnit.fromSi(VIEWPORT.db[1])] },
      y: {
        title: axisTitle(q.hr, hrUnit.symbol),
        range: [hrUnit.fromSi(VIEWPORT.hr[0]), hrUnit.fromSi(VIEWPORT.hr[1])],
        tickFormat: ".3f",
      },
    },
    legend,
  };
}

/**
 * Unsolved rows carry whatever the solver returned — NaN from the secant
 * method, `NO_ROOT_FOUND` from the bisection fallback. Dropping them leaves a
 * shorter polygon rather than one with a spike in it.
 */
function isSolved(point: PsychrometricPoint): boolean {
  return Number.isFinite(point.db) && point.db !== NO_ROOT_FOUND && Number.isFinite(point.hr);
}
