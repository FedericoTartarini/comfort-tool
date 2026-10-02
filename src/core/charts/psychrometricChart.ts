import { hr_to_rh, psy_ta_rh } from "jsthermalcomfort";
import { chartInk } from "$lib/core/bandPalette";
import { resolveQuantities } from "$lib/core/libraryInputs";
import { requireAxisRange, requireScan, type Range, type RegisteredModel } from "$lib/core/modelDeclaration";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities } from "$lib/core/quantities";
import { requireValue, withEntryModes, type ValueEntryModes } from "$lib/core/slot";
import { displayUnitFor, numberWithUnit } from "$lib/core/units";
import type { ChartRequest } from "./chartRequest";
import type { Annotation, ChartSpec, LegendEntry, Trace } from "./chartSpec";
import { axisFor, fieldPaintFor, markerFor, samples, type ScanFrame, type ScannedField } from "./specParts";

const q = quantities;

/** Relative humidity of each isoline, [%]. The saturation line is the last one. */
const ISOLINE_STEP = 10;
/**
 * Samples along each isoline, across the declared temperature range. 121 over
 * 10–40 °C is the resolution the CBE tool draws these curves at.
 */
const ISOLINE_SAMPLES = 121;

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
 * slot of the request, and the paint of each slot's scan in
 * {@link psychrometricScanFrameFor}'s frame ({@link fieldPaintFor}), as the
 * dynamic chart paints its own (ADR-0002 decision 61): given a Band list
 * ({@link ChartRequest.bands}), the list over the first slot's scan; given
 * none, each slot's Comfort zones as contours of its own scan, a lone slot
 * exactly as each of several (ADR-0002 decision 50). Either way one hover grid
 * reads the temperature, the humidity ratio and each slot's number, and with
 * a list the band. `scans`, one per slot in the request's order, are the
 * slots' scans in that frame, handed over by a caller that keeps them;
 * without them every slot is scanned here.
 *
 * The x axis quantity is that of the temperature entry mode among
 * {@link ChartRequest.entryModes}: `tdb` when the two temperatures are entered
 * separately, `operative_tmp` under operative entry, where `tr` follows it in
 * every cell, which is the geometry the CBE tool's psychtop chart draws. The
 * drawn x range is the model's axis range for whichever temperature the mode
 * puts on x: declared, else its applicability bound (ADR-0002 decision 5).
 *
 * The isolines, the scan and the marker are of the air at the request's
 * atmospheric pressure, and the humidity-ratio axis reaches as far as
 * {@link drawnHumidityRatioRange} says (ADR-0002 decision 49).
 *
 * A cell above saturation, `rh` > 100 at the pressure, is air that cannot
 * exist: it is scanned and painted, the cover ({@link coverFor}) hides it, and
 * it reads "—" and no band. The cover sits over the paint and the hover grid
 * and under the isolines and the markers, so a zone's or a band's top edge is
 * the saturation line itself (ADR-0002 decision 61).
 */
export function psychrometricSpec(request: ChartRequest, scans?: readonly ScannedField[]): ChartSpec {
  const { model, unitSystem, atmosphericPressure } = request;
  const axisQuantity = request.entryModes.temperature.mode.axis;
  const xUnit = displayUnitFor(axisQuantity, unitSystem);
  const hrUnit = displayUnitFor(q.hr, unitSystem);
  const rhUnit = displayUnitFor(q.rh, unitSystem);
  const frame = psychrometricScanFrameFor(model, request.entryModes, atmosphericPressure);
  const xRange = frame.x.range;
  const hrRange = frame.y.range;

  const paint = fieldPaintFor(request, frame, scans, (temperature, hr) => hr_to_rh(hr, temperature, atmosphericPressure) > 100);
  const traces: Trace[] = [...paint.traces];
  const annotations: Annotation[] = [];

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

  // Each slot's legend entries, its zones then its marker, so the legend reads slot by slot.
  const legend: LegendEntry[] = [{ label: q.rh.label, swatch: "line", color: chartInk.isoline }, ...paint.bandLegend];
  request.slots.forEach((charted, position) => {
    const resolved = resolveQuantities(withEntryModes(charted.slot, request.entryModes, model), model, atmosphericPressure);
    const tdb = requireValue(resolved, q.tdb);
    const marker = markerFor(
      charted,
      xUnit.fromSi(tdb),
      hrUnit.fromSi(psy_ta_rh(tdb, requireValue(resolved, q.rh), atmosphericPressure).hr),
    );
    traces.push(marker.trace);
    legend.push(...paint.zoneLegendOfSlot[position], marker.legendEntry);
  });

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
