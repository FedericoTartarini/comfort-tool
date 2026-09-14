import type { ClassifierBins } from "jsthermalcomfort-main";
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
 * Banding reads the category the model itself returned for `chart.output` —
 * a classified output, `info.outputs[key].classifier` — and colours it by its
 * position in that classifier's `labels`. No threshold is written or
 * re-classified here (ADR-0002 decision 8).
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
    const classifier = classifierFor(model, chart.output);
    const bands = bandsOf(classifier);
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
          return bandIndexOf(classifier, categoryOf(model, swept, chart.output));
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

/** `chart.output`'s classifier — required, since a dynamic chart's output is always a classified one. */
function classifierFor(model: RegisteredModel, output: Quantity): ClassifierBins {
  const classifier = model.info.outputs[output.key]?.classifier;
  if (!classifier) {
    throw new Error(`${model.info.label} declares ${output.label} as a dynamic chart output, but it has no classifier`);
  }
  return classifier;
}

/** The category `output` takes for `slot`, read off a fresh run's result object. */
function categoryOf(model: RegisteredModel, slot: SlotInputs, output: Quantity): string | number {
  const result = model.run(toLibraryInputs(slot, model));
  return resultValue(result, output) ?? Number.NaN;
}

function bandsOf(classifier: ClassifierBins): readonly BandFill[] {
  return classifier.labels.map((label, index) => ({ label, color: bandFill(index) }));
}

function bandIndexOf(classifier: ClassifierBins, category: string | number): number | null {
  const index = classifier.labels.indexOf(category as string);
  return index === -1 ? null : index;
}
