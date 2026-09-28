import { classifyFromBins, type ClassifierBins } from "jsthermalcomfort";
import { bandFill, chartInk } from "$lib/core/bandPalette";
import { underTemperatureMode, type TemperatureMode } from "$lib/core/entryModes";
import { enteredQuantities, enteredValue, toLibraryInputs, withEnteredValues } from "$lib/core/libraryInputs";
import {
  axisRangeFor,
  dynamicChartOf,
  isPolygonsChart,
  requireAxisRange,
  type ChartAxes,
  type DynamicDeclaration,
  type Range,
  type RegisteredModel,
} from "$lib/core/modelDeclaration";
import { resultNumber, runOn } from "$lib/core/modelRun";
import type { Quantity } from "$lib/core/quantities";
import { displayUnitFor, labelWithUnit } from "$lib/core/units";
import type { BandFill, ChartRequest, ChartSpec, LegendEntry, Trace } from "./chartSpec";

/** One count for every axis and every model: 51 points are 50 intervals, so the SI steps are round (ADR-0002 decision 28). */
const GRID = 51;

/**
 * The dynamic chart: the declared numeric output scanned over a `GRID × GRID`
 * field of two entered quantities, banded by the declared classifier, with the
 * slot's own state marked.
 *
 * Each cell keeps the model's own number for `chart.output`, and each band
 * carries the interval of that number it fills, so the drawn boundary falls
 * where the value crosses an Edge rather than half a cell away (ADR-0002
 * decision 27). The bands, their order and their Edges are `chart.bands`' own,
 * the colours are the app's one palette by position, and the hover readout is
 * the library's `classifyFromBins` — no Edge and no inclusivity rule is
 * written here.
 *
 * A polygons chart skips the scan altogether and draws the exact polygons its
 * `zones` source traces (ADR §4.4), on its own declared axes: they are locked,
 * so `axes` is not read and nothing is mapped to the entry mode, and an
 * operative axis is marked at the slot's operative temperature in either mode
 * (ADR-0002 decision 37). The polygons are nested Comfort zones, largest
 * first, so they are painted as the psychrometric chart paints its own: one
 * hue whose opacity rises inwards, outlined in the zone line, never the
 * thermal-sensation palette.
 */
export function dynamicSpec(
  request: ChartRequest,
  chart: DynamicDeclaration,
  axes: ChartAxes,
): ChartSpec {
  const { model, slot, slotLabel, unitSystem } = request;
  const mode = slot.temperature.mode;
  const { x, y } = isPolygonsChart(chart) ? chart.axes : resolvedAxes(model, axes, mode);
  const xRange = requireAxisRange(model, x);
  const yRange = requireAxisRange(model, y);
  const xUnit = displayUnitFor(x, unitSystem);
  const yUnit = displayUnitFor(y, unitSystem);

  const traces: Trace[] = [];
  const legend: LegendEntry[] = [];

  if (isPolygonsChart(chart)) {
    const polygons = chart.zones({ values: toLibraryInputs(slot, model), xRange });
    for (const [index, polygon] of polygons.entries()) {
      const fill = chartInk.zoneFill(index, polygons.length);
      traces.push({
        kind: "path",
        x: polygon.x.map((value) => xUnit.fromSi(value)),
        y: polygon.y.map((value) => yUnit.fromSi(value)),
        color: chartInk.zoneLine,
        width: chartInk.zoneLineWidth,
        fill,
        // The filled area is the reading: the pointer reports the Comfort zone
        // it is over, wherever it is over it.
        hover: "field",
        label: polygon.label,
      });
      legend.push({ label: polygon.label, swatch: "fill", color: fill });
    }
  } else {
    const xValues = samples(xRange);
    const yValues = samples(yRange);
    const bins = chart.bands;
    const bandFills = bandsOf(bins);
    const scanned = yValues.map((yValue) =>
      xValues.map((xValue) => {
        const point = withEnteredValues(slot, new Map([
          [x, xValue],
          [y, yValue],
        ]));
        return resultNumber(runOn(point, model), chart.output);
      }),
    );
    traces.push({
      kind: "bands",
      hover: "field",
      x: xValues.map((value) => xUnit.fromSi(value)),
      y: yValues.map((value) => yUnit.fromSi(value)),
      z: scanned.map((row) => row.map((value) => (Number.isNaN(value) ? null : value))),
      hoverText: scanned.map((row) => row.map((value) => bandLabel(value, bins))),
      bands: bandFills,
    });
    legend.push(...bandFills.map((band): LegendEntry => ({ label: band.label, swatch: "fill", color: band.color })));
  }

  const markerX = enteredValue(slot, x, model);
  const markerY = enteredValue(slot, y, model);
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
      x: { title: labelWithUnit(x, xUnit), range: [xUnit.fromSi(xRange.min), xUnit.fromSi(xRange.max)] },
      y: { title: labelWithUnit(y, yUnit), range: [yUnit.fromSi(yRange.min), yUnit.fromSi(yRange.max)] },
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
  axes: ChartAxes,
  mode: TemperatureMode,
): ChartAxes {
  const x = underTemperatureMode(axes.x, mode);
  const y = underTemperatureMode(axes.y, mode);
  if (y !== x) {
    return { x, y };
  }
  return { x, y: dynamicAxisQuantities(model, mode).find((quantity) => quantity !== x) ?? y };
}

/**
 * The quantities the axis picker offers: what the user enters, minus anything
 * the model declares no range for — the range is what the scan sweeps between.
 * None for a polygons chart, whose axes are locked (ADR-0002 decision 37).
 */
export function dynamicAxisQuantities(model: RegisteredModel, mode: TemperatureMode): Quantity[] {
  const chart = dynamicChartOf(model);
  if (chart && isPolygonsChart(chart)) {
    return [];
  }
  return enteredQuantities(model, mode).filter((quantity) => axisRangeFor(model, quantity) !== undefined);
}

function samples(range: Range): readonly number[] {
  const step = (range.max - range.min) / (GRID - 1);
  return Array.from({ length: GRID }, (_, index) => range.min + index * step);
}

/**
 * The bands the chart fills, in the classifier's own order: one per label,
 * painted by position, over the interval of the scanned number between its own
 * Edge and the one below. The first band is open below, as every library
 * classifier is; the last Edge is where the classifier stops answering, and it
 * bounds the last band's fill.
 */
function bandsOf(bins: ClassifierBins): readonly BandFill[] {
  return bins.labels.map((label, index) => ({
    label,
    color: bandFill(index),
    upper: bins.edges[index],
    lower: index === 0 ? undefined : bins.edges[index - 1],
  }));
}

/** The band the library itself puts `value` in, so the inclusivity is its own. */
function bandLabel(value: number, bins: ClassifierBins): string {
  const category = classifyFromBins(value, bins);
  return typeof category === "string" ? category : "";
}
