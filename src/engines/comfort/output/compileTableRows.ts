import type { ResultCellViewModel } from "../../../catalog/resultSections";
import {
  getPhysicalQuantityMeta,
  isPhysicalQuantityId,
  type PhysicalQuantityId,
} from "../../../catalog/quantities";
import type {
  ModelTables,
  ModelTablesAuthoring,
  QuantityTableRowAuthoring,
  TableRowAuthoring,
  TableRowSpec,
} from "../../../catalog/tableTypes";
import type { UnitSystem as UnitSystemType } from "../../../catalog/units";
import {
  convertQuantityFromSi,
  formatDisplayValue,
  getQuantityDisplayMeta,
} from "../../units";

function isCustomTableRow<TResult>(
  row: Exclude<TableRowAuthoring<TResult>, PhysicalQuantityId>,
): row is TableRowSpec<TResult> {
  return "format" in row && typeof row.format === "function";
}

function isQuantityTableRow<TResult>(
  row: Exclude<TableRowAuthoring<TResult>, PhysicalQuantityId>,
): row is QuantityTableRowAuthoring<TResult> {
  return "quantity" in row;
}

function readQuantitySi<TResult>(
  result: TResult,
  quantity: PhysicalQuantityId,
  value?: (result: TResult) => number,
): number {
  if (value) {
    return value(result);
  }
  if (result !== null && typeof result === "object" && quantity in result) {
    const raw = (result as Record<string, unknown>)[quantity];
    if (typeof raw === "number") {
      return raw;
    }
  }
  throw new Error(
    `Result has no SI value for "${quantity}". Pass value: (result) => ...`,
  );
}

export function formatQuantityTableText(
  quantityId: PhysicalQuantityId,
  valueSi: number,
  unitSystem: UnitSystemType,
): string {
  const display = convertQuantityFromSi(quantityId, valueSi, unitSystem);
  const units = getQuantityDisplayMeta(quantityId, unitSystem).displayUnits;
  const formatted = formatDisplayValue(display);
  if (!units) {
    return formatted;
  }
  if (units === "%") {
    return `${formatted}%`;
  }
  return `${formatted} ${units}`;
}

function compileQuantityRow<TResult>(
  row: QuantityTableRowAuthoring<TResult>,
): TableRowSpec<TResult> {
  if (!isPhysicalQuantityId(row.quantity)) {
    throw new Error(`Unknown quantity id "${String(row.quantity)}" in table row.`);
  }
  const meta = getPhysicalQuantityMeta(row.quantity);
  return {
    id: row.id ?? row.quantity,
    label: row.label ?? meta.label,
    ...(row.group ? { group: row.group } : {}),
    format: (result, unitSystem) => {
      const cell: ResultCellViewModel = {
        text: formatQuantityTableText(
          row.quantity,
          readQuantitySi(result, row.quantity, row.value),
          unitSystem,
        ),
      };
      const subtext = row.subtext?.(result);
      if (subtext !== undefined && subtext !== "") {
        cell.subtext = subtext;
      }
      const color = row.color?.(result);
      if (color !== undefined && color !== "") {
        cell.color = color;
      }
      return cell;
    },
  };
}

export function compileTableRow<TResult>(
  row: TableRowAuthoring<TResult>,
): TableRowSpec<TResult> {
  if (typeof row === "string") {
    if (!isPhysicalQuantityId(row)) {
      throw new Error(`Unknown quantity id "${row}" in table row.`);
    }
    return compileQuantityRow({ quantity: row });
  }
  if (isCustomTableRow(row)) {
    return row;
  }
  if (isQuantityTableRow(row)) {
    return compileQuantityRow(row);
  }
  throw new Error(
    "Table row must be a quantity id, { quantity }, or { id, label, format }.",
  );
}

export function compileModelTables<TResult>(
  tables: ModelTablesAuthoring<TResult>,
): ModelTables<TResult> {
  return {
    results: tables.results.map(compileTableRow),
    ...(tables.timeSeries
      ? { timeSeries: tables.timeSeries.map(compileTableRow) }
      : {}),
  };
}
