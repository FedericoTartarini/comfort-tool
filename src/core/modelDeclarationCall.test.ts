/**
 * How every registered declaration's `run` calls its library function, in the
 * two ways the compiler cannot see: each quantity key of the params object has
 * to carry that quantity's own number (ADR-0002 decision 34); and each option
 * has to sit under the key its `key` names, since the key and the property are
 * spelled separately in the declaration (decision 36). Split out of
 * `modelDeclarationRun.test.ts` when that file passed ADR §6's line band; what
 * `run` returns stays there.
 */
import { describe, expect, it, vi } from "vitest";
import { pmv_ppd_ashrae, pmv_ppd_iso, Standard } from "jsthermalcomfort";
import { registeredModels } from "$lib/models";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { defaultSlot } from "./declarationTestSlots";
import { optionsReader, resolveQuantities, toLibraryInputs, valuesReader } from "./libraryInputs";
import type { OptionSpec, OptionsReader, RegisteredModel, Values } from "./modelDeclaration";
import { quantityFor, type Quantity } from "./quantities";

/** The arguments of the last call of each library function, by export name. */
const lastCalls = vi.hoisted(() => new Map<string, readonly unknown[]>());

// Every function the package exports, wrapped to record its arguments and
// otherwise unchanged. A declaration imports its function from the package,
// so its `run` calls the wrapper.
vi.mock("jsthermalcomfort", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return Object.fromEntries(
    Object.entries(actual).map(([name, value]) => {
      if (typeof value !== "function") {
        return [name, value];
      }
      const original = value as (...args: unknown[]) => unknown;
      return [
        name,
        (...args: unknown[]) => {
          lastCalls.set(name, args);
          return original(...args);
        },
      ];
    }),
  );
});

const airSpeedControl: OptionSpec = {
  key: "airspeed_control",
  label: "Occupants control the air speed",
  default: false,
};

/**
 * A model that reads an option through `run`'s second reader, as PMV
 * (ASHRAE 55) will. Named after the function it calls, so the recording above
 * can be found under that name.
 */
const readsAnOption = {
  ...pmvPpdIso,
  info: { ...pmvPpdIso.info, name: "pmv_ppd_ashrae" },
  standard: Standard.ashrae_55_2023,
  options: [airSpeedControl],
  run: (values, options) =>
    pmv_ppd_ashrae({
      tdb: values.tdb,
      tr: values.tr,
      vr: values.vr,
      rh: values.rh,
      met: values.met,
      clo: values.clo,
      wme: 0,
      standard: Standard.ashrae_55_2023,
      limit_inputs: false,
      round_output: false,
      // The cooling effect logs when it assumes 0; nothing here reads the log.
      suppress_warnings: true,
      airspeed_control: options(airSpeedControl),
    }),
} satisfies RegisteredModel;

/** The params object of the last call `model.run` made to the library function it is named after. */
function receivedParams(model: RegisteredModel, values: Values, options: OptionsReader): Readonly<Record<string, unknown>> {
  lastCalls.delete(model.info.name);
  model.run(values, options);
  const params = lastCalls.get(model.info.name)?.[0];
  if (typeof params !== "object" || params === null) {
    throw new Error(`${model.info.name}'s run did not call the library function it is named after with a params object`);
  }
  return params as Readonly<Record<string, unknown>>;
}

/**
 * The quantity keys of the params object `model.run` hands its library
 * function whose number is not the one the values object gave for that
 * quantity. The values are the model's own resolved defaults, each moved by a
 * different thousandth so that no two quantities share a number and the
 * kernel still runs on numbers it runs on in the app. A key whose quantity the
 * slot does not hold — `wme`, written as the literal 0 — has no number to
 * compare and is skipped; the rest are the ones the compiler cannot pair.
 */
function mispairedKeys(model: RegisteredModel): { checked: string[]; mispaired: string[] } {
  const slot = defaultSlot(model);
  const distinct = new Map<Quantity, number>(
    [...resolveQuantities(slot, model)].map(([quantity, value], index) => [quantity, value + (index + 1) / 1000]),
  );
  expect(new Set(distinct.values()).size, `${model.info.name} distinct values`).toBe(distinct.size);
  const params = receivedParams(model, valuesReader(distinct), optionsReader(slot.options));
  const checked: string[] = [];
  const mispaired: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    const quantity = quantityFor(key);
    if (!quantity || !distinct.has(quantity)) continue;
    checked.push(key);
    if (value !== distinct.get(quantity)) mispaired.push(key);
  }
  return { checked, mispaired };
}

