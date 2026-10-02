import { toLibraryInputs } from "$lib/core/libraryInputs";
import {
  axisRangeFor,
  dynamicChartOf,
  isPolygonsChart,
  requireAxisRange,
  requireScan,
  type ChartAxes,
  type DeclaredDynamicChart,
  type RegisteredModel,
  type ZonePolygon,
} from "$lib/core/modelDeclaration";
import type { Quantity } from "$lib/core/quantities";
import { enteredQuantities, enteredValue, underEntryModes, withEntryModes, type ValueEntryModes } from "$lib/core/slot";
import { displayUnitFor } from "$lib/core/units";
import type { ChartRequest } from "./chartRequest";
import type { ChartSpec, LegendEntry, Trace } from "./chartSpec";
import {
  axisFor,
  fieldPaintFor,
  hoverGridFor,
  labelFor,
  markerFor,
  zoneFor,
  type ScanFrame,
  type ScannedField,
} from "./specParts";
import { containsPoint } from "./polygon";

/**
 * The frame `model`'s scanned dynamic chart is scanned in: the model's scan's
 * output, on the picked `axes` resolved under `modes` ({@link resolvedAxes}),
 * each across its declared range.
 */
export function dynamicScanFrameFor(
  model: RegisteredModel,
  axes: ChartAxes,
  modes: ValueEntryModes,
  atmosphericPressure: number,
): ScanFrame {
  const { output } = requireScan(model);
  const { x, y } = resolvedAxes(model, axes, modes);
  return {
    model,
    output,
    x: { quantity: x, range: requireAxisRange(model, x) },
    y: { quantity: y, range: requireAxisRange(model, y) },
    entryModes: modes,
    atmosphericPressure,
  };
}

/**
 * The dynamic chart of every slot of the request (ADR-0002 decision 50), on
 * the axes {@link ChartRequest.entryModes} puts them in.
 *
 * A scanned chart scans the model's scanned output over `GRID × GRID` cells
 * of two entered quantities, once per slot, and paints it as the
 * psychrometric chart paints its own ({@link fieldPaintFor}): the Band list
 * over the first slot's scan, or each slot's Comfort zones as contours of
 * its own, with one hover grid reading both axis values and every slot's
 * number (ADR §4.4's hover rules). Then each slot's marker; no other chrome.
 * `scans`, one per slot in the request's order, are the slots' scans in the
 * frame this chart is drawn in ({@link dynamicScanFrameFor}); a caller that
 * keeps them hands them over, and without them every slot is scanned here.
 *
 * A polygons chart skips the scan altogether and draws the exact polygons its
 * `comfortZones` source traces for each slot (ADR §4.4), on its own declared axes:
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
  /** Each slot's legend entries, zones first, so the legend reads slot by slot. */
  const legendOfSlot = request.slots.map((): LegendEntry[] => []);

  if (isPolygonsChart(chart)) {
    const polygonsOfSlot = request.slots.map((charted) =>
      chart.comfortZones({ values: toLibraryInputs(withEntryModes(charted.slot, modes, model), model, atmosphericPressure), xRange }),
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
      hoverGridFor({ quantity: x, range: xRange }, { quantity: y, range: yRange }, unitSystem, (cell) =>
        request.slots.flatMap((charted, position) =>
          innermostLabels(polygonsOfSlot[position], cell.x, cell.y).map((label) =>
            labelFor(request, charted, label),
          ),
        ),
      ),
    );
  } else {
    const paint = fieldPaintFor(request, dynamicScanFrameFor(model, axes, modes, atmosphericPressure), scans);
    traces.push(...paint.traces);
    legend.push(...paint.bandLegend);
    paint.zoneLegendOfSlot.forEach((entries, position) => legendOfSlot[position].push(...entries));
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
 * The label of the innermost zone containing the point: the zones are nested
 * and listed largest first, so the last one that contains it. None outside
 * every zone.
 */
function innermostLabels(zones: readonly ZonePolygon[], x: number, y: number): readonly string[] {
  return zones.filter((zone) => containsPoint(zone, x, y)).slice(-1).map((zone) => zone.label);
}
