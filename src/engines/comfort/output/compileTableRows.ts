import type { ResultCellViewModel } from "../../../catalog/resultSections";
import {
  getPhysicalQuantityMeta,
  isPhysicalQuantityId,
  type PhysicalQuantityId,
  type QuantityState,
} from "../../../catalog/quantities";
import type {
  ModelTables,
  ModelTablesAuthoring,
  QuantityTableRowAuthoring,
  TableCellContext,
  TableRowAuthoring,
  TableRowSpec,
} from "../../../catalog/tableTypes";
import { unitLabel, type UnitSystem as UnitSystemType } from "../../../catalog/units";
import {
  convertQuantityFromSi,
  formatDisplayValue,
} from "../../units";

/**
 * Compare rows read QuantityState. PHS is the exception: custom `format`
 * may also read `context.extras` (valid/issues/samples/dLim*) from
 * chartSource.extrasByInput. Thin models must not copy that pattern.
 */

function isCustomTableRow(
  row: Exclude<TableRowAuthoring, PhysicalQuantityId>,
): row is TableRowSpec {
  return "format" in row && typeof row.format === "function";
}

function isQuantityTableRow(
  row: Exclude<TableRowAuthoring, PhysicalQuantityId>,
): row is QuantityTableRowAuthoring {
  return "quantity" in row;
}

function readQuantitySi(
  result: QuantityState,
  quantity: PhysicalQuantityId,
  value?: (result: QuantityState, context?: TableCellContext) => number,
  context?: TableCellContext,
): number {
  if (value) {
    return value(result, context);
  }
  const raw = result[quantity];
  if (typeof raw === "number") {
    return raw;
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
  const meta = getPhysicalQuantityMeta(quantityId);
  const units = unitLabel(meta.siUnit, unitSystem);
  const formatted = formatDisplayValue(display);
  if (!units) {
    return formatted;
  }
  if (units === "%") {
    return `${formatted}%`;
  }
  return `${formatted} ${units}`;
}

function compileQuantityRow(
  row: QuantityTableRowAuthoring,
): TableRowSpec {
  if (!isPhysicalQuantityId(row.quantity)) {
    throw new Error(`Unknown quantity id "${String(row.quantity)}" in table row.`);
  }
  const meta = getPhysicalQuantityMeta(row.quantity);
  return {
    id: row.id ?? row.quantity,
    label: row.label ?? meta.label,
    ...(row.group ? { group: row.group } : {}),
    format: (result, unitSystem, context) => {
      const cell: ResultCellViewModel = {
        text: formatQuantityTableText(
          row.quantity,
          readQuantitySi(result, row.quantity, row.value, context),
          unitSystem,
        ),
      };
      const subtext = row.subtext?.(result, context);
      if (subtext !== undefined && subtext !== "") {
        cell.subtext = subtext;
      }
      const color = row.color?.(result, context);
      if (color !== undefined && color !== "") {
        cell.color = color;
      }
      return cell;
    },
  };
}

export function compileTableRow(
  row: TableRowAuthoring,
): TableRowSpec {
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

export function compileModelTables(
  tables: ModelTablesAuthoring,
): ModelTables {
  return {
    results: tables.results.map(compileTableRow),
  };
}
