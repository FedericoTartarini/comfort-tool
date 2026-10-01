import { classifyFromBins } from "jsthermalcomfort";
import type { BandList } from "$lib/core/bands";
import { toLibraryInputs } from "$lib/core/libraryInputs";
import {
  axisRangeFor,
  dynamicChartOf,
  isPolygonsChart,
  psychrometricChartOf,
  requireAxisRange,
  type ChartAxes,
  type ComfortZone,
  type DeclaredDynamicChart,
  type DeclaredScannedChart,
  type RegisteredModel,
  type ZonePolygon,
} from "$lib/core/modelDeclaration";
import { resultNumber, runOn } from "$lib/core/modelRun";
import { quantities, type Quantity } from "$lib/core/quantities";
import {
  enteredQuantities,
  enteredValue,
  underEntryModes,
  withEnteredValues,
  withEntryModes,
  type Slot,
  type ValueEntryModes,
} from "$lib/core/slot";
import { displayUnitFor, numberWithUnit, type DisplayUnit } from "$lib/core/units";
import { copy } from "$lib/text/copy";
import type { ChartRequest } from "./chartRequest";
import type { BandFill, ChartSpec, HoverReadout, LegendEntry, Trace } from "./chartSpec";
import { axisFor, contourZoneFor, labelFor, markerFor, samples, zoneFor } from "./specParts";
import { containsPoint } from "./polygon";

/** One count for every axis and every model: 51 points are 50 intervals, so the SI steps are round (ADR-0002 decision 28). */
const GRID = 51;

/**
 * What every slot's scan on one chart shares: the model and its scanned
 * chart, the two axes swept, the entry modes they are in, and the
 * atmospheric pressure. A slot's scan is a function of this and the slot
 * alone, so the outputs can keep one per slot and an edit to one slot scans
 * that slot and no other (`state/compute.svelte.ts`).
 */
export interface ScanFrame {
  readonly model: RegisteredModel;
  readonly chart: DeclaredScannedChart;
  readonly axes: ChartAxes;
  readonly entryModes: ValueEntryModes;
  readonly atmosphericPressure: number;
}

/**
 * One slot's scan: the model's own number for `chart.output` at every cell of
 * the `GRID × GRID` field, `[yIndex][xIndex]`, in the output's SI unit.
 */
export type ScannedField = readonly (readonly number[])[];

/**
 * The frame `chart` is scanned in for `model`: the picked `axes` resolved
 * under `modes` ({@link resolvedAxes}).
 */
export function scanFrameFor(
  model: RegisteredModel,
  chart: DeclaredScannedChart,
  axes: ChartAxes,
  modes: ValueEntryModes,
  atmosphericPressure: number,
): ScanFrame {
  return { model, chart, axes: resolvedAxes(model, axes, modes), entryModes: modes, atmosphericPressure };
}

/**
 * `slot` scanned in `frame`: converted into the frame's entry modes first, by
 * the entry-mode change's own conversion, so a slot entered in another mode
 * is swept on the quantities it would hold after that change.
 */
export function scannedField(frame: ScanFrame, slot: Slot): ScannedField {
  const { model, chart, axes, atmosphericPressure } = frame;
  const converted = withEntryModes(slot, frame.entryModes, model);
  const xValues = samples(requireAxisRange(model, axes.x), GRID);
  return samples(requireAxisRange(model, axes.y), GRID).map((yValue) =>
    xValues.map((xValue) => {
      const point = withEnteredValues(converted, new Map([
        [axes.x, xValue],
        [axes.y, yValue],
      ]));
      return resultNumber(runOn(point, model, atmosphericPressure), chart.output);
    }),
  );
}

/**
 * The dynamic chart of every slot of the request (ADR-0002 decision 50), on
 * the axes {@link ChartRequest.entryModes} puts them in.
 *
 * A scanned chart scans the declared numeric output over a `GRID × GRID` field
 * of two entered quantities, once per slot. Each cell keeps the model's own
 * number for `chart.output`, so a drawn boundary falls where the value
 * crosses it rather than half a cell away (ADR-0002 decision 27). Given a
 * Band list ({@link ChartRequest.bands}), the chart paints its bands over
 * the first slot's field, each over its interval of the number in its own
 * colour, a band without one nowhere, and the legend lists the painted ones.
 * Given none, each slot draws the declaration's Comfort zones as contours of
 * its own field, a lone slot exactly as each of several (ADR-0002 decisions
 * 50 and 58), painted as the psychrometric chart paints its own. Either way
 * one hover grid reads both axis values and every slot's number, formatted
 * here (ADR §4.4's hover rules), and with a list the band the library's
 * `classifyFromBins` puts it in on that list, so no Edge and no inclusivity
 * rule is written here. `scans`, one per slot in the request's order, are the
 * slots' fields in the frame this chart is drawn in ({@link scanFrameFor}); a
 * caller that keeps them hands them over, and without them every slot is
 * scanned here.
 *
 * A polygons chart skips the scan altogether and draws the exact polygons its
 * `zones` source traces for each slot (ADR §4.4), on its own declared axes:
 * they are locked, so `axes` is not read and nothing is mapped to the entry
 * mode, and an operative axis is marked at the slot's operative temperature
 * in either mode (ADR-0002 decision 37). The polygons are nested Comfort
 * zones, largest first, so they are painted as the psychrometric chart paints
 * its own: the slot's hue with the opacity rising inwards, outlined in its
 * zone line, never the thermal-sensation palette. A filled polygon cannot
 * report where the pointer is inside it, so the polygons read nothing and a
 * hover grid over the same `GRID × GRID` field reads for them: both axis
 * values, and the innermost zone of each slot the cell is in.
 */
