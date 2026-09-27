import { describe, expect, it } from "vitest";
import { dynamicChartOf, type RegisteredModel } from "$lib/core/modelDeclaration";
import { valuesReader } from "$lib/core/libraryInputs";
import { quantities, type Quantity } from "$lib/core/quantities";
import { heatIndexRothfusz } from "./heatIndexRothfusz";

const q = quantities;

// The declaration's own rules, as issue #21's testing decisions ask: no number
// the library computes is asserted here. Heat Index is the app's only
// standard-less model (#21 story 17), so its registry behaviour is checked too.

const defaults = new Map<Quantity, number>(heatIndexRothfusz.inputs.map(({ quantity, value }) => [quantity, value]));

describe("heatIndexRothfusz declaration", () => {
  it("returns the quantities of its own table from run", () => {
    const result = heatIndexRothfusz.run(valuesReader(defaults));
    for (const quantity of heatIndexRothfusz.table) {
      expect(result).toHaveProperty(quantity.key);
    }
  });

  it("takes dry-bulb temperature and humidity, and nothing else", () => {
    expect(heatIndexRothfusz.inputs.map((input) => input.quantity)).toEqual([q.tdb, q.rh]);
  });

  it("declares no standard, so it has no Standard page", () => {
    const registered: RegisteredModel = heatIndexRothfusz;
    expect(registered.standard).toBeUndefined();
  });

  it("does not use relative air speed, having no air speed to raise", () => {
    expect(heatIndexRothfusz.relativeAirSpeed).toBe(false);
    expect(heatIndexRothfusz.inputs.map((input) => input.quantity)).not.toContain(q.v);
  });

  it("declares an axis range for both inputs, since the applicability fallback answers for neither", () => {
    for (const { quantity } of heatIndexRothfusz.inputs) {
      expect(heatIndexRothfusz.axisRanges.some((axis) => axis.quantity === quantity), quantity.label).toBe(true);
    }
  });

  it("puts every default inside its declared axis range", () => {
    for (const { quantity, value } of heatIndexRothfusz.inputs) {
      const range = heatIndexRothfusz.axisRanges.find((axis) => axis.quantity === quantity);
      expect(range, quantity.label).toBeDefined();
      expect(value).toBeGreaterThanOrEqual(range?.min ?? Infinity);
      expect(value).toBeLessThanOrEqual(range?.max ?? -Infinity);
    }
  });

  it("declares a dynamic chart whose axes are its two inputs, both ranged", () => {
    const dynamic = dynamicChartOf(heatIndexRothfusz);
    expect(dynamic).toBeDefined();
    expect([dynamic?.axes.x, dynamic?.axes.y]).toEqual([q.tdb, q.rh]);
  });

  it("scans an output its own table carries", () => {
    const dynamic = dynamicChartOf(heatIndexRothfusz);
    expect(heatIndexRothfusz.table).toContain(dynamic?.output);
  });
});