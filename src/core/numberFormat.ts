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
 * The number a row would show for the SI `value`, in `unit`, under `bound`
 * (ADR-0002 decision 55), answered in SI: the nearest number of the
 * formatter's precision in `unit`. Where `value` is inside `bound` and the
 * nearest is not, the neighbour inside (`1.875 → 1.87` under a maximum of
 * 1.875); where `value` itself is outside, the nearest, which the gate then
 * marks. Inside is judged in `unit`, where the number is rounded: 27 °C is
 * 80.6 °F there, and a hair under 27 once 80.6 °F is converted back.
 */
export function shownNumber(value: number, unit: DisplayUnit, bound: Bound = {}): number {
  const displayed = unit.fromSi(value);
  const min = bound.min !== undefined ? unit.fromSi(bound.min) : -Infinity;
  const max = bound.max !== undefined ? unit.fromSi(bound.max) : Infinity;
  // `+ 0` turns the -0 a small negative rounds to into 0, as `formatNumber` prints it.
  let steps = Math.round(displayed * STEPS_PER_UNIT) + 0;
  if (displayed >= min && displayed <= max) {
    if (steps / STEPS_PER_UNIT > max) {
      steps -= 1;
    } else if (steps / STEPS_PER_UNIT < min) {
      steps += 1;
    }
  }
  return unit.toSi(steps / STEPS_PER_UNIT);
}
