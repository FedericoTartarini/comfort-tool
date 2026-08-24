import type { InputId as InputIdType } from "../inputSlots";
import type { UnitSystem as UnitSystemType } from "../units";
import type { ResultCellViewModel } from "../../state/comfortTool/types";

export const TableLayout = {
  CompareMatrix: "compare-matrix",
  MetricSummary: "metric-summary",
} as const;

export type TableLayout = (typeof TableLayout)[keyof typeof TableLayout];

export type TableCellFormatter<TResult> = (
  result: TResult,
  unitSystem: UnitSystemType,
) => ResultCellViewModel;

export interface TableRowSpec<TResult> {
  readonly id: string;
  readonly label: string;
  readonly group?: string;
  readonly format: TableCellFormatter<TResult>;
}

export interface TableDeclaration<TResult = unknown> {
  readonly layout: TableLayout;
  readonly rows: readonly TableRowSpec<TResult>[];
}

export interface MetricSummaryItemViewModel {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly subtext?: string;
  readonly group?: string;
}

export interface MetricSummaryGroupViewModel {
  readonly id: string;
  readonly title?: string;
  readonly items: readonly MetricSummaryItemViewModel[];
}

export type CompareMatrixRowViewModel = {
  title: string;
  group?: string;
  valuesByInput: Partial<Record<InputIdType, ResultCellViewModel | null>>;
};
