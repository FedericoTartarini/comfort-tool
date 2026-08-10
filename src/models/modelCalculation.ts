import type { CanonicalInputState } from "./fieldKeys";
import type { ModelOptionsRecord } from "./inputModes";
import type { InputId as InputIdType } from "./inputSlots";

/** Canonical-SI data exposed to a comfort model during calculation. */
export interface ModelCalculationContext {
  readonly inputsByInput: Readonly<
    Record<InputIdType, Readonly<CanonicalInputState>>
  >;
  readonly options: Readonly<ModelOptionsRecord>;
}
