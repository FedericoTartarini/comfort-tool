import { classifyFromBins, type ClassifierBins } from "jsthermalcomfort";
import { bandFill, chartInk } from "$lib/core/bandPalette";
import { underTemperatureMode, type TemperatureMode } from "$lib/core/entryModes";
import {
  enteredQuantities,
  enteredValue,
  resolveQuantities,
  resultValue,
  toLibraryInputs,
  withEnteredValues,
  type SlotInputs,
} from "$lib/core/libraryInputs";
import {
  axisRangeFor,
  requireAxisRange,
  type DynamicDeclaration,
  type Range,
  type RegisteredModel,
} from "$lib/core/modelDeclaration";
import type { Quantity } from "$lib/core/quantities";
import { displayUnitFor } from "$lib/core/units";
import { axisTitle, BAND_SCALE_FLOOR, type ChartRequest, type ChartSpec, type LegendEntry, type Trace } from "./chartSpec";

/** Grid resolution, the same for every model (ADR §2 "Precision"). */
const GRID = 100;

interface BandFill {
  readonly label: string;
  readonly color: string;
}

/**
 * The dynamic chart: the declared numeric output scanned over a `GRID × GRID`
 * field of two entered quantities, banded by the declared classifier, with the
 * slot's own state marked.
 *
 * Each cell keeps the model's own number for `chart.output`; the surface is
 * handed on in band-position space so that the contour falls where the value
 * crosses an Edge rather than half a cell away (ADR-0002 decision 27). The
 * bands and their order are `chart.bands`' own, the colours are the app's one
 * palette by position, and the hover readout is the library's
 * `classifyFromBins` — no Edge and no inclusivity rule is written here.
 *
 * A model that declares `zones` skips the scan altogether and draws the exact
 * polygons the library traces for it (ADR §4.4).
 */
export function dynamicSpec(
  request: ChartRequest,
  chart: DynamicDeclaration,
  axes: { readonly x: Quantity; readonly y: Quantity },
): ChartSpec {
  const { model, slot, slotLabel, unitSystem } = request;
  const mode = slot.temperature.mode;
  const { x, y } = resolvedAxes(model, axes, mode);
  const xRange = requireAxisRange(model, x);
  const yRange = requireAxisRange(model, y);
  const xUnit = displayUnitFor(x, unitSystem);
  const yUnit = displayUnitFor(y, unitSystem);

  const traces: Trace[] = [];
  const legend: LegendEntry[] = [];

  const polygons = chart.zones?.({ values: resolveQuantities(slot, model), xRange });
  if (polygons) {
    for (const [index, polygon] of polygons.entries()) {
      const color = bandFill(index);
      traces.push({
        kind: "path",
        x: polygon.x.map((value) => xUnit.fromSi(value)),
        y: polygon.y.map((value) => yUnit.fromSi(value)),
        color,
        width: 1,
        fill: color,
        // The filled area is the reading: the pointer reports the band it is
        // over, wherever it is over it.
        hover: "field",
        label: polygon.label,
      });
      legend.push({ label: polygon.label, swatch: "fill", color });
    }
  } else {
    const xValues = samples(xRange);
    const yValues = samples(yRange);
    const bins = chart.bands;
    const bandFills = bandsOf(bins);
    const scanned = yValues.map((yValue) =>
      xValues.map((xValue) =>
        outputValue(
          model,
          withEnteredValues(slot, new Map([
            [x, xValue],
            [y, yValue],
          ])),
          chart.output,
        ),
      ),
    );
    traces.push({
      kind: "bands",
      hover: "field",
      x: xValues.map((value) => xUnit.fromSi(value)),
      y: yValues.map((value) => yUnit.fromSi(value)),
      z: scanned.map((row) => row.map((value) => bandPosition(value, bins))),
      hoverText: scanned.map((row) => row.map((value) => bandLabel(value, bins))),
      bands: bandFills,
    });
    legend.push(...bandFills.map((band): LegendEntry => ({ label: band.label, swatch: "fill", color: band.color })));
  }

  const markerX = enteredValue(slot, x);
  const markerY = enteredValue(slot, y);
  if (markerX !== undefined && markerY !== undefined) {
    traces.push({
      kind: "point",
      x: xUnit.fromSi(markerX),
      y: yUnit.fromSi(markerY),
      color: chartInk.marker,
      hover: "off",
      label: slotLabel,
    });
    legend.push({ label: slotLabel, swatch: "marker", color: chartInk.marker });
  }

  return {
    traces,
    layout: {
      x: { title: axisTitle(x, xUnit.symbol), range: [xUnit.fromSi(xRange.min), xUnit.fromSi(xRange.max)] },
      y: { title: axisTitle(y, yUnit.symbol), range: [yUnit.fromSi(yRange.min), yUnit.fromSi(yRange.max)] },
    },
    legend,
    annotations: [],
  };
}

