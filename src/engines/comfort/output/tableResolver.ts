import type { InputId as InputIdType } from "../../../catalog/inputSlots";
import type { QuantityState } from "../../../catalog/quantities";
import type { UnitSystem as UnitSystemType } from "../../../catalog/units";
import type {
  CompareMatrixRowViewModel,
  MetricSummaryGroupViewModel,
  MetricSummaryItemViewModel,
  TableBuildContext,
  TableRowSpec,
} from "../../../catalog/tableTypes";
import type { ResultSectionViewModel } from "../../../catalog/resultSections";
import { buildResultSection } from "./resultSections";

export function buildCompareMatrixTable(
  rows: readonly TableRowSpec[],
  valuesByInput: Record<InputIdType, QuantityState | null>,
  visibleInputIds: InputIdType[],
  unitSystem: UnitSystemType,
  tableContext?: TableBuildContext,
): ResultSectionViewModel[] {
  return rows.map((row) => (
    buildResultSection(
      row.label,
      valuesByInput,
      visibleInputIds,
      (result, inputId) => row.format(result, unitSystem, {
        input: tableContext?.quantitiesByInput?.[inputId],
        extras: tableContext?.extrasByInput?.[inputId],
      }),
      row.group,
    )
  ));
}

export function buildMetricSummaryTable(
  rows: readonly TableRowSpec[],
  result: QuantityState,
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
