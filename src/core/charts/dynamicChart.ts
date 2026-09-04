import type { Measure, Quantity } from "jsthermalcomfort/io";
import { bandFill, chartInk } from "$lib/core/bandPalette";
import { underTemperatureMode, type TemperatureMode } from "$lib/core/entryModes";
import {
  enteredQuantities,
  enteredValue,
  resolveQuantities,
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
import { displayUnitFor } from "$lib/core/units";
import { axisTitle, type ChartRequest, type ChartSpec, type LegendEntry, type Trace } from "./chartSpec";

/** Grid resolution, the same for every model (ADR §2 "Precision"). */
const GRID = 100;

interface BandFill {
  readonly label: string;
  readonly color: string;
}

/**
 * The dynamic chart: the declared output scanned over a `GRID × GRID` field of
 * two entered quantities, coloured by the band each point falls into, with the
 * slot's own state marked.
 *
 * Banding reads whatever the library put on the output `Measure`: nested
 * acceptability `intervals` where a model has them (the narrowest satisfied one
 * wins), otherwise the `category` position in the model's classification
 * scale. No threshold is written here.
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
    const bands = bandsOf(model, measureOf(model, slot, chart.output));
    traces.push({
      kind: "bands",
      hover: "field",
      x: xValues.map((value) => xUnit.fromSi(value)),
      y: yValues.map((value) => yUnit.fromSi(value)),
      z: yValues.map((yValue) =>
        xValues.map((xValue) => {
          const swept = withEnteredValues(slot, new Map([
            [x, xValue],
            [y, yValue],
          ]));
          return bandIndexOf(model, measureOf(model, swept, chart.output), bands.length);
        }),
      ),
      bands,
    });
    legend.push(...bands.map((band): LegendEntry => ({ label: band.label, swatch: "fill", color: band.color })));
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
 * switching to operative entry sweeps `t_o` rather than a `tdb` the slot no
 * longer holds — and because that maps both `tdb` and `tr` onto `t_o`, a chart
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

function measureOf(model: RegisteredModel, slot: SlotInputs, output: Quantity): Measure | undefined {
  return model.run(toLibraryInputs(slot, model)).toMeasures().find((measure) => measure.quantity === output);
}

function bandsOf(model: RegisteredModel, reference: Measure | undefined): readonly BandFill[] {
  if (reference && reference.intervals.length > 0) {
    return reference.intervals.map((interval, index) => ({ label: interval.label, color: bandFill(index) }));
  }
  const scale = model.model.tsv;
  if (!scale) {
    return [];
  }
  return scale.intervals.map((interval, index) => ({ label: interval.label, color: bandFill(index) }));
}

function bandIndexOf(model: RegisteredModel, measure: Measure | undefined, bandCount: number): number | null {
  if (!measure || bandCount === 0) {
    return null;
  }
  if (measure.intervals.length > 0) {
    // Acceptability intervals nest, widest first, so the last satisfied one is
    // the strictest the point meets.
    for (let index = measure.intervals.length - 1; index >= 0; index -= 1) {
      if (measure.intervals[index].satisfied) {
        return index;
      }
    }
    return null;
  }
  const scale = model.model.tsv;
  const band = scale?.classify(measure.value);
  if (!scale || !band) {
    return null;
  }
  return scale.intervals.indexOf(band);
}