export function dynamicSpec(
  request: ChartRequest,
  chart: DeclaredDynamicChart,
  axes: ChartAxes,
  scans?: readonly ScannedField[],
): ChartSpec {
  const { model, unitSystem, atmosphericPressure } = request;
  const modes = request.entryModes;
  const { x, y } = isPolygonsChart(chart) ? chart.axes : resolvedAxes(model, axes, modes);
  const xRange = requireAxisRange(model, x);
  const yRange = requireAxisRange(model, y);
  const xUnit = displayUnitFor(x, unitSystem);
  const yUnit = displayUnitFor(y, unitSystem);

  const traces: Trace[] = [];
  const legend: LegendEntry[] = [];
  const xValues = samples(xRange, GRID);
  const yValues = samples(yRange, GRID);
  const displayedAxes = { x: xValues.map((value) => xUnit.fromSi(value)), y: yValues.map((value) => yUnit.fromSi(value)) };
  /** The two lines every cell's readout opens with. */
  const axisLines = (xIndex: number, yIndex: number): HoverReadout => [
    readoutLine(x, xUnit, xValues[xIndex]),
    readoutLine(y, yUnit, yValues[yIndex]),
  ];
  const hoverGrid = (readout: (xIndex: number, yIndex: number) => HoverReadout): Trace => ({
    kind: "hoverGrid",
    hover: "field",
    ...displayedAxes,
    hoverText: yValues.map((_, yIndex) => xValues.map((_, xIndex) => [...axisLines(xIndex, yIndex), ...readout(xIndex, yIndex)])),
  });
  /** Each slot's legend entries, zones first, so the legend reads slot by slot. */
  const legendOfSlot = request.slots.map((): LegendEntry[] => []);

  if (isPolygonsChart(chart)) {
    const polygonsOfSlot = request.slots.map((charted) =>
      chart.zones({ values: toLibraryInputs(withEntryModes(charted.slot, modes, model), model, atmosphericPressure), xRange }),
    );
    request.slots.forEach((charted, position) => {
      const polygons = polygonsOfSlot[position];
      for (const [index, polygon] of polygons.entries()) {
        // A zone never captures the pointer, so the hover grid below reads for it.
        const zone = zoneFor(
          labelFor(request, charted, polygon.label),
          polygon.x.map((value) => xUnit.fromSi(value)),
          polygon.y.map((value) => yUnit.fromSi(value)),
          index,
          polygons.length,
          charted.hue,
        );
        traces.push(zone.trace);
        legendOfSlot[position].push(zone.legendEntry);
      }
    });
    traces.push(
      hoverGrid((xIndex, yIndex) =>
        request.slots.flatMap((charted, position) =>
          innermostLabels(polygonsOfSlot[position], xValues[xIndex], yValues[yIndex]).map((label) =>
            labelFor(request, charted, label),
          ),
        ),
      ),
    );
  } else {
    const frame = scanFrameFor(model, chart, axes, modes, atmosphericPressure);
    const fields = scans ?? request.slots.map((charted) => scannedField(frame, charted.slot));
    const outputUnit = displayUnitFor(frame.chart.output, unitSystem);
    const surfaces = fields.map((field) => field.map((row) => row.map((value) => (Number.isNaN(value) ? null : value))));
    const { bands } = request;
    if (bands) {
      const fills = bandFillsOf(bands);
      traces.push({ kind: "bands", hover: "off", ...displayedAxes, z: surfaces[0], bands: fills });
      legend.push(...fills.map((band): LegendEntry => ({ label: band.label, swatch: "fill", color: band.color })));
    } else {
      const zones = contouredZonesOf(model, frame.chart);
      request.slots.forEach((charted, position) => {
        zones.forEach((zone, index) => {
          const drawn = contourZoneFor(
            labelFor(request, charted, copy.zoneLegend(zone)),
            { ...displayedAxes, z: surfaces[position], lower: -zone.limit, upper: zone.limit },
            index,
            zones.length,
            charted.hue,
          );
          traces.push(drawn.trace);
          legendOfSlot[position].push(drawn.legendEntry);
        });
      });
    }
    traces.push(
      hoverGrid((xIndex, yIndex) =>
        request.slots.flatMap((charted, position) => {
          const value = fields[position][yIndex][xIndex];
          const lines = [readoutLine(frame.chart.output, outputUnit, value), ...(bands ? bandLabels(value, bands) : [])];
          return lines.map((line) => labelFor(request, charted, line));
        }),
      ),
    );
  }

  request.slots.forEach((charted, position) => {
    const slot = withEntryModes(charted.slot, modes, model);
    const markerX = enteredValue(slot, x, model, atmosphericPressure);
    const markerY = enteredValue(slot, y, model, atmosphericPressure);
    if (markerX !== undefined && markerY !== undefined) {
      const marker = markerFor(charted, xUnit.fromSi(markerX), yUnit.fromSi(markerY));
      traces.push(marker.trace);
      legendOfSlot[position].push(marker.legendEntry);
    }
  });
  legend.push(...legendOfSlot.flat());

  return {
    traces,
    layout: { x: axisFor(x, xUnit, xRange), y: axisFor(y, yUnit, yRange) },
    legend,
    annotations: [],
  };
}

