/**
 * A slot's scan: the grid every scanned chart sweeps, the frame a chart's
 * slots share and the field a slot's scan gives, read cell by cell off the
 * model's own runs.
 */
import type { Range, RegisteredModel } from "$lib/core/modelDeclaration";
import { resultNumber, resultWarnings, runOn } from "$lib/core/modelRun";
import type { Quantity } from "$lib/core/quantities";
import { withEnteredValues, withEntryModes, type Slot, type ValueEntryModes } from "$lib/core/slot";
import { samples } from "./specParts";

/**
 * One count for every axis, every model and both scanned charts: 51 points are
 * 50 intervals, so the SI steps are round (ADR-0002 decision 28).
 */
export const GRID = 51;

/** A quantity a scan sweeps, and the range, in SI, it is swept across. */
export interface Sweep {
  readonly quantity: Quantity;
  readonly range: Range;
}

/**
 * What every slot's scan on one chart shares (ADR-0002 decision 61): the
 * model and the output it scans, the two quantities swept, the entry modes
 * the slot is converted into, and the atmospheric pressure. A slot's scan is
 * a function of this and the slot alone, so the outputs can keep one per slot
 * and an edit to one slot scans that slot and no other
 * (`state/compute.svelte.ts`). Each chart builds its own frame; the scan is
 * the same for both.
 */
export interface ScanFrame {
  readonly model: RegisteredModel;
  readonly output: Quantity;
  readonly x: Sweep;
  readonly y: Sweep;
  readonly entryModes: ValueEntryModes;
  readonly atmosphericPressure: number;
}

/**
 * One slot's scan, two facts per cell of the `GRID × GRID` field, each
 * `[yIndex][xIndex]` and both read off the cell's one run.
 */
export interface ScannedField {
  /** The model's own number for the frame's output, in the output's SI unit. */
  readonly values: readonly (readonly number[])[];
  /**
   * Whether the run broke a bound the library checks it against: any row of
   * its `warnings`, a swept value out of range or a derived one a violation
   * (ADR-0002 decision 77, rule 1). Only the Comfort zones read it.
   */
  readonly outsideApplicability: readonly (readonly boolean[])[];
}

/**
 * `slot` scanned in `frame`: converted into the frame's entry modes first, by
 * the entry-mode change's own conversion, so a slot entered in another mode
 * is swept on the quantities it would hold after that change; then each cell
 * entered over the two swept quantities, as the person enters a value, and
 * the model run. A swept humidity quantity puts the cell in that humidity's
 * entry mode, so the slot's own conversion gives the cell its relative
 * humidity and the scan converts nothing itself. Every cell is run once: one
 * the model has no number for is `NaN`.
 */
export function scannedField(frame: ScanFrame, slot: Slot): ScannedField {
  const { model, output, x, y, atmosphericPressure } = frame;
  const converted = withEntryModes(slot, frame.entryModes, model);
  const xValues = samples(x.range, GRID);
  const results = samples(y.range, GRID).map((yValue) =>
    xValues.map((xValue) => {
      const cell = withEnteredValues(converted, new Map([
        [x.quantity, xValue],
        [y.quantity, yValue],
      ]));
      return runOn(cell, model, atmosphericPressure);
    }),
  );
  return {
    values: results.map((row) => row.map((result) => resultNumber(result, output))),
    outsideApplicability: results.map((row) => row.map((result) => resultWarnings(model, result).length > 0)),
  };
}
