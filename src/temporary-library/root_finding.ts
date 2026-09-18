/**
 * The two root finders the CBE Thermal Comfort Tool uses to trace a comfort
 * zone, ported verbatim in behaviour from `static/js/util.js` of
 * {@link https://github.com/CenterForTheBuiltEnvironment/comfort_tool | comfort_tool}
 * — the implementation deployed at comfort.cbe.berkeley.edu, via the fork's
 * `utilities/root_finding.ts` (rewrite plan: "port the fork's, do not rewrite
 * it").
 *
 * They are ported rather than replaced so that `pmv_psychrometric_zone` can
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
 *
 * @public
 *
 * @param a - lower end of the bracket
 * @param b - upper end of the bracket
 * @param fn - the function whose crossing of `target` is sought
 * @param epsilon - half the bracket width at which the search stops, in the units of `x`
 * @param target - the value of `fn` to solve for
 * @returns the midpoint of the final bracket, {@link NO_ROOT_FOUND} when a
 *   bracket holds no sign change, or NaN when it starts narrower than `2 * epsilon`
 *
 * @example
 * bisect(0, 10, (x) => x * x, 1e-6, 4); // ≈ 2
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

/** Keyword arguments to {@link secant}. */
export interface SecantKwargs {
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
  readonly clamp_candidates?: boolean;
  /** Iteration cap. Default `100`, the upstream value. */
  readonly max_iterations?: number;
}

/**
 * Secant method for `fn(x) = 0`.
 *
 * Ported from `util.secant`, which is root-finding only — there is no `target`
 * parameter, callers subtract it inside `fn`.
 *
 * @public
 *
 * @param a - first starting point
 * @param b - second starting point
 * @param fn - the function whose root is sought
 * @param epsilon - the residual `|fn(x)|` accepted as a root
 * @param kwargs - `clamp_candidates` (default `true`), `max_iterations` (default `100`)
 * @returns the root, or NaN when the slope vanishes or the iteration cap is hit
 *
 * @example
 * secant(-50, 50, (x) => x + 20, 0.001, { clamp_candidates: false }); // ≈ -20
 */
export function secant(
  a: number,
  b: number,
  fn: (x: number) => number,
  epsilon: number,
  kwargs: SecantKwargs = {},
): number {
  const { clamp_candidates = true, max_iterations = 100 } = kwargs;

  let f1 = fn(a);
  if (Math.abs(f1) <= epsilon) return a;
  let f2 = fn(b);
  if (Math.abs(f2) <= epsilon) return b;

  for (let i = 0; i < max_iterations; i += 1) {
    const slope = (f2 - f1) / (b - a);
    if (slope === 0) return NaN; // Prevent division by zero
    let c = b - f2 / slope;
    if (clamp_candidates) {
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
