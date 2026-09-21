import { describe, expect, it } from "vitest";
import * as library from "jsthermalcomfort";
import { classifyFromBins, type ClassifierBins } from "jsthermalcomfort";
import { registeredModels } from "$lib/models";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { humidityMode, temperatureMode } from "./entryModes";
import { resultValue, toLibraryInputs, withEnteredValues, type SlotInputs } from "./libraryInputs";
import {
  axisRangeFor,
  dynamicChartOf,
  requireAxisRange,
  type DynamicDeclaration,
  type Range,
  type RegisteredModel,
} from "./modelDeclaration";
import { quantities, quantityFor, type Quantity } from "./quantities";

const q = quantities;

/**
 * The package's exports, by name. Reading them needs a namespace import, which
 * defeats tree-shaking, so no runtime code may do this (ADR-0002 decision 30,
 * "No runtime reverse lookup") — a test is not bundled, which is why the one
 * check that a name is really the library's lives here.
 */
const libraryExports: Record<string, unknown> = library;

describe("name", () => {
  it("is a function the package exports, for every registered model", () => {
    for (const model of registeredModels) {
      expect(typeof libraryExports[model.name], model.name).toBe("function");
    }
  });

  it("names the very model info the declaration carries, for every registered model", () => {
    for (const model of registeredModels) {
      expect(libraryExports[`${model.name.toUpperCase()}_INFO`], model.name).toBe(model.info);
    }
  });

  it("is unique across the registry, so a share link can name a model without naming its standard", () => {
    const names = registeredModels.map((model) => model.name);
    expect(new Set(names).size, names.join(", ")).toBe(names.length);
  });
});

describe("standard", () => {
  it("is one of the editions the model's library function accepts, for every registered model", () => {
    for (const model of registeredModels) {
      if (model.standard === undefined) continue;
      expect(model.info.standards, model.info.label).toContain(model.standard);
    }
  });
});

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
  // crossing: close enough that only a kernel that rounds, or bands that are
  // not the kernel's, can put the two ends in different categories.
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
 * x axis can reach. Bands that are not the kernel's own already disagree at
 * the defaults; a kernel that starts rounding its output again, which is the
 * drift decision 27 retired an older rule to allow, disagrees only within a
 * hair of an Edge, so that is where the rest of the probes go.
 */
function driftProbes(model: RegisteredModel, chart: DynamicDeclaration): SlotInputs[] {
  const slot = defaultSlot(model);
  const axis = chart.axes.x;
  const range = requireAxisRange(model, axis);
  const at = (position: number) => withEnteredValues(slot, new Map([[axis, position]]));
  const outputAt = (position: number) => Number(resultValue(model.run(toLibraryInputs(at(position), model)), chart.output));

  const probes = [slot];
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

describe("axisRangeFor", () => {
  it("returns the declared range when the model has one", () => {
    expect(axisRangeFor(pmvPpdIso, q.tdb)).toEqual({ min: 10, max: 40 });
  });

  it("falls back to the applicability bound when none is declared, but both a min and a max exist", () => {
    const noDeclaredRange = { ...pmvPpdIso, axisRanges: pmvPpdIso.axisRanges.filter((range) => range.quantity !== q.clo) };
    const bound = pmvPpdIso.info.inputs.clo?.applicability;
    expect(bound?.min).toBeDefined();
    expect(bound?.max).toBeDefined();
    expect(axisRangeFor(noDeclaredRange, q.clo)).toEqual({ min: bound?.min, max: bound?.max });
  });

  it("returns undefined when neither a declared range nor a complete applicability bound exists", () => {
    const noDeclaredRange = { ...pmvPpdIso, axisRanges: pmvPpdIso.axisRanges.filter((range) => range.quantity !== q.rh) };
    expect(axisRangeFor(noDeclaredRange, q.rh)).toBeUndefined();
  });
});

describe("requireAxisRange", () => {
  it("returns the same range as axisRangeFor when one exists", () => {
    expect(requireAxisRange(pmvPpdIso, q.tdb)).toEqual(axisRangeFor(pmvPpdIso, q.tdb));
  });

  it("throws naming the model and the quantity when no range can be found", () => {
    const noDeclaredRange = { ...pmvPpdIso, axisRanges: pmvPpdIso.axisRanges.filter((range) => range.quantity !== q.rh) };
    expect(() => requireAxisRange(noDeclaredRange, q.rh)).toThrow(
      `${pmvPpdIso.info.label} declares no axis range for ${q.rh.label}, so it cannot carry an axis`,
    );
  });
});
