import type { Bound } from "jsthermalcomfort";
import type { DisplayUnit } from "./units";

/** The steps the formatter keeps of one unit: two decimals. */
const STEPS_PER_UNIT = 100;

/**
 * The only number formatter in the app (ADR §4.6): at most two decimals,
 * trailing zeros stripped (`26.0 → "26"`, `78.80 → "78.8"`). Non-finite
 * values format as an empty string; the caller decides what to show instead.
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  const rounded = Math.round(value * STEPS_PER_UNIT) / STEPS_PER_UNIT;
  // `rounded === 0` is also true for -0, which would otherwise print "-0".
  return String(rounded === 0 ? 0 : rounded);
}

/**
 * Whether the SI `value` lies beyond the SI `bound` as a row would show both
 * in `unit` (ADR-0002 decision 56): each is rounded to the formatter's steps
 * in `unit`, and the steps are compared. A difference no row shows is not
 * beyond: under a maximum of 1.875, which reads 1.88, so do 1.8751 and 1.88.
 * The one comparison the gate and the run's violation rows make, called with
 * the quantity's SI display unit.
 */
export function isShownBeyond(value: number, bound: Bound, unit: DisplayUnit): boolean {
  const steps = shownSteps(value, unit);
  return (
    (bound.min !== undefined && steps < shownSteps(bound.min, unit)) || (bound.max !== undefined && steps > shownSteps(bound.max, unit))
  );
}

/** The SI `value` in `unit`, as the whole number of the formatter's steps a row shows. */
function shownSteps(value: number, unit: DisplayUnit): number {
  return Math.round(unit.fromSi(value) * STEPS_PER_UNIT);
}
