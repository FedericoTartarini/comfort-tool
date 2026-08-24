import type { InputId as InputIdType } from "../../../models/inputSlots";
import type { UnitSystem as UnitSystemType } from "../../../models/units";
import type {
  CompareMatrixRowViewModel,
  MetricSummaryGroupViewModel,
  MetricSummaryItemViewModel,
  TableDeclaration,
} from "../../../models/output/tableLayouts";
import type { ResultSectionViewModel } from "../../../models/output/resultSections";
import { buildResultSection } from "./resultSections";

export function buildCompareMatrixTable<TResult>(
  declaration: TableDeclaration<TResult>,
  resultsByInput: Record<InputIdType, TResult | null>,
  visibleInputIds: InputIdType[],
  unitSystem: UnitSystemType,
): ResultSectionViewModel[] {
  return declaration.rows.map((row) => (
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
  declaration: TableDeclaration<TResult>,
  result: TResult,
  unitSystem: UnitSystemType,
  groupId = "default",
): MetricSummaryGroupViewModel {
  const items: MetricSummaryItemViewModel[] = declaration.rows.map((row) => {
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
