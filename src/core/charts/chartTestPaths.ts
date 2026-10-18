/**
 * How a test reads a drawn path: a region by whether a point lies inside a
 * filled path by the rule Plotly fills it by, so a test asserts what a person
 * sees rather than how the region was found; a chart's Comfort zones by their
 * fills and lines; a Band's fill against the interval of the scanned number it
 * should hold, and its Edge's line by the number interpolated at its vertices;
 * and a path drawn in one piece by that piece.
 */
import { chartInk } from "$lib/core/bandPalette";
import type { ChartSpec, HoverGridTrace, PathPiece, PathTrace } from "./chartSpec";

/** `spec`'s filled paths that carry a name, in drawing order. The cover above saturation has none. */
function namedFillsOf(spec: Pick<ChartSpec, "traces">): PathTrace[] {
  return spec.traces.filter((trace): trace is PathTrace => trace.kind === "path" && trace.fill !== undefined && trace.label !== undefined);
}

/** `spec`'s named fills that are no Band's, in drawing order: its Comfort zones' fills, or Adaptive's bands'. */
export function zoneFillsOf(spec: Pick<ChartSpec, "traces">): PathTrace[] {
  const bands = new Set(bandFillsOf(spec));
  return namedFillsOf(spec).filter((fill) => !bands.has(fill));
}

/** `spec`'s unfilled paths named as one of its {@link zoneFillsOf} is, in drawing order: each zone's line. */
export function zoneLinesOf(spec: Pick<ChartSpec, "traces">): PathTrace[] {
  const labels = new Set(zoneFillsOf(spec).map((fill) => fill.label));
  return spec.traces.filter((trace): trace is PathTrace => trace.kind === "path" && trace.fill === undefined && labels.has(trace.label));
}

/** `spec`'s Band fills, in drawing order: its named fills named as one of its {@link bandLinesOf} is. */
export function bandFillsOf(spec: Pick<ChartSpec, "traces">): PathTrace[] {
  const labels = new Set(bandLinesOf(spec).map((line) => line.label));
  return namedFillsOf(spec).filter((fill) => labels.has(fill.label));
}

/** `spec`'s Band Edges, in drawing order: the paths stroked in the band line. */
export function bandLinesOf(spec: Pick<ChartSpec, "traces">): PathTrace[] {
  return spec.traces.filter((trace): trace is PathTrace => trace.kind === "path" && trace.fill === undefined && trace.color === chartInk.bandLine);
}

/** `trace`'s one piece; throws if there is no trace, or it has any other number of pieces. */
export function onlyPieceOf(trace: PathTrace | undefined): PathPiece {
  if (trace?.pieces.length !== 1) {
    throw new Error(`expected a path of one piece, got ${trace ? `${trace.pieces.length} pieces` : "no path"}`);
  }
  return trace.pieces[0];
}

/**
 * Whether (`x`, `y`) lies inside `trace`'s rings by the nonzero rule: the
 * rings wind about the point a number of times other than zero, counting a
 * counter-clockwise turn as one and a clockwise turn as minus one, so a ring
 * wound opposite to the ring around it is a hole. Plotly draws a filled
 * scatter with `fill-rule: nonzero` (measured on plotly.js 4.0.0,
 * `.scratch/chart-verification/evidence/scripts-01/holes.html`). A point on
 * a ring may fall either way, so a test asks of one off it.
 */
export function isInsideFill(trace: Pick<PathTrace, "pieces">, x: number, y: number): boolean {
  let winding = 0;
  for (const ring of trace.pieces) {
    const count = ring.x.length;
    for (let index = 0; index < count; index++) {
      const next = (index + 1) % count;
      const [x1, y1, x2, y2] = [ring.x[index], ring.y[index], ring.x[next], ring.y[next]];
      /** Positive where the point lies left of the edge from (x1, y1) to (x2, y2). */
      const side = (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1);
      if (y1 <= y && y < y2 && side > 0) {
        winding += 1;
      } else if (y2 <= y && y < y1 && side < 0) {
        winding -= 1;
      }
    }
  }
  return winding !== 0;
}

