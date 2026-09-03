import type { InputId as InputIdType } from "./inputSlots";
import type { PhysicalQuantityId, QuantityState } from "./quantities";
import type { UnitSystem as UnitSystemType } from "./units";
import type { ResultCellViewModel } from "./resultSections";

/** Optional per-slot context for custom Compare rows (Adaptive inputs, PHS extras). */
export interface TableCellContext {
  readonly input?: QuantityState;
  readonly extras?: unknown;
}

export type TableCellFormatter = (
  result: QuantityState,
  unitSystem: UnitSystemType,
  context?: TableCellContext,
) => ResultCellViewModel;

export interface TableRowSpec {
  readonly id: string;
  readonly label: string;
  readonly group?: string;
  readonly format: TableCellFormatter;
}

export interface QuantityTableRowAuthoring {
  readonly quantity: PhysicalQuantityId;
  readonly id?: string;
  readonly label?: string;
  readonly group?: string;
  readonly value?: (result: QuantityState, context?: TableCellContext) => number;
  readonly subtext?: (result: QuantityState, context?: TableCellContext) => string | undefined;
  readonly color?: (result: QuantityState, context?: TableCellContext) => string | undefined;
}

export type TableRowAuthoring =
  | PhysicalQuantityId
  | QuantityTableRowAuthoring
  | TableRowSpec;

export interface ModelTablesAuthoring {
  readonly results: readonly TableRowAuthoring[];
}

export interface ModelTables {
  readonly results: readonly TableRowSpec[];
}

export interface TableBuildContext {
  readonly quantitiesByInput?: Partial<Record<InputIdType, QuantityState>>;
  readonly extrasByInput?: Partial<Record<InputIdType, unknown>>;
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
