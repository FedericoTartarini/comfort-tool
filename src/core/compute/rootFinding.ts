/**
 * The two root finders the CBE Thermal Comfort Tool uses to trace a comfort
 * zone, ported verbatim in behaviour from `static/js/util.js` of
 * {@link https://github.com/CenterForTheBuiltEnvironment/comfort_tool | comfort_tool}
 * — the implementation deployed at comfort.cbe.berkeley.edu, via the fork's
 * `utilities/root_finding.ts` (rewrite plan: "port the fork's, do not rewrite
 * it").
 *
 * They are ported rather than replaced so that {@link psychrometricZone} can
 * reproduce the published chart exactly. Both are kept faithful to the
 * original, including the parts that are wrong (see {@link secant}); the
 * corrections are opt-in.
 */

/**
 * What `bisect` returns when the bracket does not contain a sign change. The
 * upstream implementation uses this magic number rather than NaN, and callers
 * that want to reproduce its output need to see the same value.
 */
export const NO_ROOT_FOUND = -999;

/**
 * Bisection on `fn(x) = target`.
 *
 * Verbatim in behaviour from `util.bisect`, including the three `fn` calls per
 * iteration (`a` and `b` are re-evaluated every time) and the
 * {@link NO_ROOT_FOUND} sentinel.
 */
export function bisect(a: number, b: number, fn: (x: number) => number, epsilon: number, target: number): number {
  // Undefined in the original when the bracket starts narrower than 2*epsilon;
  // NaN is the honest JavaScript spelling of that.
  let midpoint = NaN;
  while (Math.abs(b - a) > 2 * epsilon) {
    midpoint = (b + a) / 2;
    const a_T = fn(a);
    const b_T = fn(b);
    const midpoint_T = fn(midpoint);
    if ((a_T - target) * (midpoint_T - target) < 0) b = midpoint;
    else if ((b_T - target) * (midpoint_T - target) < 0) a = midpoint;
    else return NO_ROOT_FOUND;
  }
  return midpoint;
}

/** Options for {@link secant}. */
export interface SecantOptions {
  /**
   * Clamp each candidate to `[0, 100]`, as `util.secant` does.
   *
   * This is a defect, not a feature: the brackets the comfort zone passes in
   * are `[-50, 50]`, so a root below 0 °C is unreachable — the iteration is
   * pinned at 0 and the secant either converges to the wrong place or runs out
   * of iterations. It is on by default because the deployed tool has it on and
   * reproducing its chart is the point.
   *
   * Default `true`.
   */
  readonly clampCandidates?: boolean;
  /** Iteration cap. Default `100`, the upstream value. */
  readonly maxIterations?: number;
}

/**
 * Secant method for `fn(x) = 0`.
 *
 * Ported from `util.secant`, which is root-finding only — there is no `target`
 * parameter, callers subtract it inside `fn`.
 *
 * Returns the root, or NaN when the slope vanishes or the iteration cap is hit.
 */
export function secant(
  a: number,
  b: number,
  fn: (x: number) => number,
  epsilon: number,
  options: SecantOptions = {},
): number {
  const clampCandidates = options.clampCandidates ?? true;
  const maxIterations = options.maxIterations ?? 100;

  let f1 = fn(a);
  if (Math.abs(f1) <= epsilon) return a;
  let f2 = fn(b);
  if (Math.abs(f2) <= epsilon) return b;

  for (let i = 0; i < maxIterations; i += 1) {
    const slope = (f2 - f1) / (b - a);
    if (slope === 0) return NaN; // Prevent division by zero
    let c = b - f2 / slope;
    if (clampCandidates) {
      if (c < 0) c = 0;
      if (c > 100) c = 100;
    }
    const f3 = fn(c);
    if (Math.abs(f3) < epsilon) return c;
    a = b;
    b = c;
    f1 = f2;
    f2 = f3;
  }
  return NaN;
}