/**
 * Whether each grid point (`x[i]`, `y[j]`) lies inside `trace`'s rings
 * ({@link isInsideFill}), `[j][i]`: the region a test reads at the points a
 * scan ran. A point on the grid's frame lies on any ring that runs along the
 * frame, so it is read a millionth of a step inside it.
 */
export function insideAtSamples(trace: Pick<PathTrace, "pieces">, x: readonly number[], y: readonly number[]): boolean[][] {
  const inward = (samples: readonly number[], index: number) => {
    const last = samples.length - 1;
    const nudge = 1e-6 * (samples[1] - samples[0]);
    return samples[index] + (index === 0 ? nudge : index === last ? -nudge : 0);
  };
  return y.map((_, j) => x.map((_, i) => isInsideFill(trace, inward(x, i), inward(y, j))));
}

/**
 * Every grid point of `spec`'s scan that `fill` holds ({@link insideAtSamples}),
 * `[yIndex][xIndex]`, read at the points of its hover grid, which lies over
 * the scan's grid in display units.
 */
export function regionOf(spec: Pick<ChartSpec, "traces">, fill: Pick<PathTrace, "pieces">): boolean[][] {
  const grid = hoverGridOf(spec);
  return insideAtSamples(fill, grid.x, grid.y);
}

function hoverGridOf(spec: Pick<ChartSpec, "traces">): HoverGridTrace {
  const grid = spec.traces.find((trace): trace is HoverGridTrace => trace.kind === "hoverGrid");
  if (!grid) {
    throw new Error("spec has no hover grid");
  }
  return grid;
}

/**
 * The grid points whose scanned number `values[j][i]` lies from `lower` to
 * `upper`, or below `upper` without `lower`, as a Band list reads an interval:
 * right-inclusive (`right`) closes it at `upper`, left-inclusive at `lower`.
 * A point with no number lies in none.
 */
export function heldBetween(
  values: readonly (readonly number[])[],
  { lower, upper }: { readonly lower?: number; readonly upper: number },
  right: boolean,
): boolean[][] {
  const above = (value: number) => lower === undefined || (right ? value > lower : value >= lower);
  const below = (value: number) => (right ? value <= upper : value < upper);
  return values.map((row) => row.map((value) => Number.isFinite(value) && above(value) && below(value)));
}

/**
 * The scanned number at each vertex of `line`, `values[j][i]` interpolated
 * linearly along the grid line the vertex lies on, between the samples either
 * side of it: where the drawn line says the number crosses. Read over `spec`'s
 * hover grid, which lies over the scan's grid in display units.
 */
export function numbersAlong(spec: Pick<ChartSpec, "traces">, line: Pick<PathTrace, "pieces">, values: readonly (readonly number[])[]): number[] {
  const { x, y } = hoverGridOf(spec);
  /** The index of the sample `value` is, to a billionth of a step, or `undefined`. */
  const sampleAt = (samples: readonly number[], value: number) => {
    const index = samples.findIndex((sample) => Math.abs(sample - value) <= 1e-9 * Math.abs(samples[1] - samples[0]));
    return index < 0 ? undefined : index;
  };
  /** The sample below `value` and how far `value` is towards the next, as a fraction. */
  const stepOf = (samples: readonly number[], value: number) => {
    let index = 0;
    while (index < samples.length - 2 && samples[index + 1] <= value) {
      index += 1;
    }
    return { index, fraction: (value - samples[index]) / (samples[index + 1] - samples[index]) };
  };
  return line.pieces.flatMap((piece) =>
    piece.x.map((xValue, vertex) => {
      const yValue = piece.y[vertex];
      const i = sampleAt(x, xValue);
      if (i !== undefined) {
        const { index: j, fraction } = stepOf(y, yValue);
        return (1 - fraction) * values[j][i] + fraction * values[j + 1][i];
      }
      const j = sampleAt(y, yValue);
      if (j === undefined) {
        throw new Error(`the vertex (${xValue}, ${yValue}) lies on no grid line`);
      }
      const { index, fraction } = stepOf(x, xValue);
      return (1 - fraction) * values[j][index] + fraction * values[j][index + 1];
    }),
  );
}
