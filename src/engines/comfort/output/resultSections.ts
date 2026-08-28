import type { InputId as InputIdType } from "../../../catalog/inputSlots";
import type { ResultCellViewModel, ResultSectionViewModel } from "../../../catalog/resultSections";

export function buildResultSection<T>(
  title: string,
  resultsByInput: Record<InputIdType, T | null>,
  visibleInputIds: InputIdType[],
  formatter: (result: T) => ResultCellViewModel,
  group?: string,
): ResultSectionViewModel {
  return {
    title,
    group,
    valuesByInput: visibleInputIds.reduce((acc, inputId) => {
      const result = resultsByInput[inputId];
      acc[inputId] = result !== null ? formatter(result) : null;
      return acc;
    }, {} as Record<InputIdType, ResultCellViewModel | null>),
  };
}
