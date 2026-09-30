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
 * The number of the formatter's precision nearest `value` and not above it:
 * `value` itself where it has no more decimals than the formatter keeps
 * (`0.7 → 0.7`), else the step below (`1.934… → 1.93`, `1.875 → 1.87`).
 */
export function shownAtMost(value: number): number {
  const steps = Math.round(value * STEPS_PER_UNIT);
  return (steps / STEPS_PER_UNIT > value ? steps - 1 : steps) / STEPS_PER_UNIT;
}

/** The number of the formatter's precision nearest `value` and not below it, as {@link shownAtMost} from the other side. */
export function shownAtLeast(value: number): number {
  const steps = Math.round(value * STEPS_PER_UNIT);
  return (steps / STEPS_PER_UNIT < value ? steps + 1 : steps) / STEPS_PER_UNIT;
}
