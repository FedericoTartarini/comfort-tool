/**
 * The only number formatter in the app (ADR §4.6): at most two decimals,
 * trailing zeros stripped (`26.0 → "26"`, `78.80 → "78.8"`). Non-finite
 * values format as an empty string; the caller decides what to show instead.
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  const rounded = Math.round(value * 100) / 100;
  // `rounded === 0` is also true for -0, which would otherwise print "-0".
  return String(rounded === 0 ? 0 : rounded);
}
