/**
 * What every registered declaration's `run` returns, in the two ways the
 * compiler cannot see: the bands a scanned chart declares have to cut its
 * output into the category the run itself returned (ADR-0002 decision 27), and
 * the number in the table's first column has to come back unrounded (decisions
 * 35 and 38). How it calls its library function is the sibling
 * `modelDeclarationCall.test.ts`'s.
 *
 * What a declaration says about itself — its library name, its standard, the
 * axis range a chart reads off it — is the sibling `modelDeclaration.test.ts`'s.
 */
import { describe, expect, it } from "vitest";
import { classifyFromBins, pmv_ppd_iso, type ClassifierBins } from "jsthermalcomfort";
import { registeredModels } from "$lib/models";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { chartType } from "./chartType";
import { defaultSlot } from "./declarationTestSlots";
import { withEnteredValues, type SlotInputs } from "./libraryInputs";
import {
  dynamicChartOf,
  isPolygonsChart,
  requireAxisRange,
  type DynamicDeclaration,
  type Range,
  type RegisteredModel,
  type ScannedDeclaration,
  type Values,
} from "./modelDeclaration";
import { resultValue, runOn } from "./modelRun";
import { quantities, quantityFor, type Quantity } from "./quantities";

/**
 * The classified output the declared bands cut, found by object identity:
 * nothing in `_INFO` names the quantity a classifier belongs to, which is why
 * the declaration pairs them by reference in the first place (ADR-0002
 * decision 27).
 */
function classifiedOutputOf(model: RegisteredModel, bins: ClassifierBins): Quantity {
  const key = Object.entries(model.info.outputs).find(([, output]) => output.classifier === bins)?.[0];
  const quantity = key === undefined ? undefined : quantityFor(key);
  if (!quantity) {
    throw new Error(`${model.info.label} declares bands that classify none of its outputs`);
  }
  return quantity;
}

/**
 * The ISO declaration with its dynamic chart drawn from polygons, as
 * Adaptive's is: the chart names no output and no bands, so only the table
 * says which number `run` must return unrounded.
 */
const isoWithPolygonsChart = {
  ...pmvPpdIso,
  charts: [{ type: chartType.dynamic, axes: { x: quantities.tdb, y: quantities.v }, zones: () => [] }],
} satisfies RegisteredModel;

/**
 * The chart's x axis, as both of the tests below walk it: the model's own
 * declared defaults, the range the axis is drawn over, the slot at a position
 * along it, and the run's value for a quantity there.
 */
function alongTheXAxis(model: RegisteredModel, chart: DynamicDeclaration) {
  const defaults = defaultSlot(model);
  const axis = chart.axes.x;
  const at = (position: number) => withEnteredValues(defaults, new Map([[axis, position]]));
  return {
    defaults,
    range: requireAxisRange(model, axis),
    at,
    valueAt: (position: number, quantity: Quantity) => {
      return resultValue(runOn(at(position), model), quantity);
    },
  };
}

/** The narrowest bracket on `range` whose output straddles `edge`; nothing when it never does. */
function bracketAcross(outputAt: (position: number) => number, range: Range, edge: number): [number, number] | undefined {
  const rising = outputAt(range.max) > outputAt(range.min);
  const past = (position: number) => (rising ? outputAt(position) >= edge : outputAt(position) <= edge);
  if (past(range.min) || !past(range.max)) {
    return undefined;
  }
  let low = range.min;
  let high = range.max;
  // 40 halvings of any axis this app draws leave the pair within ~1e-11 of the
  // crossing: close enough that only bands that are not the kernel's can put
  // the two ends in different categories.
  for (let step = 0; step < 40; step++) {
    const middle = (low + high) / 2;
    if (past(middle)) {
      high = middle;
    } else {
      low = middle;
    }
  }
  return [low, high];
}

/**
 * The declaration's defaults, and inputs either side of every Edge the chart's
 * x axis can reach. Bands that are not the kernel's own disagree at both: at
 * the defaults when they are the wrong bins altogether, and within a hair of
 * an Edge when only one cut is misplaced, which is why the rest of the probes
 * go there.
 */
function driftProbes(model: RegisteredModel, chart: ScannedDeclaration): SlotInputs[] {
  const { defaults, range, at, valueAt } = alongTheXAxis(model, chart);
  const outputAt = (position: number) => Number(valueAt(position, chart.output));

  const probes = [defaults];
  for (const edge of chart.bands.edges) {
    const bracket = bracketAcross(outputAt, range, edge);
    if (bracket) {
      probes.push(at(bracket[0]), at(bracket[1]));
    }
  }
  return probes;
}

/** Asserts that the dynamic chart's bands cut the run's output where the run itself does, at every probe. */
function expectBandsToBinAsRunDoes(model: RegisteredModel): void {
  const chart = dynamicChartOf(model);
  // A chart drawn from polygons scans nothing, so it declares no bands to check.
  if (!chart || isPolygonsChart(chart)) return;
  const classified = classifiedOutputOf(model, chart.bands);
  const probes = driftProbes(model, chart);
  // A model whose Edges the axis cannot reach would pass vacuously.
  expect(probes.length, model.info.label).toBeGreaterThan(1);
  for (const slot of probes) {
    const result = runOn(slot, model);
    const value = resultValue(result, chart.output);
    expect(typeof value, `${model.info.label} ${chart.output.label}`).toBe("number");
    expect(classifyFromBins(Number(value), chart.bands), `${model.info.label} at ${chart.output.label} ${String(value)}`).toBe(
      resultValue(result, classified),
    );
  }
}

