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
 * The one comparison the gate, the run's violation rows and the range text
 * make, called with the quantity's SI display unit.
 */
export function isShownBeyond(value: number, bound: Bound, unit: DisplayUnit): boolean {
  const steps = shownSteps(value, unit);
  return (
    (bound.min !== undefined && steps < shownSteps(bound.min, unit)) || (bound.max !== undefined && steps > shownSteps(bound.max, unit))
  );
}

/** The direction of one shown step into a bound, from each of its ends. */
const inwardStep = { min: 1, max: -1 } as const;

/**
 * The SI `end` of a bound, the `side` it is, written in `unit` as a range
 * shows it (ADR-0002 decision 56, rule 3): nearest, as any number is, unless
 * that number typed back would be stopped by {@link isShownBeyond} in
 * `judgedIn`, the quantity's SI display unit; then one shown step inward.
 * Only a `unit` whose step is coarser than `judgedIn`'s moves an end a row
 * shows as it is ("≤ 0.79 inHg" for 2700 Pa, whose nearest 0.8 is 2709 Pa,
 * 2.71 kPa); one step suffices, since it crosses the end.
 */
export function formatBoundEnd(end: number, side: keyof typeof inwardStep, unit: DisplayUnit, judgedIn: DisplayUnit): string {
  const nearest = shownSteps(end, unit);
  const typedBack = unit.toSi(nearest / STEPS_PER_UNIT);
  const steps = isShownBeyond(typedBack, { [side]: end }, judgedIn) ? nearest + inwardStep[side] : nearest;
  return formatNumber(steps / STEPS_PER_UNIT);
}

/** The SI `value` in `unit`, as the whole number of the formatter's steps a row shows. */
function shownSteps(value: number, unit: DisplayUnit): number {
  return Math.round(unit.fromSi(value) * STEPS_PER_UNIT);
}
