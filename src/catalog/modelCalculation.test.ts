import { describe, expectTypeOf, it } from "vitest";

import type { ModelCalculationContext } from "./modelCalculation";

describe("ModelCalculationContext", () => {
  it("exposes quantity bags and model options", () => {
    expectTypeOf<keyof ModelCalculationContext>().toEqualTypeOf<
      "effectiveQuantitiesByInput"
      | "options"
    >();
  });
});
