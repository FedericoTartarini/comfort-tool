import type { InputId as InputIdType } from "../../../catalog/inputSlots";
import type { QuantityState } from "../../../catalog/quantities";
import type { ResultCellViewModel, ResultSectionViewModel } from "../../../catalog/resultSections";

export function buildResultSection(
  title: string,
  valuesByInput: Record<InputIdType, QuantityState | null>,
  visibleInputIds: InputIdType[],
  formatter: (result: QuantityState, inputId: InputIdType) => ResultCellViewModel,
  group?: string,
): ResultSectionViewModel {
  return {
    title,
    group,
    valuesByInput: visibleInputIds.reduce((acc, inputId) => {
      const result = valuesByInput[inputId];
      acc[inputId] = result !== null ? formatter(result, inputId) : null;
      return acc;
    }, {} as Record<InputIdType, ResultCellViewModel | null>),
  };
}
