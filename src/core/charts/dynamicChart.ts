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
 * `value` on the band-position scale `BandTrace` defines: Edge *i* maps to the
 * integer *i*, values between two Edges interpolate linearly between their
 * integers, a value below the first Edge extrapolates along the first interval
 * and so stays under 0 until it reaches the scale's floor, and `null` is
 * "no band".
 *
 * Why a remap at all: a contour draws levels at one fixed spacing, and a
 * classifier's Edges need not be evenly spaced — Heat Index's are not. Putting
 * every Edge on its own integer turns "the value crosses Edge *i*" into "the
 * surface crosses level *i*", so one evenly spaced set of levels draws them
 * all, and the crossing is placed by interpolation between grid lines instead
 * of being rounded to the nearest cell (ADR-0002 decision 27).
 */
function bandPosition(value: number, bins: ClassifierBins): number | null {
  // Whether there is a band here at all is the library's answer rather than a
  // rule restated here: `classifyFromBins` returns no label for `NaN` and for
  // a value past the last Edge, under whichever inclusivity the classifier
  // declares. Locating the interval below is a different question — the map is
  // continuous at every Edge, so which side of one a value is read on cannot
  // change its position.
  if (typeof classifyFromBins(value, bins) !== "string") {
    return null;
  }
  const { edges } = bins;
  const above = edges.findIndex((edge) => value < edge);
  if (above === -1) {
    // Only reachable on a right-inclusive classifier, for a value sitting
    // exactly on the last Edge: the top band's own ceiling.
    return edges.length - 1;
  }
  // The interval `value` is read in, `edges[interval - 1]` to `edges[interval]`.
  // Below the first Edge there is no such interval, so the first is
  // extrapolated through instead — which also leaves that Edge kink-free,
  // since both of its sides then scale alike.
  const interval = Math.max(above, 1);
  const bottom = edges[interval - 1];
  // A one-Edge classifier has no interval at all; any width puts a value under
  // its single Edge below 0, which is where the first band is.
  const span = edges.length > 1 ? edges[interval] - bottom : 1;
  return Math.max(BAND_SCALE_FLOOR, interval - 1 + (value - bottom) / span);
}

/** The band the library itself puts `value` in, so the inclusivity is its own. */
function bandLabel(value: number, bins: ClassifierBins): string {
  const category = classifyFromBins(value, bins);
  return typeof category === "string" ? category : "";
}
