import { psy_ta_rh } from "jsthermalcomfort";
import { chartInk } from "$lib/core/bandPalette";
import { pmv_psychrometric_zone, type PmvFunction } from "$lib/temporary-library/pmv_psychrometric_zone";
import { temperatureMode } from "$lib/core/entryModes";
import { optionsReader, requireValue, resolveQuantities, valuesReader } from "$lib/core/libraryInputs";
import {
  requireAxisRange,
  type OptionsReader,
  type PsychrometricDeclaration,
  type RegisteredModel,
} from "$lib/core/modelDeclaration";
import { resultNumber } from "$lib/core/modelRun";
import { formatNumber } from "$lib/core/numberFormat";
import { quantities, type Quantity } from "$lib/core/quantities";
import { displayUnitFor, valueWithUnit } from "$lib/core/units";
import { copy } from "$lib/text/copy";
import type { Annotation, ChartRequest, ChartSpec, LegendEntry, Trace } from "./chartSpec";
import { axisFor, markerFor, samples } from "./specParts";

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
 * The psychrometric chart: relative-humidity isolines, the declaration's
 * Comfort zones traced by `pmv_psychrometric_zone`, and the slot's current
 * state.
 *
 * The zones are drawn largest first, so each inner one sits on top, in one
 * hue whose opacity rises inwards. Never the thermal-sensation palette: it is
 * diverging, and nested zones are levels of one thing.
 *
 * The x axis quantity is the temperature entry mode's (`tdb` when the two
 * temperatures are entered separately, `operative_tmp` under operative entry), and
 * operative entry solves the zone with `tr_follows_db`, which is the geometry
 * the CBE tool's psychtop chart draws. No root finder is written here — the
 * temporary library owns that (ADR-0002 decision 24). The drawn extent is the model's declared
 * axis range for whichever temperature the mode puts on x, never its
 * applicability limits (ADR §4.4).
 */
export function psychrometricSpec(request: ChartRequest, chart: PsychrometricDeclaration): ChartSpec {
  const { model, slot, slotLabel, unitSystem } = request;
  const operative = slot.temperature.mode === temperatureMode.operative;
  const axisQuantity = slot.temperature.mode.axis;
  const xUnit = displayUnitFor(axisQuantity, unitSystem);
  const hrUnit = displayUnitFor(q.hr, unitSystem);
  const rhUnit = displayUnitFor(q.rh, unitSystem);
  const xRange = requireAxisRange(model, axisQuantity);
  const hrRange = requireAxisRange(model, q.hr);

  const resolved = resolveQuantities(slot, model);
  const airSpeed = model.relativeAirSpeed ? q.vr : q.v;
  // Every zone is solved at the same inputs; only the limit differs.
  const zoneInputs = {
    tr: requireValue(resolved, q.tr),
    vr: requireValue(resolved, airSpeed),
    met: requireValue(resolved, q.met),
    clo: requireValue(resolved, q.clo),
    pmv_function: pmvOfRun(model, resolved, optionsReader(slot.options), airSpeed),
    tr_follows_db: operative,
    rh_step: ZONE_RH_STEP,
  };
  const largestFirst = [...chart.zones].sort((a, b) => b.limit - a.limit);

  const traces: Trace[] = [];
  const legend: LegendEntry[] = [];
  const annotations: Annotation[] = [];

  const temperatures = samples(xRange, ISOLINE_SAMPLES);
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
    const rhText = valueWithUnit(formatNumber(rhUnit.fromSi(rh)), rhUnit);
    traces.push({
      kind: "path",
      x: curve.map((point) => xUnit.fromSi(point.db)),
      y: curve.map((point) => hrUnit.fromSi(point.hr)),
      color: saturation ? chartInk.saturationLine : chartInk.isoline,
      width: saturation ? 1.5 : 1,
      // Chrome: the isolines carry the humidity reading in their label, not on
      // the pointer (ADR §4.4).
      hover: "off",
      label: `${q.rh.label} ${rhText}`,
    });
    annotations.push({
      x: xUnit.fromSi(end.db),
      y: hrUnit.fromSi(end.hr),
      text: rhText,
    });
  }
  legend.push({ label: q.rh.label, swatch: "line", color: chartInk.isoline });

  largestFirst.forEach((zone, index) => {
    const solved = pmv_psychrometric_zone({ ...zoneInputs, pmv_limit: zone.limit });
    // An unsolved point carries NaN, so dropping it leaves a shorter polygon
    // rather than one with a spike in it.
    const polygon = solved.polygon.filter((point) => Number.isFinite(point.tdb) && Number.isFinite(point.hr));
    if (polygon.length <= 2) {
      return;
    }
    const label = copy.zoneLegend(zone);
    const fill = chartInk.zoneFill(index, largestFirst.length);
    traces.push({
      kind: "path",
      x: polygon.map((point) => xUnit.fromSi(point.tdb)),
      y: polygon.map((point) => hrUnit.fromSi(point.hr)),
      color: chartInk.zoneLine,
      width: chartInk.zoneLineWidth,
      fill,
      hover: "off",
      label,
    });
    legend.push({ label, swatch: "fill", color: fill });
  });

  const marker = markerFor(
    slotLabel,
    xUnit.fromSi(requireValue(resolved, q.tdb)),
    hrUnit.fromSi(psy_ta_rh(requireValue(resolved, q.tdb), requireValue(resolved, q.rh)).hr),
  );
  traces.push(marker.trace);
  legend.push(marker.legendEntry);

  return {
    traces,
    layout: {
      x: axisFor(axisQuantity, xUnit, xRange),
      y: axisFor(q.hr, hrUnit, hrRange),
    },
    legend,
    annotations,
  };
}

/**
 * The zone's PMV function: the model's own `run` at the slot's resolved
 * inputs, with the six the solver varies replaced. The zone therefore solves
 * exactly the equation the results table shows, edition, `wme` and options
 * included, and no declaration has to restate it. `run` returns unrounded
 * output for this reason: a PMV rounded to 0.01 is a staircase the solver
 * cannot root-find. That a model declaring this chart carries `pmv` at all is
 * a registry-wide test's (`core/modelDeclaration.test.ts`), not a read here.
 */
function pmvOfRun(
  model: RegisteredModel,
  resolved: ReadonlyMap<Quantity, number>,
  options: OptionsReader,
  airSpeed: Quantity,
): PmvFunction {
  return (tdb, tr, vr, rh, met, clo) => {
    const inputs = new Map(resolved)
      .set(q.tdb, tdb)
      .set(q.tr, tr)
      .set(airSpeed, vr)
      .set(q.rh, rh)
      .set(q.met, met)
      .set(q.clo, clo);
    return resultNumber(model.run(valuesReader(inputs), options), q.pmv);
  };
}
