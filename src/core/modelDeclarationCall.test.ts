/**
 * How every registered declaration's `run` calls its library function, in the
 * two ways the compiler cannot see: positionally, so the order it asks for
 * values in has to be that function's own parameter order (ADR-0002 decision
 * 34); and with each option under the kwarg its `key` names, since the key and
 * the kwarg are spelled separately in the declaration (decision 36). Split out of `modelDeclarationRun.test.ts` when that file passed ADR §6's
 * line band; what `run` returns stays there.
 */
import { describe, expect, it, vi } from "vitest";
import * as library from "jsthermalcomfort";
import { adaptive_ashrae, heat_index_rothfusz, pmv_ppd, pmv_ppd_iso, Standard } from "jsthermalcomfort";
import { registeredModels } from "$lib/models";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { defaultSlot } from "./declarationTestSlots";
import { optionsReader, resolveQuantities, toLibraryInputs, valuesReader } from "./libraryInputs";
import type { OptionSpec, OptionsReader, RegisteredModel, ValuesReader } from "./modelDeclaration";
import { quantities, type Quantity } from "./quantities";

const q = quantities;

/** The arguments of the last call of each library function, by export name. */
const lastCalls = vi.hoisted(() => new Map<string, readonly unknown[]>());

// Every function the package exports, wrapped to record its arguments and
// otherwise unchanged: same result, and the library's own source from
// `toString`, which the parameter-name reader below depends on. A declaration
// imports its function from the package, so its `run` calls the wrapper.
vi.mock("jsthermalcomfort", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return Object.fromEntries(
    Object.entries(actual).map(([name, value]) => {
      if (typeof value !== "function") {
        return [name, value];
      }
      const original = value as (...args: unknown[]) => unknown;
      const recording = (...args: unknown[]) => {
        lastCalls.set(name, args);
        return original(...args);
      };
      recording.toString = () => Function.prototype.toString.call(original);
      return [name, recording];
    }),
  );
});

/** The package's exports, by name: a namespace import only a test may make, for the reason `modelDeclaration.test.ts` gives. */
const libraryExports: Record<string, unknown> = library;

const airSpeedControl: OptionSpec = {
  key: "airspeed_control",
  label: "Occupants control the air speed",
  default: false,
};

/**
 * A model that reads an option through `run`'s second reader, as PMV
 * (ASHRAE 55) will. Named after the function it calls, so the position test
 * can read that function's parameters.
 */
const readsAnOption = {
  ...pmvPpdIso,
  name: "pmv_ppd",
  standard: Standard.ashrae_55_2023,
  options: [airSpeedControl],
  run: (values, options) =>
    pmv_ppd(...values(q.tdb, q.tr, q.vr, q.rh, q.met, q.clo), 0, Standard.ashrae_55_2023, {
      units: "SI",
      limit_inputs: false,
      round_output: false,
      airspeed_control: options(airSpeedControl),
    }),
} satisfies RegisteredModel;

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
  const slot = defaultSlot(model);
  const read = valuesReader(resolveQuantities(slot, model));
  const asked: Quantity[] = [];
  // Only the recording is this test's; the values come back through the very
  // reader the app builds, so the positions being proved are the real ones.
  model.run((...quantities) => {
    asked.push(...quantities);
    return read(...quantities);
  }, optionsReader(slot.options));
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

  it("reads the quantities off `values` alone for a model that also reads an option", () => {
    const { asked, parameters } = askedAgainstParameters(readsAnOption);
    expect(asked).toEqual(["tdb", "tr", "vr", "rh", "met", "clo"]);
    expect(asked).toEqual(parameters);
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
export function readerTypeProof(values: ValuesReader, options: OptionsReader): void {
  const kwargs = { units: "SI", limit_inputs: false, round_output: false } as const;
  pmv_ppd_iso(...values(q.tdb, q.tr, q.vr, q.rh, q.met, q.clo), 0, pmvPpdIso.standard, kwargs);
  // @ts-expect-error one quantity too few: the `0` meant for `wme` fills `clo`, and the tail no longer fits
  pmv_ppd_iso(...values(q.tdb, q.tr, q.vr, q.rh, q.met), 0, pmvPpdIso.standard, kwargs);
  // @ts-expect-error a misspelt kwarg: the library spells it `units`, not `unit`
  pmv_ppd_iso(...values(q.tdb, q.tr, q.vr, q.rh, q.met, q.clo), 0, pmvPpdIso.standard, { unit: "SI" });
  const ashrae = Standard.ashrae_55_2023;
  pmv_ppd(...values(q.tdb, q.tr, q.vr, q.rh, q.met, q.clo), 0, ashrae, { airspeed_control: options(airSpeedControl) });
  // @ts-expect-error the reader itself, not its answer: the kwarg takes the boolean `options(…)` returns
  pmv_ppd(...values(q.tdb, q.tr, q.vr, q.rh, q.met, q.clo), 0, ashrae, { airspeed_control: options });
}

/**
 * Where `option` reaches the library call: the kwargs whose value differs
 * between a run with the option on and one with it off, everything else at the
 * model's defaults. A positional argument that differs is named by its index.
 */
function kwargsFedBy(model: RegisteredModel, option: OptionSpec): string[] {
  const slot = defaultSlot(model);
  const argumentsWith = (value: boolean): readonly unknown[] => {
    lastCalls.delete(model.name);
    model.run(toLibraryInputs(slot, model), optionsReader(new Map(slot.options).set(option, value)));
    const args = lastCalls.get(model.name);
    if (!args) {
      throw new Error(`${model.name}'s run did not call the library function it is named after`);
    }
    return args;
  };
  const on = argumentsWith(true);
  const off = argumentsWith(false);
  const fed: string[] = [];
  for (const [index, argument] of on.entries()) {
    const other = off[index];
    if (isKwargs(argument) && isKwargs(other)) {
      fed.push(...Object.keys({ ...argument, ...other }).filter((key) => argument[key] !== other[key]));
    } else if (argument !== other) {
      fed.push(`argument ${index}`);
    }
  }
  return fed;
}

function isKwargs(argument: unknown): argument is Readonly<Record<string, unknown>> {
  return typeof argument === "object" && argument !== null;
}

describe("an option's key", () => {
  it("is the kwarg its run feeds the option to, for every registered model", () => {
    for (const model of registeredModels) {
      for (const option of model.options) {
        expect(kwargsFedBy(model, option), `${model.name} ${option.key}`).toEqual([option.key]);
      }
    }
  });

  it("is found where the run puts it", () => {
    expect(kwargsFedBy(readsAnOption, airSpeedControl)).toEqual(["airspeed_control"]);
  });

  it("catches a key spelled differently from the kwarg, which is all the compiler cannot see", () => {
    const misspelt: OptionSpec = { ...airSpeedControl, key: "airspeed_contol" };
    const declared = {
      ...readsAnOption,
      options: [misspelt],
      run: (values: ValuesReader, options: OptionsReader) => readsAnOption.run(values, () => options(misspelt)),
    } satisfies RegisteredModel;
    expect(kwargsFedBy(declared, misspelt)).not.toEqual([misspelt.key]);
  });

  it("catches an option the run never reads", () => {
    const unread = { ...pmvPpdIso, name: "pmv_ppd_iso", options: [airSpeedControl] } satisfies RegisteredModel;
    expect(kwargsFedBy(unread, airSpeedControl)).toEqual([]);
  });
});
