import type { InputId as InputIdType } from "./inputSlots";

export type CompareInputMap<T> = Partial<Record<InputIdType, T>>;

/** Shared calculation-derived input payload used by model chart builders. */
/** Base chart source: per-input calculation payloads. Extend with extra per-input maps when needed. */
export interface ModelChartSource<TRequest> {
  inputs: CompareInputMap<TRequest>;
}
