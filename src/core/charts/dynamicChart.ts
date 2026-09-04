import type { Measure, Quantity } from "jsthermalcomfort/io";
import { bandFill, chartInk } from "$lib/core/bandPalette";
import { underTemperatureMode, type TemperatureMode } from "$lib/core/entryModes";
import {
  enteredQuantities,
  enteredRange,
  enteredValue,
  toLibraryInputs,
  withEnteredValues,
  type Range,
  type SlotInputs,
} from "$lib/core/libraryInputs";
import type { DynamicDeclaration, RegisteredModel } from "$lib/core/modelDeclaration";
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
 */
export function dynamicSpec(
  request: ChartRequest,
  chart: DynamicDeclaration,
  axes: { readonly x: Quantity; readonly y: Quantity },
): ChartSpec {
  const { model, slot, slotLabel, unitSystem } = request;
  const mode = slot.temperature.mode;
  // A remembered temperature axis follows the entry mode, so switching to
  // operative entry sweeps `t_o` rather than a `tdb` the slot no longer holds.
  const x = underTemperatureMode(axes.x, mode);
  const y = underTemperatureMode(axes.y, mode);
  const xRange = axisRange(model, x, mode);
  const yRange = axisRange(model, y, mode);
  const xUnit = displayUnitFor(x, unitSystem);
  const yUnit = displayUnitFor(y, unitSystem);

  const xValues = samples(xRange);
  const yValues = samples(yRange);
  const bands = bandsOf(model, measureOf(model, slot, chart.output));
  const z = yValues.map((yValue) =>
    xValues.map((xValue) => {
      const swept = withEnteredValues(slot, new Map([
        [x, xValue],
        [y, yValue],
      ]));
      return bandIndexOf(model, measureOf(model, swept, chart.output), bands.length);
    }),
  );

  const traces: Trace[] = [
    {
      kind: "bands",
      x: xValues.map((value) => xUnit.fromSi(value)),
      y: yValues.map((value) => yUnit.fromSi(value)),
      z,
      bands,
    },
  ];
  const legend: LegendEntry[] = bands.map((band) => ({ label: band.label, swatch: "fill", color: band.color }));

  const markerX = enteredValue(slot, x);
  const markerY = enteredValue(slot, y);
  if (markerX !== undefined && markerY !== undefined) {
    traces.push({
      kind: "point",
      x: xUnit.fromSi(markerX),
      y: yUnit.fromSi(markerY),
      color: chartInk.marker,
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
  };
}

/**
 * The quantities that can carry an axis: what the user enters, minus anything
 * the model declares no applicability range for — the range is what the scan
 * sweeps between.
 */
export function dynamicAxisQuantities(model: RegisteredModel, mode: TemperatureMode): Quantity[] {
  return enteredQuantities(model, mode).filter((quantity) => enteredRange(model, quantity, mode) !== undefined);
}

function axisRange(model: RegisteredModel, quantity: Quantity, mode: TemperatureMode): Range {
  const range = enteredRange(model, quantity, mode);
  if (!range) {
    throw new Error(`${model.model.label} declares no range for ${quantity.label}, so it cannot carry an axis`);
  }
  return range;
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
