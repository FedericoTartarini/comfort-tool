import { NO_ROOT_FOUND, psychrometricZone, type PsychrometricPoint } from "jsthermalcomfort/charts";
import { quantities } from "jsthermalcomfort/io";
import { psy_ta_rh } from "jsthermalcomfort/psychrometrics";
import { chartInk } from "$lib/core/bandPalette";
import { temperatureMode } from "$lib/core/entryModes";
import { requireValue, resolveQuantities } from "$lib/core/libraryInputs";
import { requireAxisRange, type PsychrometricDeclaration, type Range } from "$lib/core/modelDeclaration";
import { displayUnitFor } from "$lib/core/units";
import { copy } from "$lib/text/copy";
import {
  axisTitle,
  type Annotation,
  type ChartRequest,
  type ChartSpec,
  type LegendEntry,
  type Trace,
} from "./chartSpec";

const q = quantities;

/** Relative humidity of each isoline, [%]. The saturation line is the last one. */
const ISOLINE_STEP = 10;
/**
 * Samples along each isoline, across the declared temperature range. 121 over
 * 10–40 °C is the resolution the CBE tool draws these curves at.
 */
const ISOLINE_SAMPLES = 121;

/** One line per 5% relative humidity, as the ADR §4.7 precision requires. */
const ZONE_RH_STEP = 5;

/**
 * The psychrometric chart: relative-humidity isolines, the compliance zone
 * traced by `charts.psychrometricZone`, and the slot's current state.
 *
 * The x axis quantity is the temperature entry mode's (`tdb` when the two
 * temperatures are entered separately, `operative_tmp` under operative entry), and
 * operative entry solves the zone with `trFollowsDb`, which is the geometry
 * the CBE tool's psychtop chart draws. No root finder is written here — the
 * library owns that (ADR §4.1.4). The drawn extent is the model's declared
 * axis range for whichever temperature the mode puts on x, never its
 * applicability limits (ADR §4.4).
 */
export function psychrometricSpec(request: ChartRequest, chart: PsychrometricDeclaration): ChartSpec {
  const { model, slot, slotLabel, unitSystem } = request;
  const operative = slot.temperature.mode === temperatureMode.operative;
  const axisQuantity = slot.temperature.mode.axis;
  const dbUnit = displayUnitFor(axisQuantity, unitSystem);
  const hrUnit = displayUnitFor(q.hr, unitSystem);
  const rhUnit = displayUnitFor(q.rh, unitSystem);
  const dbRange = requireAxisRange(model, axisQuantity);
  const hrRange = requireAxisRange(model, q.hr);

  const resolved = resolveQuantities(slot, model);
  const zone = psychrometricZone({
    tr: requireValue(resolved, q.tr),
    trFollowsDb: operative,
    vr: requireValue(resolved, model.relativeAirSpeed ? q.vr : q.v),
    met: requireValue(resolved, q.met),
    clo: requireValue(resolved, q.clo),
    model: chart.pmvModel,
    rhStep: ZONE_RH_STEP,
    // Decided in the rewrite plan: reproduce the chart the CBE tool publishes.
    correctKnownDefects: false,
  });

  const traces: Trace[] = [];
  const legend: LegendEntry[] = [];
  const annotations: Annotation[] = [];

  const temperatures = samples(dbRange);
  for (let rh = ISOLINE_STEP; rh <= 100; rh += ISOLINE_STEP) {
    // Cut the curve where it leaves the top of the viewport, so the label sits
    // on the last drawn point rather than off the plot.
    const curve = temperatures
      .map((db) => ({ db, hr: psy_ta_rh(db, rh).hr }))
      .filter((point) => point.hr <= hrRange.max);
    const end = curve[curve.length - 1];
    if (!end) {
      continue;
    }
    const saturation = rh === 100;
    traces.push({
      kind: "path",
      x: curve.map((point) => dbUnit.fromSi(point.db)),
      y: curve.map((point) => hrUnit.fromSi(point.hr)),
      color: saturation ? chartInk.saturationLine : chartInk.isoline,
      width: saturation ? 1.5 : 1,
      // Chrome: the isolines carry the humidity reading in their label, not on
      // the pointer (ADR §4.4).
      hover: "off",
      label: `${q.rh.label} ${rh}${rhUnit.symbol}`,
    });
    annotations.push({
      x: dbUnit.fromSi(end.db),
      y: hrUnit.fromSi(end.hr),
      text: `${rh}${rhUnit.symbol}`,
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
      hover: "off",
      label: copy.comfortZone(zone.pmvLimit),
    });
    legend.push({ label: copy.comfortZone(zone.pmvLimit), swatch: "fill", color: chartInk.zoneFill });
  }

  traces.push({
    kind: "point",
    x: dbUnit.fromSi(requireValue(resolved, q.tdb)),
    y: hrUnit.fromSi(psy_ta_rh(requireValue(resolved, q.tdb), requireValue(resolved, q.rh)).hr),
    color: chartInk.marker,
    hover: "off",
    label: slotLabel,
  });
  legend.push({ label: slotLabel, swatch: "marker", color: chartInk.marker });

  return {
    traces,
    layout: {
      x: {
        title: axisTitle(axisQuantity, dbUnit.symbol),
        range: [dbUnit.fromSi(dbRange.min), dbUnit.fromSi(dbRange.max)],
      },
      y: {
        title: axisTitle(q.hr, hrUnit.symbol),
        range: [hrUnit.fromSi(hrRange.min), hrUnit.fromSi(hrRange.max)],
        tickFormat: ".3f",
      },
    },
    legend,
    annotations,
  };
}

/** `ISOLINE_SAMPLES` temperatures across the drawn range, in SI. */
function samples(range: Range): readonly number[] {
  const step = (range.max - range.min) / (ISOLINE_SAMPLES - 1);
  return Array.from({ length: ISOLINE_SAMPLES }, (_, index) => range.min + index * step);
}

/**
 * Unsolved rows carry whatever the solver returned — NaN from the secant
 * method, `NO_ROOT_FOUND` from the bisection fallback. Dropping them leaves a
 * shorter polygon rather than one with a spike in it.
 */
function isSolved(point: PsychrometricPoint): boolean {
  return Number.isFinite(point.db) && point.db !== NO_ROOT_FOUND && Number.isFinite(point.hr);
}
