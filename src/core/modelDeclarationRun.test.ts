/**
 * What every registered declaration's `run` returns, in the two ways the
 * compiler cannot see: the bands it declares have to cut the scanned output
 * into the category the run itself returned (ADR-0002 decision 27), and its
 * numbers have to come back unrounded where the dynamic chart scans them
 * (decision 35). How it calls its library function is the sibling
 * `modelDeclarationCall.test.ts`'s.
 *
 * What a declaration says about itself — its library name, its standard, the
 * axis range a chart reads off it — is the sibling `modelDeclaration.test.ts`'s.
 */
import { describe, expect, it } from "vitest";
import { classifyFromBins, pmv_ppd_iso, type ClassifierBins } from "jsthermalcomfort";
import { registeredModels } from "$lib/models";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { defaultSlot } from "./declarationTestSlots";
import { optionsReader, resultValue, toLibraryInputs, withEnteredValues, type SlotInputs } from "./libraryInputs";
import {
  dynamicChartOf,
  requireAxisRange,
  type DynamicDeclaration,
  type Range,
  type RegisteredModel,
  type Values,
} from "./modelDeclaration";
import { quantityFor, type Quantity } from "./quantities";

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
 * The chart's x axis, as both of the tests below walk it: the model's own
 * declared defaults, the extent the axis is drawn over, the slot at a position
 * along it, and the chart's scanned output there.
 */
function alongTheXAxis(model: RegisteredModel, chart: DynamicDeclaration) {
  const defaults = defaultSlot(model);
  const axis = chart.axes.x;
  const at = (position: number) => withEnteredValues(defaults, new Map([[axis, position]]));
  return {
    defaults,
    range: requireAxisRange(model, axis),
    at,
    outputAt: (position: number) => {
      const slot = at(position);
      return Number(resultValue(model.run(toLibraryInputs(slot, model), optionsReader(slot.options)), chart.output));
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
 *
 * It does not detect a `run` that rounds. The bisection runs on whatever `run`
 * returns, so a rounded output can move the bracket onto the rounding step
 * itself, where both ends agree — measured on Heat Index in ticket 06, where
 * the whole suite stayed green. "run's numbers" below tests that property
 * directly (ADR-0002 decision 35).
 */
function driftProbes(model: RegisteredModel, chart: DynamicDeclaration): SlotInputs[] {
  const { defaults, range, at, outputAt } = alongTheXAxis(model, chart);

  const probes = [defaults];
  for (const edge of chart.bands.edges) {
    const bracket = bracketAcross(outputAt, range, edge);
    if (bracket) {
      probes.push(at(bracket[0]), at(bracket[1]));
    }
  }
  return probes;
}

describe("the dynamic chart's declared bands", () => {
  it("bin the scanned output into the category the run itself returned, for every registered model", () => {
    for (const model of registeredModels) {
      const chart = dynamicChartOf(model);
      if (!chart) continue;
      const classified = classifiedOutputOf(model, chart.bands);
      const probes = driftProbes(model, chart);
      // A model whose Edges the axis cannot reach would pass vacuously.
      expect(probes.length, model.info.label).toBeGreaterThan(1);
      for (const slot of probes) {
        const result = model.run(toLibraryInputs(slot, model), optionsReader(slot.options));
        const value = resultValue(result, chart.output);
        expect(typeof value, `${model.info.label} ${chart.output.label}`).toBe("number");
        expect(classifyFromBins(Number(value), chart.bands), `${model.info.label} at ${chart.output.label} ${String(value)}`).toBe(
          resultValue(result, classified),
        );
      }
    }
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
 * How many of the chart output's values, sampled along the chart's x axis,
 * carry more decimals than any rounding the library applies would leave. A
 * count over the whole sample rather than an assertion per value: an unrounded
 * kernel still returns a value on the grid now and then, and one such value
 * says nothing.
 */
function unroundedSampleCount(model: RegisteredModel, chart: DynamicDeclaration): number {
  const { range, outputAt } = alongTheXAxis(model, chart);
  // A kernel out of its domain returns NaN, which is off no grid and on every
  // one; left to the comparison below it would read as rounding. Heat Index
  // returns NaN below 27 °C unless the call turns `limit_inputs` off, so the
  // next model would fail this test with the wrong reason printed.
  const finite = (position: number) => {
    const value = outputAt(position);
    if (!Number.isFinite(value)) {
      throw new Error(`${model.info.label} returns ${String(value)} for ${chart.output.label} at ${chart.axes.x.label} ${position}`);
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
  it("come back unrounded where the dynamic chart scans them, for every registered model", () => {
    for (const model of registeredModels) {
      const chart = dynamicChartOf(model);
      if (!chart) continue;
      // The rounding switch is written by hand in each declaration's call,
      // under whatever name the library function gives it, so nothing but this
      // stops the next author from leaving it on (ADR-0002 decisions 18 and
      // 35). What it costs is silent: within half a rounding step of an Edge
      // the chart's band and the table's category disagree, and the dynamic
      // chart's surface becomes a staircase.
      expect(unroundedSampleCount(model, chart), `${model.info.label} ${chart.output.label}`).toBeGreaterThan(0);
    }
  });

  it("are asserted by a test a rounding kernel fails", () => {
    // Proven red 2026-09-22: `round_output: true` in the real ISO declaration
    // made the registry test above fail. The drift test happens to fail
    // with it, because ISO's Edges sit on the 0.01 grid `round_output` rounds
    // to; on Heat Index, measured in ticket 06, it stays green. `driftProbes`
    // bisects on whatever `run` returns, so a rounded output can simply move
    // the bracket onto a rounding step where both ends agree.
    const chart = dynamicChartOf(pmvPpdIso);
    if (!chart) throw new Error("PMV (ISO 7730) declares a dynamic chart");
    expect(unroundedSampleCount(isoRounding(true), chart)).toBe(0);
    expect(unroundedSampleCount(isoRounding(false), chart)).toBeGreaterThan(0);
  });
});
