import { hr_to_rh, psy_ta_rh } from "jsthermalcomfort";
import { chartInk } from "$lib/core/bandPalette";
import { pmv_psychrometric_zone, type PmvFunction } from "$lib/temporary-library/pmv_psychrometric_zone";
import { temperatureMode } from "$lib/core/entryModes";
import { optionsReader, resolveQuantities, valuesReader } from "$lib/core/libraryInputs";
import {
  requireAxisRange,
  requireScan,
  takesRelativeAirSpeed,
  type OptionsReader,
  type Range,
  type RegisteredModel,
} from "$lib/core/modelDeclaration";
import { resultNumber } from "$lib/core/modelRun";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities, type Quantity } from "$lib/core/quantities";
import { requireValue, withEntryModes, type ValueEntryModes } from "$lib/core/slot";
import { displayUnitFor, numberWithUnit } from "$lib/core/units";
import { copy } from "$lib/text/copy";
import type { ChartRequest } from "./chartRequest";
import type { Annotation, ChartSpec, LegendEntry, Trace } from "./chartSpec";
import {
  axisFor,
  bandLabels,
  bandsFor,
  GRID,
  labelFor,
  markerFor,
  readoutLine,
  samples,
  scannedField,
  zoneFor,
  type ScanFrame,
  type ScannedField,
} from "./specParts";

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
 * The frame `model`'s psychrometric chart is scanned in (ADR-0002 decision
 * 61): the model's scan's output, swept over the temperature entry mode's axis
 * quantity — `tdb`, or `operative_tmp` under operative entry — across its
 * declared range, and over the humidity ratio across the range drawn at the
 * pressure. Sweeping `hr` puts each cell in the humidity-ratio entry mode, so
 * the slot's own conversion gives its relative humidity at the pressure and at
 * the temperature the mode has, and a supersaturated cell is run at its true
 * relative humidity above 100. A model without a scan throws, naming it.
 */
export function psychrometricScanFrameFor(
  model: RegisteredModel,
  entryModes: ValueEntryModes,
  atmosphericPressure: number,
): ScanFrame {
  const axis = entryModes.temperature.mode.axis;
  return {
    model,
    output: requireScan(model).output,
    x: { quantity: axis, range: requireAxisRange(model, axis) },
    y: { quantity: q.hr, range: drawnHumidityRatioRange(requireAxisRange(model, q.hr), atmosphericPressure) },
    entryModes,
    atmosphericPressure,
  };
}

/**
 * The psychrometric chart: relative-humidity isolines, the marker of every
 * slot of the request, and what the request paints (ADR-0002 decision 58).
 *
 * Given a Band list ({@link ChartRequest.bands}), the first slot's scan in
 * {@link psychrometricScanFrameFor}'s frame cut by the list, as the dynamic
 * chart cuts its own: each coloured band over its interval of the number,
 * under the isolines, and a hover grid reading the temperature, the humidity
 * ratio, that slot's number and the band the library's `classifyFromBins`
 * puts it in on the list. A cell above saturation, `rh` > 100 at the
 * pressure, is air that cannot exist: it is scanned and painted, the cover
 * hides it, and it reads "—" and no band. `scans`, one per slot in the
 * request's order, are the slots' fields in that frame, handed over by a
 * caller that keeps them; without them the first slot is scanned here. No
 * Comfort zone is drawn.
 *
 * Given none, for every slot of the request the model's scan's Comfort zones
 * traced by `pmv_psychrometric_zone` at that slot's own values and the slot's
 * current state (ADR-0002 decision 50), and nothing reads the pointer.
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
 *
 * On either page the region above the saturation line is covered
 * ({@link coverFor}), over the paint and the hover grid and under the
 * isolines, the zones and the markers (ADR-0002 decision 61).
 */
