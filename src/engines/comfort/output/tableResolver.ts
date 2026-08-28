import type { InputId as InputIdType } from "../../../catalog/inputSlots";
import type { UnitSystem as UnitSystemType } from "../../../catalog/units";
import type {
  CompareMatrixRowViewModel,
  MetricSummaryGroupViewModel,
  MetricSummaryItemViewModel,
  TableRowSpec,
} from "../../../catalog/tableTypes";
import type { ResultSectionViewModel } from "../../../catalog/resultSections";
import { buildResultSection } from "./resultSections";

export function buildCompareMatrixTable<TResult>(
  rows: readonly TableRowSpec<TResult>[],
  resultsByInput: Record<InputIdType, TResult | null>,
  visibleInputIds: InputIdType[],
  unitSystem: UnitSystemType,
): ResultSectionViewModel[] {
  return rows.map((row) => (
    buildResultSection(
      row.label,
      resultsByInput,
      visibleInputIds,
      (result) => row.format(result, unitSystem),
      row.group,
    )
  ));
}

export function buildMetricSummaryTable<TResult>(
  rows: readonly TableRowSpec<TResult>[],
  result: TResult,
  unitSystem: UnitSystemType,
  groupId = "default",
): MetricSummaryGroupViewModel {
  const items: MetricSummaryItemViewModel[] = rows.map((row) => {
    const cell = row.format(result, unitSystem);
    return {
      id: row.id,
      label: row.label,
      value: cell.text,
      ...(cell.subtext ? { subtext: cell.subtext } : {}),
      ...(row.group ? { group: row.group } : {}),
    };
  });
  return { id: groupId, items };
}


export type { CompareMatrixRowViewModel };
