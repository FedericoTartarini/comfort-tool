import { psy_ta_rh } from "jsthermalcomfort";
import { chartInk } from "$lib/core/bandPalette";
import { pmv_psychrometric_zone, type PmvFunction } from "$lib/temporary-library/pmv_psychrometric_zone";
import { temperatureMode } from "$lib/core/entryModes";
import { optionsReader, resolveQuantities, valuesReader } from "$lib/core/libraryInputs";
import {
  requireAxisRange,
  takesRelativeAirSpeed,
  type DeclaredPsychrometricChart,
  type OptionsReader,
  type Range,
  type RegisteredModel,
} from "$lib/core/modelDeclaration";
import { resultNumber } from "$lib/core/modelRun";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities, type Quantity } from "$lib/core/quantities";
import { requireValue, withEntryModes } from "$lib/core/slot";
import { displayUnitFor, numberWithUnit } from "$lib/core/units";
import { copy } from "$lib/text/copy";
import type { ChartRequest } from "./chartRequest";
import type { Annotation, ChartSpec, LegendEntry, Trace } from "./chartSpec";
import { axisFor, labelFor, markerFor, samples, zoneFor } from "./specParts";

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
 * The psychrometric chart: relative-humidity isolines, and for every slot of
 * the request the declaration's Comfort zones traced by
 * `pmv_psychrometric_zone` at that slot's own values and the slot's current
 * state (ADR-0002 decision 50).
 *
 * A slot's zones are drawn largest first, so each inner one sits on top, in
 * the slot's hue with the opacity rising inwards. Never the thermal-sensation
 * palette: it is diverging, and nested zones are levels of one thing.
 *
 * The x axis quantity is that of the temperature entry mode among
 * {@link ChartRequest.entryModes}: `tdb` when the two temperatures are entered
 * separately, `operative_tmp` under operative entry, and operative entry
 * solves the zone with `tr_follows_db`, which is the geometry
 * the CBE tool's psychtop chart draws. No root finder is written here — the
 * temporary library owns that (ADR-0002 decision 24). The drawn x range is the
 * model's axis range for whichever temperature the mode puts on x: declared,
 * else its applicability bound (ADR-0002 decision 5).
 *
 * The isolines, the zones and the marker are of the air at the request's
 * atmospheric pressure, and the humidity-ratio axis reaches as far as
 * {@link drawnHumidityRatioRange} says (ADR-0002 decision 49).
 */
export function psychrometricSpec(request: ChartRequest, chart: DeclaredPsychrometricChart): ChartSpec {
  const { model, unitSystem, atmosphericPressure } = request;
  const { mode } = request.entryModes.temperature;
  const operative = mode === temperatureMode.operative;
  const axisQuantity = mode.axis;
  const xUnit = displayUnitFor(axisQuantity, unitSystem);
  const hrUnit = displayUnitFor(q.hr, unitSystem);
  const rhUnit = displayUnitFor(q.rh, unitSystem);
  const xRange = requireAxisRange(model, axisQuantity);
  const hrRange = drawnHumidityRatioRange(requireAxisRange(model, q.hr), atmosphericPressure);
  const airSpeed = takesRelativeAirSpeed(model) ? q.vr : q.v;
  const largestFirst = [...chart.zones].sort((a, b) => b.limit - a.limit);

  const traces: Trace[] = [];
  const legend: LegendEntry[] = [];
  const annotations: Annotation[] = [];

  const temperatures = samples(xRange, ISOLINE_SAMPLES);
  for (let rh = ISOLINE_STEP; rh <= 100; rh += ISOLINE_STEP) {
    // Cut the curve where it leaves the top of the viewport, so the label sits
    // on the last drawn point rather than off the plot.
    const curve = temperatures
      .map((db) => ({ db, hr: psy_ta_rh(db, rh, atmosphericPressure).hr }))
      .filter((point) => point.hr <= hrRange.max);
    const end = curve[curve.length - 1];
    if (!end) {
      continue;
    }
    const saturation = rh === 100;
    const rhText = numberWithUnit(rh, rhUnit);
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

  // Every slot's zones below every marker, so no slot's zone covers another's marker.
  const markers: Trace[] = [];
  for (const charted of request.slots) {
    const resolved = resolveQuantities(withEntryModes(charted.slot, request.entryModes, model), model, atmosphericPressure);
    // Every zone of a slot is solved at the same inputs; only the limit differs.
    const zoneInputs = {
      tr: requireValue(resolved, q.tr),
      vr: requireValue(resolved, airSpeed),
      met: requireValue(resolved, q.met),
      clo: requireValue(resolved, q.clo),
      pmv_function: pmvOfRun(model, resolved, optionsReader(charted.slot.options), airSpeed),
      tr_follows_db: operative,
      rh_step: ZONE_RH_STEP,
      p_atm: atmosphericPressure,
    };
    largestFirst.forEach((zone, index) => {
      const solved = pmv_psychrometric_zone({ ...zoneInputs, pmv_limit: zone.limit });
      // An unsolved point carries NaN, so dropping it leaves a shorter polygon
      // rather than one with a spike in it.
      const polygon = solved.polygon.filter((point) => Number.isFinite(point.tdb) && Number.isFinite(point.hr));
      if (polygon.length <= 2) {
        return;
      }
      const drawnZone = zoneFor(
        labelFor(request, charted, copy.zoneLegend(zone)),
        polygon.map((point) => xUnit.fromSi(point.tdb)),
        polygon.map((point) => hrUnit.fromSi(point.hr)),
        index,
        largestFirst.length,
        charted.hue,
      );
      traces.push(drawnZone.trace);
      legend.push(drawnZone.legendEntry);
    });

    const tdb = requireValue(resolved, q.tdb);
    const marker = markerFor(
      charted,
      xUnit.fromSi(tdb),
      hrUnit.fromSi(psy_ta_rh(tdb, requireValue(resolved, q.rh), atmosphericPressure).hr),
    );
    markers.push(marker.trace);
    legend.push(marker.legendEntry);
  }
  traces.push(...markers);

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
 * The humidity-ratio axis as drawn at `atmosphericPressure`. A declaration
 * writes its range at the default pressure; the upper end is scaled by the
 * default over the pressure, so a thinner air, which holds more water per
 * kilogram at the same relative humidity, gets a taller axis and the
 * declaration never mentions the pressure (ADR-0002 decision 45, as amended
 * 2026-09-29).
 */
function drawnHumidityRatioRange(declared: Range, atmosphericPressure: number): Range {
  return { ...declared, max: (declared.max * DEFAULT_ATMOSPHERIC_PRESSURE) / atmosphericPressure };
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