export function psychrometricSpec(request: ChartRequest, scans?: readonly ScannedField[]): ChartSpec {
  const { model, unitSystem, atmosphericPressure, bands } = request;
  const { mode } = request.entryModes.temperature;
  const operative = mode === temperatureMode.operative;
  const axisQuantity = mode.axis;
  const xUnit = displayUnitFor(axisQuantity, unitSystem);
  const hrUnit = displayUnitFor(q.hr, unitSystem);
  const rhUnit = displayUnitFor(q.rh, unitSystem);
  const frame = psychrometricScanFrameFor(model, request.entryModes, atmosphericPressure);
  const xRange = frame.x.range;
  const hrRange = frame.y.range;
  const airSpeed = takesRelativeAirSpeed(model) ? q.vr : q.v;
  // A Band list paints no Comfort zone (ADR-0002 decision 58). A model
  // declaring this chart has zones in its scan, which a registry-wide test
  // holds (`core/modelDeclaration.test.ts`); one without, which that test
  // refuses, would draw no zone.
  const largestFirst = bands ? [] : [...(model.scan?.comfortZones ?? [])].sort((a, b) => b.limit - a.limit);

  const traces: Trace[] = [];
  const legend: LegendEntry[] = [];
  const annotations: Annotation[] = [];
  /** The Band list's legend entries, after the isolines' as the zones' are. */
  const bandLegend: LegendEntry[] = [];

  if (bands) {
    const field = scans?.[0] ?? scannedField(frame, request.slots[0].slot);
    const outputUnit = displayUnitFor(frame.output, unitSystem);
    const xValues = samples(xRange, GRID);
    const yValues = samples(hrRange, GRID);
    const displayedAxes = { x: xValues.map((value) => xUnit.fromSi(value)), y: yValues.map((value) => hrUnit.fromSi(value)) };
    const z = field.map((row) => row.map((value) => (Number.isNaN(value) ? null : value)));
    const painted = bandsFor(bands, { ...displayedAxes, z });
    traces.push(painted.trace);
    bandLegend.push(...painted.legendEntries);
    // The bands read nothing, so the hover grid reads for them, under the cover.
    traces.push({
      kind: "hoverGrid",
      hover: "field",
      ...displayedAxes,
      hoverText: yValues.map((hr, yIndex) =>
        xValues.map((temperature, xIndex) => {
          const supersaturated = hr_to_rh(hr, temperature, atmosphericPressure) > 100;
          const value = supersaturated ? Number.NaN : field[yIndex][xIndex];
          return [
            readoutLine(axisQuantity, xUnit, temperature),
            readoutLine(q.hr, hrUnit, hr),
            readoutLine(frame.output, outputUnit, value),
            ...bandLabels(value, bands),
          ];
        }),
      ),
    });
  }

  const temperatures = samples(xRange, ISOLINE_SAMPLES);
  const isolines: Trace[] = [];
  let cover: Trace | undefined;
  for (let rh = ISOLINE_STEP; rh <= 100; rh += ISOLINE_STEP) {
    const sampled = temperatures.map((temperature) => ({ temperature, hr: psy_ta_rh(temperature, rh, atmosphericPressure).hr }));
    // Cut the curve where it leaves the top of the viewport, so the label sits
    // on the last drawn point rather than off the plot.
    const curve = sampled.filter((point) => point.hr <= hrRange.max);
    const end = curve[curve.length - 1];
    if (!end) {
      continue;
    }
    const saturation = rh === 100;
    if (saturation) {
      const boundary = coverFor(sampled, xRange, hrRange);
      // Chrome with no name and no legend entry: it reads nothing, so the
      // hover grid under it reads for the cell, "—" as it does above the line.
      cover = {
        kind: "path",
        x: boundary.map((point) => xUnit.fromSi(point.temperature)),
        y: boundary.map((point) => hrUnit.fromSi(point.hr)),
        color: chartInk.ground,
        width: 0,
        fill: chartInk.ground,
        hover: "off",
      };
    }
    const rhText = numberWithUnit(rh, rhUnit);
    isolines.push({
      kind: "path",
      x: curve.map((point) => xUnit.fromSi(point.temperature)),
      y: curve.map((point) => hrUnit.fromSi(point.hr)),
      color: saturation ? chartInk.saturationLine : chartInk.isoline,
      width: saturation ? 1.5 : 1,
      // Chrome: the isolines carry the humidity reading in their label, not on
      // the pointer (ADR §4.4).
      hover: "off",
      label: `${q.rh.label} ${rhText}`,
    });
    annotations.push({
      x: xUnit.fromSi(end.temperature),
      y: hrUnit.fromSi(end.hr),
      text: rhText,
    });
  }
  // The cover over the paint and the hover grid, under the isolines.
  if (cover) {
    traces.push(cover);
  }
  traces.push(...isolines);
  legend.push({ label: q.rh.label, swatch: "line", color: chartInk.isoline }, ...bandLegend);

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

/** A point of the chart in SI: a temperature on the x axis and a humidity ratio. */
interface ChartPoint {
  readonly temperature: number;
  readonly hr: number;
}

/**
 * The boundary of the cover over the air above saturation, in SI (ADR-0002
 * decision 61): the saturation line as `saturation` samples it, from the
 * lowest temperature to where it leaves the top of `hrRange`, interpolated
 * there between its two samples, and closed through the plot's top-left
 * corner, so the left edge closes it. A line that never leaves the top runs to
 * the right edge and closes through the top-right corner first. The cover
 * hides whatever a scan paints above the line, so a band's or a zone's top
 * edge is the line itself.
 */
function coverFor(saturation: readonly ChartPoint[], xRange: Range, hrRange: Range): ChartPoint[] {
  const leaves = saturation.findIndex((point) => point.hr > hrRange.max);
  const topLeft = { temperature: xRange.min, hr: hrRange.max };
  if (leaves === -1) {
    return [...saturation, { temperature: xRange.max, hr: hrRange.max }, topLeft];
  }
  const below = saturation[leaves - 1];
  const above = saturation[leaves];
  const along = (hrRange.max - below.hr) / (above.hr - below.hr);
  return [...saturation.slice(0, leaves), { temperature: below.temperature + along * (above.temperature - below.temperature), hr: hrRange.max }, topLeft];
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
