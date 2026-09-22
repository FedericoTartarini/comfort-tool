/**
 * What every registered declaration's `run` does, in the three ways the
 * compiler cannot see: it calls its library function positionally, so the order
 * it asks for values in has to be that function's own parameter order
 * (ADR-0002 decision 34); the bands it declares have to cut the scanned output
 * into the category the run itself returned (decision 27); and its numbers have
 * to come back unrounded where the dynamic chart scans them (decision 35).
 *
 * What a declaration says about itself — its library name, its standard, the
 * axis range a chart reads off it — is the sibling `modelDeclaration.test.ts`'s.
 */
import { describe, expect, it } from "vitest";
import * as library from "jsthermalcomfort";
import { adaptive_ashrae, classifyFromBins, heat_index_rothfusz, pmv_ppd_iso, type ClassifierBins } from "jsthermalcomfort";
import { registeredModels } from "$lib/models";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { humidityMode, temperatureMode } from "./entryModes";
import { resolveQuantities, resultValue, toLibraryInputs, valuesReader, withEnteredValues, type SlotInputs } from "./libraryInputs";
import { dynamicChartOf, requireAxisRange, type DynamicDeclaration, type Range, type RegisteredModel, type ValuesReader } from "./modelDeclaration";
import { quantities, quantityFor, type Quantity } from "./quantities";

const q = quantities;

/** The package's exports, by name: a namespace import only a test may make, for the reason `modelDeclaration.test.ts` gives. */
const libraryExports: Record<string, unknown> = library;

/** A slot holding the model's own declared defaults, in the default entry modes. */
function defaultSlot(model: RegisteredModel): SlotInputs {
  const values = new Map<Quantity, number>();
  let humidity = { mode: humidityMode.rh, value: 0 };
  for (const { quantity, value } of model.inputs) {
    if (quantity === humidityMode.rh.quantity) {
      humidity = { mode: humidityMode.rh, value };
    } else {
      values.set(quantity, value);
    }
  }
  return { values, humidity, temperature: { mode: temperatureMode.separate } };
}

/** A library model function, as the namespace import above hands one over. */
type LibraryFunction = (...args: never[]) => unknown;

/**
 * A function's parameter names, in order, read off its own source. The
 * package's `lib/esm` is unminified, so these are the library's own names; a
 * production build renames them, which is why only a test may do this
 * (ADR-0002 decision 34, and the same reason `fn.name` cannot replace
 * `RegisteredModel.name`).
 *
 * The list is split at depth-0 commas, so a default value carrying commas of
 * its own stays one parameter — `heat_index_rothfusz(tdb, rh, options = {
 * round: true, units: "SI" })` is written exactly that way. Quoted text is
 * stepped over, so a bracket or comma inside a string cannot shift the depth.
 */
function parameterNames(fn: LibraryFunction): string[] {
  const source = fn.toString();
  const open = source.indexOf("(");
  const parameters: string[] = [];
  let depth = 0;
  let start = open + 1;
  let quote = "";
  for (let index = open; index < source.length; index++) {
    const character = source[index];
    if (quote !== "") {
      if (character === "\\") index++;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
    } else if ("([{".includes(character)) {
      depth++;
    } else if (")]}".includes(character)) {
      depth--;
      if (depth === 0) {
        parameters.push(source.slice(start, index));
        // A parameterless function leaves one empty slice behind.
        return parameters.map((parameter) => parameter.split("=")[0].trim()).filter((name) => name !== "");
      }
    } else if (character === "," && depth === 1) {
      parameters.push(source.slice(start, index));
      start = index + 1;
    }
  }
  throw new Error(`Could not find the end of the parameter list of ${source.slice(0, 40)}`);
}

/**
 * The quantities a model's `run` asks its reader for, in order. The reader
 * answers with the model's own resolved defaults, so the library call runs on
 * the numbers it runs on in the app rather than on placeholders a kernel might
 * reject.
 */
