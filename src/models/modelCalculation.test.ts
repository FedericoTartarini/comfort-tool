import { describe, expectTypeOf, it } from "vitest";

import type { ModelCalculationContext } from "./modelCalculation";

describe("ModelCalculationContext", () => {
  it("exposes only canonical inputs and model options", () => {
    expectTypeOf<keyof ModelCalculationContext>().toEqualTypeOf<
      "inputsByInput" | "options"
    >();
  });
});
