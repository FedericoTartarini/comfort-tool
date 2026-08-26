import type { InputId as InputIdType } from "./inputSlots";
import type { ModelOptionsRecord } from "./inputModes";
import type {
  AuxiliaryInputState,
  PhysicalQuantityId,
  PrimaryInputState,
} from "./quantities";

/** Canonical-SI data exposed to a comfort model during calculation. */
export interface ModelCalculationContext {
  readonly effectiveQuantitiesByInput: Readonly<
    Record<InputIdType, Readonly<PrimaryInputState>>
  >;
  readonly auxiliaryQuantitiesByInput: Readonly<
    Record<InputIdType, Readonly<AuxiliaryInputState>>
  >;
  readonly modelInputs: Readonly<Partial<Record<PhysicalQuantityId, number>>>;
  readonly options: Readonly<ModelOptionsRecord>;
}

export function createModelCalculationContext(
  context: ModelCalculationContext,
): ModelCalculationContext {
  return context;
}