/**
 * The axes actually drawn. A remembered axis follows the entry mode, so
 * switching to operative entry sweeps `operative_tmp` rather than a `tdb` the
 * slot no longer holds — and because that maps both `tdb` and `tr` onto
 * `operative_tmp`, a chart
 * of one against the other would collapse onto a single quantity. x === y is
 * not a chart (ADR §4.4), so the y axis moves to the next quantity that can
 * carry one.
 */
export function resolvedAxes(
  model: RegisteredModel,
  axes: { readonly x: Quantity; readonly y: Quantity },
  mode: TemperatureMode,
): { readonly x: Quantity; readonly y: Quantity } {
  const x = underTemperatureMode(axes.x, mode);
  const y = underTemperatureMode(axes.y, mode);
  if (y !== x) {
    return { x, y };
  }
  return { x, y: dynamicAxisQuantities(model, mode).find((quantity) => quantity !== x) ?? y };
}

/**
 * The quantities that can carry an axis: what the user enters, minus anything
 * the model declares no range for — the range is what the scan sweeps between.
 */
export function dynamicAxisQuantities(model: RegisteredModel, mode: TemperatureMode): Quantity[] {
  return enteredQuantities(model, mode).filter((quantity) => axisRangeFor(model, quantity) !== undefined);
}

function samples(range: Range): readonly number[] {
  const step = (range.max - range.min) / (GRID - 1);
  return Array.from({ length: GRID }, (_, index) => range.min + index * step);
}

/** The model's own number for `output` at `slot`; `NaN` when the result carries none. */
function outputValue(model: RegisteredModel, slot: SlotInputs, output: Quantity): number {
  const value = resultValue(model.run(toLibraryInputs(slot, model)), output);
  return typeof value === "number" ? value : Number.NaN;
}

function bandsOf(bins: ClassifierBins): readonly BandFill[] {
  return bins.labels.map((label, index) => ({ label, color: bandFill(index) }));
}

/**
 * `value` on the band-position scale `BandTrace` defines: the Edge between two
 * bands maps to its own integer, values between two such Edges interpolate
 * linearly between their integers, and the two open ends of the scale — below
 * the first band's Edge and above the last one's — extrapolate through the
 * interval beside them and hold at the scale's floor and top. `null` is
 * "no band".
 *
 * Why a remap at all: a contour draws levels at one fixed spacing, and a
 * classifier's Edges need not be evenly spaced — Heat Index's are not. Putting
 * every drawn Edge on its own integer turns "the value crosses Edge *i*" into
 * "the surface crosses level *i*", so one evenly spaced set of levels draws
 * them all, and the crossing is placed by interpolation between grid lines
 * instead of being rounded to the nearest cell (ADR-0002 decision 27).
 *
 * Why the last Edge is not one of the knots: it is a cutoff rather than a
 * boundary between two bands (ADR-0002 decision 31 — past it the kernel
 * returns no category), and knotting it would stretch the top interval to 7.5
 * on ISO and 946 on Heat Index. A slope that changes that much across the very
 * level being drawn pulls the contour towards the grid line over most of a
 * cell, which is the stepped boundary this whole change exists to remove; it
 * was visible on Warm | Hot while its five neighbours were smooth. The top
 * band therefore scales like the interval below it, as the first band already
 * scales like the interval above it, and both ends clamp. Nothing is lost
 * inside them: a band is one flat colour.
 */
function bandPosition(value: number, bins: ClassifierBins): number | null {
  // Whether there is a band here at all is the library's answer rather than a
  // rule restated here: `classifyFromBins` returns no label for `NaN` and for
  // a value past the last Edge, under whichever inclusivity the classifier
  // declares. Locating the segment below is a different question — the map is
  // continuous at every knot, so which side of one a value is read on cannot
  // change its position.
  if (typeof classifyFromBins(value, bins) !== "string") {
    return null;
  }
  const { edges, labels } = bins;
  // Knots are `edges[0] … edges[lastKnot]`, each at its own index.
  const lastKnot = edges.length - 2;
  if (lastKnot < 0) {
    // A one-Edge classifier has a single band and no boundary to draw.
    return BAND_SCALE_FLOOR;
  }
  const above = edges.findIndex((edge) => value < edge);
  const knot = Math.min(above === -1 ? lastKnot : Math.max(above - 1, 0), lastKnot);
  // The segment above `knot`, except at the top knot, which extrapolates
  // through the segment below it instead.
  const span = knot < lastKnot ? edges[knot + 1] - edges[knot] : widthBelowTopKnot(edges, lastKnot);
  const position = knot + (value - edges[knot]) / span;
  return Math.min(labels.length - 1, Math.max(BAND_SCALE_FLOOR, position));
}

/** The interval the top band borrows its scale from; its own when there is only one. */
function widthBelowTopKnot(edges: readonly number[], lastKnot: number): number {
  return lastKnot > 0 ? edges[lastKnot] - edges[lastKnot - 1] : edges[1] - edges[0];
}

/** The band the library itself puts `value` in, so the inclusivity is its own. */
function bandLabel(value: number, bins: ClassifierBins): string {
  const category = classifyFromBins(value, bins);
  return typeof category === "string" ? category : "";
}
