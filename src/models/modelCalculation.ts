import type { ComfortModel as ComfortModelType } from "./comfortModels";
import type { FieldKey as FieldKeyType } from "./fieldKeys";
import type { ModelOptionsRecord } from "./inputModes";
import type { InputId as InputIdType } from "./inputSlots";

/** Canonical-SI data exposed to a comfort model during calculation. */
export interface ModelCalculationContext {
  readonly inputsByInput: Readonly<
    Record<InputIdType, Readonly<Record<FieldKeyType, number>>>
  >;
  readonly modelOptionsByModel: Readonly<
    Record<ComfortModelType, Readonly<ModelOptionsRecord>>
  >;
}
