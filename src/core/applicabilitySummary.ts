/**
 * What qualifies a slot's result, as the person reads it above the Results
 * table: the applicability summary (ADR-0002 decision 83, rule 2). Its "Not
 * calculated" part, present while the slot's gate is closed, names each entry
 * out of range with its bound, then the atmospheric pressure when it is out of
 * range, then whether the numbers below are the last valid ones or there are
 * none. Its "Calculated, but outside these limits:" part names each bound the
 * result shown broke, a kept result's too. Every sentence is
 * `core/applicability.ts`'s {@link boundSentence}, so a line says what its
 * row's bound says (rule 4).
 */
import { copy } from "$lib/text/copy";
import { boundSentence, warningFor, type OutOfRangeRow, type ViolationRow } from "./applicability";
import type { Quantity } from "./quantities";
import type { UnitSystem } from "./unitSystem";

/**
 * One sentence of a summary, with the quantity whose entry on the panel it is
 * about, or `null` for none: the atmospheric pressure, which is no row on the
 * panel (decision 83, rule 4), a quantity the run derives or outputs, and a
 * line about the result.
 */
export interface SummaryLine {
  readonly text: string;
  readonly quantity: Quantity | null;
}

/** One slot's applicability summary, each part empty when it has nothing to say. */
export interface ApplicabilitySummary {
  readonly notCalculated: readonly SummaryLine[];
  readonly outsideLimits: readonly SummaryLine[];
}

/** The quantity whose entry a line leads to: `quantity`, while the `panel` has a row for it. */
function entryOnPanel(quantity: Quantity, panel: readonly Quantity[]): Quantity | null {
  return panel.includes(quantity) ? quantity : null;
}

/**
 * The "Not calculated" part for the rows the gate stops, the atmospheric
 * pressure's among them: a line per row, those on the `panel` in its order,
 * then the rest, as the pressure, in theirs; then the line on the result,
 * which says the last valid one is shown where `keepsResult`. Empty when no
 * row is stopped.
 */
export function notCalculatedLines(
  rows: readonly OutOfRangeRow[],
  panel: readonly Quantity[],
  keepsResult: boolean,
  unitSystem: UnitSystem,
): SummaryLine[] {
  if (rows.length === 0) {
    return [];
  }
  const rank = (row: OutOfRangeRow) => {
    const index = panel.indexOf(row.quantity);
    return index === -1 ? panel.length : index;
  };
  const entries = [...rows]
    .sort((a, b) => rank(a) - rank(b))
    .map((row) => ({
      text: boundSentence(row.quantity, row.bound, unitSystem),
      quantity: entryOnPanel(row.quantity, panel),
    }));
  const result = keepsResult ? copy.notCalculatedKeptResult : copy.notCalculatedNoResult;
  return [...entries, { text: result, quantity: null }];
}

/**
 * The "Calculated, but outside these limits:" part for the violation `rows`
 * of the result shown, of every role, in their order: a line per row, leading
 * to the row it is reported on while the `panel` has one.
 */
export function outsideLimitsLines(
  rows: readonly ViolationRow[],
  panel: readonly Quantity[],
  unitSystem: UnitSystem,
): SummaryLine[] {
  return rows.map((row) => ({ text: warningFor(row, unitSystem), quantity: entryOnPanel(row.quantity, panel) }));
}
