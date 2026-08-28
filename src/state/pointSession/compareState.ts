import {
  InputId,
  inputOrder,
  type InputId as InputIdType,
} from "../../catalog/inputSlots";

export function normalizeCompareInputIds(
  inputIds: InputIdType[],
): InputIdType[] {
  return inputOrder.filter(
    (inputId) => inputId === InputId.Input1 || inputIds.includes(inputId),
  );
}
