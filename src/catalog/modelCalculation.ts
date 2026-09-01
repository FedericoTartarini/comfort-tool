import type { InputId as InputIdType } from "./inputSlots";
import type { ModelOptionsRecord } from "./inputModes";
import type { QuantityState } from "./quantities";

/** Canonical-SI data exposed to a comfort model during calculation. */
export interface ModelCalculationContext {
  readonly effectiveQuantitiesByInput: Readonly<
    Record<InputIdType, Readonly<QuantityState>>
  >;
  readonly options: Readonly<ModelOptionsRecord>;
}

export function createModelCalculationContext(
  context: ModelCalculationContext,
): ModelCalculationContext {
  return context;
}
