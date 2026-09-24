import type { InputId as InputIdType } from "./inputSlots";

export type CompareInputMap<T> = Partial<Record<InputIdType, T>>;

/** Shared calculation-derived input payload used by model chart builders. */
/** Base chart source: per-input calculation payloads. Extend with extra per-input maps when needed. */
export interface ModelChartSource<TRequest> {
  inputs: CompareInputMap<TRequest>;
}

/** PHS/Adaptive Compare extras live on chartSource, not in QuantityState. */
export function extrasByInputFromChartSource(
  chartSource: unknown,
): Partial<Record<InputIdType, unknown>> | undefined {
  if (
    chartSource === null
    || typeof chartSource !== "object"
    || !("extrasByInput" in chartSource)
  ) {
    return undefined;
  }
  const extras = (chartSource as { extrasByInput?: unknown }).extrasByInput;
  if (extras === null || typeof extras !== "object") {
    return undefined;
  }
  return extras as Partial<Record<InputIdType, unknown>>;
}
