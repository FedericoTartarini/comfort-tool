import type { InputId as InputIdType } from "./inputSlots";
import type { PhysicalQuantityId } from "./quantities";
import type { UnitSystem as UnitSystemType } from "./units";
import type { ResultCellViewModel } from "./output/resultSections";

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

export interface QuantityTableRowAuthoring<TResult> {
  readonly quantity: PhysicalQuantityId;
  readonly id?: string;
  readonly label?: string;
  readonly group?: string;
  readonly value?: (result: TResult) => number;
  readonly subtext?: (result: TResult) => string | undefined;
  readonly color?: (result: TResult) => string | undefined;
}

export type TableRowAuthoring<TResult> =
  | PhysicalQuantityId
  | QuantityTableRowAuthoring<TResult>
  | TableRowSpec<TResult>;

export interface ModelTablesAuthoring<TResult = unknown> {
  readonly results: readonly TableRowAuthoring<TResult>[];
  readonly timeSeries?: readonly TableRowAuthoring<TResult>[];
}

export interface ModelTables<TResult = unknown> {
  readonly results: readonly TableRowSpec<TResult>[];
  readonly timeSeries?: readonly TableRowSpec<TResult>[];
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