describe("run's params object", () => {
  it("carries each quantity's own number under that quantity's key, for every registered model", () => {
    for (const model of registeredModels) {
      const { checked, mispaired } = mispairedKeys(model);
      // A `run` that passed no quantity would pass vacuously.
      expect(checked.length, model.info.name).toBeGreaterThan(0);
      expect(mispaired, model.info.name).toEqual([]);
    }
  });

  it("catches two quantities in each other's place, which is all the compiler cannot see", () => {
    // Proven red 2026-09-25: the same swap in the real declaration made the
    // registry test above fail on `pmv_ppd_iso`'s `tdb` and `tr` and nothing
    // else — not `npm run check`, because both keys are numbers. Written out
    // rather than wrapped: spreading `values` would read every quantity, and throw
    // on the first one the slot does not hold.
    const swapped = {
      ...pmvPpdIso,
      run: (values: Values) =>
        pmv_ppd_iso({
          tdb: values.tr,
          tr: values.tdb,
          vr: values.vr,
          rh: values.rh,
          met: values.met,
          clo: values.clo,
          wme: 0,
          standard: pmvPpdIso.standard,
          limit_inputs: false,
          round_output: false,
        }),
    } satisfies RegisteredModel;
    expect(mispairedKeys(swapped).mispaired).toEqual(["tdb", "tr"]);
  });

  it("pairs every quantity for a model that also reads an option", () => {
    expect(mispairedKeys(readsAnOption)).toEqual({ checked: ["tdb", "tr", "vr", "rh", "met", "clo"], mispaired: [] });
  });
});

/**
 * Type-level proof, compiled by `npm run check` and never called: the
 * library's params types are what make the compiler check each key, so each
 * `@ts-expect-error` here fails the build the day it stops doing so. Exported
 * only because `noUnusedLocals` would otherwise flag it.
 */
export function valuesTypeProof(values: Values, options: OptionsReader): void {
  const standard = pmvPpdIso.standard;
  // Spread only where every key is a required quantity, which a wrong key
  // turns into a missing one; the key under test is always written inline.
  const withoutClo = { tdb: values.tdb, tr: values.tr, vr: values.vr, rh: values.rh, met: values.met };
  pmv_ppd_iso({ ...withoutClo, clo: values.clo, wme: 0, standard, limit_inputs: false });
  // @ts-expect-error a missing required key: the quantity `clo` is forgotten
  pmv_ppd_iso({ ...withoutClo, wme: 0, standard });
  // @ts-expect-error a misspelt key: the library spells it `limit_inputs`
  pmv_ppd_iso({ ...withoutClo, clo: values.clo, limit_input: false });
  const ashrae = { ...withoutClo, clo: values.clo };
  pmv_ppd_ashrae({ ...ashrae, airspeed_control: options(airSpeedControl) });
  // @ts-expect-error the reader itself, not its answer: the key takes the boolean `options(…)` returns
  pmv_ppd_ashrae({ ...ashrae, airspeed_control: options });
}

/**
 * Where `option` reaches the library call: the kwargs whose value differs
 * between a run with the option on and one with it off, everything else at the
 * model's defaults. A positional argument that differs is named by its index.
 */
function kwargsFedBy(model: RegisteredModel, option: OptionSpec): string[] {
  const slot = defaultSlot(model);
  const argumentsWith = (value: boolean): readonly unknown[] => {
    lastCalls.delete(model.info.name);
    model.run(toLibraryInputs(slot, model), optionsReader(new Map(slot.options).set(option, value)));
    const args = lastCalls.get(model.info.name);
    if (!args) {
      throw new Error(`${model.info.name}'s run did not call the library function it is named after`);
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
        expect(kwargsFedBy(model, option), `${model.info.name} ${option.key}`).toEqual([option.key]);
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
      run: (values: Values, options: OptionsReader) => readsAnOption.run(values, () => options(misspelt)),
    } satisfies RegisteredModel;
    expect(kwargsFedBy(declared, misspelt)).not.toEqual([misspelt.key]);
  });

  it("catches an option the run never reads", () => {
    const unread = { ...pmvPpdIso, options: [airSpeedControl] } satisfies RegisteredModel;
    expect(kwargsFedBy(unread, airSpeedControl)).toEqual([]);
  });
});