describe("the dynamic chart's declared bands", () => {
  it("bin the scanned output into the category the run itself returned, for every registered model", () => {
    for (const model of registeredModels) {
      expectBandsToBinAsRunDoes(model);
    }
  });

  it("are not looked for on a chart drawn from polygons", () => {
    const neverRun = {
      ...isoWithPolygonsChart,
      run: () => {
        throw new Error("a chart with no bands was probed");
      },
    } satisfies RegisteredModel;
    expect(() => expectBandsToBinAsRunDoes(neverRun)).not.toThrow();
  });
});

/**
 * The grid a rounded output lands on, as the multiplier that makes it
 * integral. Nothing in the library rounds finer than 2 decimals — `pmv` under
 * `round_output` and the switchless `ce`, `pet` and `clo_tout` round to 2,
 * everything else to 1 — so 0.01 catches every rounding the library applies,
 * and an unrounded output lands on it only by accident. Checked against the
 * library on 2026-09-22; a coarser grid would let a 2-decimal kernel through.
 */
const ROUNDED_GRID_PER_UNIT = 100;

/** Positions sampled along the axis, endpoints included. Enough of them that no unrounded output lands on the grid at every one. */
const SAMPLES_ALONG_THE_AXIS = 25;

/**
 * How many of the first table column's values, sampled along the dynamic
 * chart's x axis, carry more decimals than any rounding the library applies
 * would leave. The first column because every model declares one, whatever
 * its chart scans or draws, and what the table shows is what must be
 * unrounded (ADR-0002 decision 38). A count over the whole sample rather than
 * an assertion per value: an unrounded kernel still returns a value on the
 * grid now and then, and one such value says nothing.
 */
function unroundedSampleCount(model: RegisteredModel, chart: DynamicDeclaration): number {
  const { range, valueAt } = alongTheXAxis(model, chart);
  const column = model.table[0];
  if (!column) {
    throw new Error(`${model.info.label} declares no table column`);
  }
  // A kernel out of its domain returns NaN, which is off no grid and on every
  // one; left to the comparison below it would read as rounding. Heat Index
  // returns NaN below 27 °C unless the call turns `limit_inputs` off, so the
  // next model would fail this test with the wrong reason printed. A first
  // column that is a category or a yes-or-no answer has no decimals to check.
  const finite = (position: number) => {
    const value = valueAt(position, column);
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${model.info.label} returns ${String(value)} for ${column.label} at ${chart.axes.x.label} ${position}`);
    }
    return value;
  };
  const positions = Array.from(
    { length: SAMPLES_ALONG_THE_AXIS },
    (_, step) => range.min + ((range.max - range.min) * step) / (SAMPLES_ALONG_THE_AXIS - 1),
  );
  return positions.filter((position) => {
    const scaled = finite(position) * ROUNDED_GRID_PER_UNIT;
    // A double carries ~1e-12 of resolution at the magnitudes these outputs
    // scale to, so a gap this much wider than that is the output's own
    // decimals and not the error of the multiplication.
    return Math.abs(scaled - Math.round(scaled)) > 1e-6;
  }).length;
}

/**
 * The ISO declaration with its rounding switch under the test's control. The
 * call is written out rather than wrapped, because rounding cannot be added to
 * `run`'s result after the fact; only the switch differs between the two halves
 * of the proof below.
 */
function isoRounding(round_output: boolean) {
  return {
    ...pmvPpdIso,
    run: (values: Values) =>
      pmv_ppd_iso({
        tdb: values.tdb,
        tr: values.tr,
        vr: values.vr,
        rh: values.rh,
        met: values.met,
        clo: values.clo,
        wme: 0,
        standard: pmvPpdIso.standard,
        limit_inputs: false,
        round_output,
      }),
  } satisfies RegisteredModel;
}

describe("run's numbers", () => {
  it("come back unrounded in the table's first column, for every registered model", () => {
    for (const model of registeredModels) {
      const chart = dynamicChartOf(model);
      if (!chart) continue;
      // The rounding switch is written by hand in each declaration's call,
      // under whatever name the library function gives it, so nothing but this
      // stops the next author from leaving it on (ADR-0002 decisions 18 and
      // 35). What it costs is silent: within half a rounding step of an Edge
      // the chart's band and the table's category disagree, and the dynamic
      // chart's surface becomes a staircase.
      expect(unroundedSampleCount(model, chart), `${model.info.label} first table column`).toBeGreaterThan(0);
    }
  });

  it("are asserted by a test a rounding kernel fails", () => {
    // `round_output: true` in the real ISO declaration would fail the registry
    // test above, as `isoRounding(true)`'s zero count shows here. The drift
    // test would fail with it too, but only because ISO's Edges sit on the
    // 0.01 grid `round_output` rounds to; on Heat Index it stays green
    // (ADR-0002 decision 35). `driftProbes` bisects on whatever `run` returns,
    // so a rounded output can simply move the bracket onto a rounding step
    // where both ends agree.
    const chart = dynamicChartOf(pmvPpdIso);
    if (!chart) throw new Error("PMV (ISO 7730) declares a dynamic chart");
    expect(unroundedSampleCount(isoRounding(true), chart)).toBe(0);
    expect(unroundedSampleCount(isoRounding(false), chart)).toBeGreaterThan(0);
  });

  it("are asserted for a model whose chart is polygons, which scans no output", () => {
    expect(unroundedSampleCount(isoWithPolygonsChart, isoWithPolygonsChart.charts[0])).toBeGreaterThan(0);
  });
});
