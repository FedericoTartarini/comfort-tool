/**
 * What qualifies a slot's result, as the person reads it above the Results
 * table: the applicability summary (ADR-0002 decision 83, rule 2). Its "Not
 * calculated, outside these limits:" part, present while the slot's gate is
 * closed, names each entry out of range with its bound, then the atmospheric
 * pressure when it is out of range, and says apart from those lines whether
 * the numbers below are the last valid ones or there are none. Its
 * "Calculated, but outside these limits:" part names each bound the result
 * shown broke, a kept result's too. Every bound line is
 * `core/applicability.ts`'s {@link boundSentence}, so a line says what its
 * row's bound says.
 */
import { copy } from "$lib/text/copy";
import { boundSentence, warningFor, type OutOfRangeRow, type ViolationRow } from "./applicability";
import type { Quantity } from "./quantities";
import type { UnitSystem } from "./unitSystem";

/**
 * One sentence of a summary. An object, not its string, so a sentence two
 * slots or two rows repeat stays two lines.
 */
export interface SummaryLine {
  readonly text: string;
}

/**
 * The "Not calculated, outside these limits:" part of a slot whose gate is
 * closed: its bound lines, and the sentence on the result, which is the
 * slot's, not one of them.
 */
export interface NotCalculatedPart {
  readonly lines: readonly SummaryLine[];
  readonly result: string;
}

/** One slot's applicability summary, the first part `null` and the second empty when it has nothing to say. */
export interface ApplicabilitySummary {
  readonly notCalculated: NotCalculatedPart | null;
  readonly outsideLimits: readonly SummaryLine[];
}

/**
 * The "Not calculated, outside these limits:" part for the rows the gate
 * stops, the atmospheric pressure's among them: a line per row, those on the
 * `panel` in its order, then the rest, as the pressure, in theirs; and the
 * sentence on the result, which says the last valid one is shown where
 * `keepsResult`. `null` when no row is stopped.
 */
export function notCalculatedPart(
  rows: readonly OutOfRangeRow[],
  panel: readonly Quantity[],
  keepsResult: boolean,
  unitSystem: UnitSystem,
): NotCalculatedPart | null {
  if (rows.length === 0) {
    return null;
  }
  const rank = (row: OutOfRangeRow) => {
    const index = panel.indexOf(row.quantity);
    return index === -1 ? panel.length : index;
  };
  const lines = [...rows]
    .sort((a, b) => rank(a) - rank(b))
    .map((row) => ({ text: boundSentence(row.quantity, row.bound, unitSystem) }));
  return { lines, result: keepsResult ? copy.notCalculatedKeptResult : copy.notCalculatedNoResult };
}

/**
 * The "Calculated, but outside these limits:" part for the violation `rows`
 * of the result shown, of every role, in their order: a line per row.
 */
export function outsideLimitsLines(rows: readonly ViolationRow[], unitSystem: UnitSystem): SummaryLine[] {
  return rows.map((row) => ({ text: warningFor(row, unitSystem) }));
}
