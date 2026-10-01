import { describe, expect, it } from "vitest";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { registeredModels } from "$lib/models";
import { page, pagesOf } from "./page";

describe("pagesOf", () => {
  it("gives every registered model Explore, Standard to a model with a standard, and Time-series to none", () => {
    for (const model of registeredModels) {
      const expected = model.standard === undefined ? [page.explore] : [page.standard, page.explore];
      expect(pagesOf(model), model.info.label).toEqual(expected);
    }
  });

  it("gives a declaration that writes `timeSeries: true` Time-series, after its other pages", () => {
    const fixture = { ...heatIndexRothfusz, timeSeries: true } as const;
    expect(pagesOf(fixture)).toEqual([page.explore, page.timeSeries]);
  });
});