function askedQuantities(model: RegisteredModel): readonly Quantity[] {
  const read = valuesReader(resolveQuantities(defaultSlot(model), model));
  const asked: Quantity[] = [];
  // Only the recording is this test's; the values come back through the very
  // reader the app builds, so the positions being proved are the real ones.
  model.run((...quantities) => {
    asked.push(...quantities);
    return read(...quantities);
  });
  return asked;
}

/** The two lists the position test compares: what `run` asked for, and what the library function calls its leading parameters. */
function askedAgainstParameters(model: RegisteredModel): { asked: string[]; parameters: string[] } {
  const asked = askedQuantities(model).map((quantity) => quantity.key);
  return { asked, parameters: parameterNames(libraryExports[model.name] as LibraryFunction).slice(0, asked.length) };
}

describe("the parameter-name reader", () => {
  it("reads a plain positional list, defaults and all", () => {
    expect(parameterNames(adaptive_ashrae)).toEqual(["tdb", "tr", "t_running_mean", "v", "units", "limit_inputs", "round_output"]);
  });

  it("keeps a default object that carries commas of its own whole", () => {
    expect(parameterNames(heat_index_rothfusz)).toEqual(["tdb", "rh", "options"]);
  });

  it("reads the list the position test below actually rests on", () => {
    expect(parameterNames(pmv_ppd_iso)).toEqual(["tdb", "tr", "vr", "rh", "met", "clo", "wme", "model", "kwargs"]);
  });
});

describe("run's positional call", () => {
  it("asks for its values in the order of the library function's own parameters, for every registered model", () => {
    for (const model of registeredModels) {
      const { asked, parameters } = askedAgainstParameters(model);
      // A `run` that asked for nothing would pass vacuously.
      expect(asked.length, model.name).toBeGreaterThan(0);
      expect(asked, model.name).toEqual(parameters);
    }
  });

  it("catches two quantities in each other's place, which is all the compiler cannot see", () => {
    // Proven red 2026-09-22: swapping `q.tdb` and `q.tr` in the real
    // declaration made the registry test above fail on `pmv_ppd_iso` and
    // nothing else — not `npm run check`, because both parameters are numbers.
    const swapped = {
      ...pmvPpdIso,
      run: (values: ValuesReader) =>
        pmv_ppd_iso(...values(q.tr, q.tdb, q.vr, q.rh, q.met, q.clo), 0, pmvPpdIso.standard, {
          units: "SI",
          limit_inputs: false,
          round_output: false,
        }),
    } satisfies RegisteredModel;
    const { asked, parameters } = askedAgainstParameters(swapped);
    expect(asked).not.toEqual(parameters);
  });
});

/**
 * Type-level proof, compiled by `npm run check` and never called: the reader's
 * tuple return is what makes the compiler count the arguments and spell the
 * kwargs, so each `@ts-expect-error` here fails the build the day it stops
 * doing so. Checked by hand on 2026-09-22 against a declared signature; this
 * pins it against the real one. Exported only because `noUnusedLocals` would
 * otherwise flag it.
 */
export function readerTypeProof(values: ValuesReader): void {
  const kwargs = { units: "SI", limit_inputs: false, round_output: false } as const;
  pmv_ppd_iso(...values(q.tdb, q.tr, q.vr, q.rh, q.met, q.clo), 0, pmvPpdIso.standard, kwargs);
  // @ts-expect-error one quantity too few: the `0` meant for `wme` fills `clo`, and the tail no longer fits
  pmv_ppd_iso(...values(q.tdb, q.tr, q.vr, q.rh, q.met), 0, pmvPpdIso.standard, kwargs);
  // @ts-expect-error a misspelt kwarg: the library spells it `units`, not `unit`
  pmv_ppd_iso(...values(q.tdb, q.tr, q.vr, q.rh, q.met, q.clo), 0, pmvPpdIso.standard, { unit: "SI" });
}
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
    outputAt: (position: number) => Number(resultValue(model.run(toLibraryInputs(at(position), model)), chart.output)),
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
        const result = model.run(toLibraryInputs(slot, model));
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
    run: (values: ValuesReader) =>
      pmv_ppd_iso(...values(q.tdb, q.tr, q.vr, q.rh, q.met, q.clo), 0, pmvPpdIso.standard, {
        units: "SI",
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
