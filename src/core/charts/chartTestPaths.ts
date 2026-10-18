/**
 * How a test reads a drawn path: a region by whether a point lies inside a
 * filled path by the rule Plotly fills it by, so a test asserts what a person
 * sees rather than how the region was found; and a path drawn in one piece by
 * that piece.
 */
import type { PathPiece, PathTrace } from "./chartSpec";

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
