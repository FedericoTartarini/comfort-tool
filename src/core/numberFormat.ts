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

/**
 * The number a row would show for the SI `value`, in `unit`, under `bound`
 * (ADR-0002 decision 55), answered in SI: the nearest number of the
 * formatter's precision in `unit`. Where `value` is inside `bound` and the
 * nearest is not, the neighbour inside (`1.875 → 1.87` under a maximum of
 * 1.875); where `value` itself is outside, the nearest, which the gate then
 * marks. Inside is judged in SI, on the number a slot would hold, as the gate
 * judges it: 80.6 °F is a hair under 27 °C, so a minimum of 27 °C gives 80.61 °F.
 */
export function shownNumber(value: number, unit: DisplayUnit, bound: Bound = {}): number {
  // `+ 0` turns the -0 a small negative rounds to into 0, as `formatNumber` prints it.
  const steps = Math.round(unit.fromSi(value) * STEPS_PER_UNIT) + 0;
  const nearest = unit.toSi(steps / STEPS_PER_UNIT);
  if (isAbove(value, bound) || isBelow(value, bound)) {
    return nearest;
  }
  if (isAbove(nearest, bound)) {
    return unit.toSi((steps - 1) / STEPS_PER_UNIT);
  }
  return isBelow(nearest, bound) ? unit.toSi((steps + 1) / STEPS_PER_UNIT) : nearest;
}

function isAbove(value: number, bound: Bound): boolean {
  return bound.max !== undefined && value > bound.max;
}

function isBelow(value: number, bound: Bound): boolean {
  return bound.min !== undefined && value < bound.min;
}
