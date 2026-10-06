import {
  axisRangeFor,
  requireAxisRange,
  requireScan,
  type ChartAxes,
  type RegisteredModel,
} from "$lib/core/modelDeclaration";
import type { Quantity } from "$lib/core/quantities";
import { enteredQuantities, enteredValue, underEntryModes, withEntryModes, type ValueEntryModes } from "$lib/core/slot";
import { displayUnitFor } from "$lib/core/units";
import type { ChartRequest } from "./chartRequest";
import type { ChartSpec, LegendEntry, Trace } from "./chartSpec";
import { axisFor, fieldPaintFor, markerFor, type ScanFrame, type ScannedField } from "./specParts";

/**
 * The frame `model`'s dynamic chart is scanned in: the model's scan's
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
 * the picked `axes` resolved under {@link ChartRequest.entryModes}.
 *
 * It scans the model's scanned output over `GRID × GRID` cells of two entered
 * quantities, once per slot, and paints it as the psychrometric chart paints
 * its own ({@link fieldPaintFor}): the Band list over the first slot's scan,
 * or each slot's Comfort zones as contours of its own, with one hover grid
 * reading both axis values and every slot's number (ADR §4.4's hover rules).
 * Then each slot's marker; no other chrome. `scans`, one per slot in the
 * request's order, are the slots' scans in the frame this chart is drawn in
 * ({@link dynamicScanFrameFor}); a caller that keeps them hands them over, and
 * without them every slot is scanned here.
 */
export function dynamicSpec(request: ChartRequest, axes: ChartAxes, scans?: readonly ScannedField[]): ChartSpec {
  const { model, unitSystem, atmosphericPressure } = request;
  const modes = request.entryModes;
  const { x, y } = resolvedAxes(model, axes, modes);
  const xRange = requireAxisRange(model, x);
  const yRange = requireAxisRange(model, y);
  const xUnit = displayUnitFor(x, unitSystem);
  const yUnit = displayUnitFor(y, unitSystem);

  const traces: Trace[] = [];
  const legend: LegendEntry[] = [];
  /** Each slot's legend entries, zones first, so the legend reads slot by slot. */
  const legendOfSlot = request.slots.map((): LegendEntry[] => []);

  const paint = fieldPaintFor(request, dynamicScanFrameFor(model, axes, modes, atmosphericPressure), scans);
  traces.push(...paint.traces);
  legend.push(...paint.bandLegend);
  paint.zoneLegendOfSlot.forEach((entries, position) => legendOfSlot[position].push(...entries));

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
 * The quantities the axis picker offers on the dynamic chart: what the user
 * enters, minus anything with no axis range ({@link axisRangeFor}) — the
 * range is what the scan sweeps between.
 */
export function dynamicAxisQuantities(model: RegisteredModel, modes: ValueEntryModes): Quantity[] {
  return enteredQuantities(model, modes).filter((quantity) => axisRangeFor(model, quantity) !== undefined);
}