/**
 * The Comfort zones a scanned chart cuts from each slot's field, largest
 * first: the declaration's own, which its psychrometric chart declares
 * (`core/comfortZones`), each where |PMV| is inside its limit. They are PMV
 * intervals, so a chart scanning any other output has none, and neither has a
 * model that declares no zone.
 */
function contouredZonesOf(model: RegisteredModel, chart: DeclaredScannedChart): readonly ComfortZone[] {
  if (chart.output !== quantities.pmv) {
    return [];
  }
  return [...(psychrometricChartOf(model)?.zones ?? [])].sort((a, b) => b.limit - a.limit);
}

/**
 * The axes actually drawn. A remembered axis follows the entry modes
 * (`underEntryModes`), so switching to operative entry sweeps `operative_tmp`
 * rather than a `tdb` the slot no longer holds — and because that maps both
 * `tdb` and `tr` onto `operative_tmp`, a chart of one against the other would
 * collapse onto a single quantity. x === y is not a chart (ADR §4.4), so the
 * y axis moves to the next quantity that can carry one.
 */
export function resolvedAxes(model: RegisteredModel, axes: ChartAxes, modes: ValueEntryModes): ChartAxes {
  const x = underEntryModes(axes.x, modes);
  const y = underEntryModes(axes.y, modes);
  if (y !== x) {
    return { x, y };
  }
  return { x, y: dynamicAxisQuantities(model, modes).find((quantity) => quantity !== x) ?? y };
}

/**
 * The quantities the axis picker offers: what the user enters, minus anything
 * with no axis range ({@link axisRangeFor}) — the range is what the scan
 * sweeps between.
 * None for a polygons chart, whose axes are locked (ADR-0002 decision 37).
 */
export function dynamicAxisQuantities(model: RegisteredModel, modes: ValueEntryModes): Quantity[] {
  const chart = dynamicChartOf(model);
  if (chart && isPolygonsChart(chart)) {
    return [];
  }
  return enteredQuantities(model, modes).filter((quantity) => axisRangeFor(model, quantity) !== undefined);
}

/**
 * The bands the chart fills, in the list's order: one per band with a colour,
 * over the interval of the scanned number between its own Edge and the one
 * below; a band without one is painted nowhere. The first band is open below,
 * as every library classifier is; the last Edge is where the list stops
 * answering, and it bounds the last band's fill.
 */
function bandFillsOf(list: BandList): readonly BandFill[] {
  return list.labels.flatMap((label, index) => {
    const color = list.colors[index];
    return color === undefined
      ? []
      : [{ label, color, upper: list.edges[index], lower: index === 0 ? undefined : list.edges[index - 1] }];
  });
}

/**
 * The band the library itself puts `value` in on `list`, so the inclusivity
 * is the list's: one label, or none past the last Edge or without a number.
 */
function bandLabels(value: number, list: BandList): readonly string[] {
  const band = classifyFromBins(value, list);
  return typeof band === "string" ? [band] : [];
}

/**
 * The label of the innermost zone containing the point: the zones are nested
 * and listed largest first, so the last one that contains it. None outside
 * every zone.
 */
function innermostLabels(zones: readonly ZonePolygon[], x: number, y: number): readonly string[] {
  return zones.filter((zone) => containsPoint(zone, x, y)).slice(-1).map((zone) => zone.label);
}

/**
 * One line of a hover readout, `Label: value unit`, the SI `value` shown as
 * the results table shows it: in `unit`, formatted, and a dash where there is
 * no number.
 */
function readoutLine(quantity: Quantity, unit: DisplayUnit, value: number): string {
  return `${quantity.label}: ${numberWithUnit(value, unit)}`;
}
