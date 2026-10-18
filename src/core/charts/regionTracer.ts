/**
 * The region tracer (ADR-0002 decision 78 rules 2 and 4): the boundary of a
 * region of a grid, found by marching squares over which grid points are its
 * members and where, between a member and a point that is not, the boundary
 * crosses. Pure geometry: it reads no quantity, unit, slot or model and calls
 * nothing, so whoever hands it the membership has made every run already.
 */
import type { PathPiece } from "./chartSpec";

/**
 * A region of the grid `x[i]`, `y[j]`, both ascending, with at least two
 * points along each. Each table is indexed
 * `[j][i]`, its row first, and is read only where it is needed: a crossing
 * only between two points whose membership differs, a centre only in a
 * saddle cell, two diagonal corners members and the other two not.
 */
export interface RegionGrid {
  readonly x: readonly number[];
  readonly y: readonly number[];
  /** Whether the point (`x[i]`, `y[j]`) is in the region. */
  readonly inside: readonly (readonly boolean[])[];
  /** Where the boundary crosses from (`x[i]`, `y[j]`) to (`x[i + 1]`, `y[j]`), as a fraction of the way. */
  readonly across: readonly (readonly (number | undefined)[])[];
  /** Where the boundary crosses from (`x[i]`, `y[j]`) to (`x[i]`, `y[j + 1]`), as a fraction of the way. */
  readonly up: readonly (readonly (number | undefined)[])[];
  /** Whether the centre of the cell from (`x[i]`, `y[j]`) to (`x[i + 1]`, `y[j + 1]`) is in the region. */
  readonly centre: readonly (readonly (boolean | undefined)[])[];
}

/** A region's boundary, to fill and to stroke. */
export interface TracedRegion {
  /**
   * Closed rings, the last vertex joining the first. Each keeps the region on
   * its left, so with y up an outer ring is wound counter-clockwise and a
   * hole clockwise. Where the region reaches the grid's frame, a ring runs
   * along it.
   */
  readonly rings: readonly PathPiece[];
  /**
   * The same boundary with every run along the frame left out, as polylines.
   * A ring that touches no frame is one polyline, its first vertex repeated
   * at its end so that it closes.
   */
  readonly lines: readonly PathPiece[];
}

/** A grid point, or a cell's lower-left corner, by its indices; either may be one step outside the grid. */
interface GridIndex {
  readonly i: number;
  readonly j: number;
}

/** The side between two grid points: from (`i`, `j`) one step right (`"across"`) or one step up (`"up"`). */
interface Side extends GridIndex {
  readonly direction: "across" | "up";
}

/** One piece of a ring inside one cell, from the crossing on one side to the crossing on another. */
interface Segment {
  readonly from: Side;
  readonly to: Side;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/** A ring's vertex, and whether the run from it to the next vertex lies along the frame. */
interface Vertex extends Point {
  readonly frame: boolean;
}

/**
 * `grid`'s region traced. The grid is read as if one ring of points outside
 * the region surrounded it, the boundary crossing to each of them at the frame
 * point itself, so a member on the frame closes its ring along the frame.
 */
export function traceRegion(grid: RegionGrid): TracedRegion {
  const segments = new Map<string, Segment>();
  const columns = grid.x.length;
  const rows = grid.y.length;
  for (let j = -1; j < rows; j++) {
    for (let i = -1; i < columns; i++) {
      for (const segment of segmentsOfCell(grid, { i, j })) {
        segments.set(keyOf(segment.from), segment);
      }
    }
  }
  const rings: PathPiece[] = [];
  const lines: PathPiece[] = [];
  for (const loop of loopsOf(segments)) {
    const points = withoutRepeats(loop.map((segment) => crossingPointOf(grid, segment.from)));
    const vertices = points.map((point, index) => ({ ...point, frame: isAlongFrame(grid, point, points[(index + 1) % points.length]) }));
    const ring = withoutRepeats(withFrameRunsMerged(vertices));
    if (ring.length < 3) {
      continue;
    }
    rings.push(pieceOf(ring));
    lines.push(...linesOf(ring));
  }
  return { rings, lines };
}

/**
 * The segments of the cell whose lower-left corner is `corner`, each from the
 * side where its corners, walked counter-clockwise, leave the region to the
 * side where they next enter it, keeping the region on the left. In a saddle
 * cell each leaving side meets the side after it when the centre is a member,
 * which joins the two members across the cell, and the side before it when
 * not, which cuts each member off alone.
 */
function segmentsOfCell(grid: RegionGrid, corner: GridIndex): Segment[] {
  const { i, j } = corner;
  const corners = [
    { i, j },
    { i: i + 1, j },
    { i: i + 1, j: j + 1 },
    { i, j: j + 1 },
  ];
  /** The sides from each corner to the next, counter-clockwise: bottom, right, top, left. */
  const sides: Side[] = [
    { i, j, direction: "across" },
    { i: i + 1, j, direction: "up" },
    { i, j: j + 1, direction: "across" },
    { i, j, direction: "up" },
  ];
  const member = corners.map((point) => isMember(grid, point));
  const leaving = [0, 1, 2, 3].filter((side) => member[side] && !member[(side + 1) % 4]);
  const entering = [0, 1, 2, 3].filter((side) => !member[side] && member[(side + 1) % 4]);
  if (leaving.length === 1) {
    return [{ from: sides[leaving[0]], to: sides[entering[0]] }];
  }
  if (leaving.length === 2) {
    const joined = grid.centre[j]?.[i];
    if (joined === undefined) {
      throw new Error(`No centre is given for the saddle cell at grid point (${i}, ${j})`);
    }
    const step = joined ? 1 : 3;
    return leaving.map((side) => ({ from: sides[side], to: sides[(side + step) % 4] }));
  }
  return [];
}

/** Whether `point` is in the region: never one outside the grid. */
function isMember(grid: RegionGrid, { i, j }: GridIndex): boolean {
  return grid.inside[j]?.[i] ?? false;
}

function keyOf({ i, j, direction }: Side): string {
  return `${direction} ${i} ${j}`;
}

/** The segments joined end to start into closed loops, each loop in the order it is walked. */
function loopsOf(segments: ReadonlyMap<string, Segment>): Segment[][] {
  const walked = new Set<string>();
  const loops: Segment[][] = [];
  for (const [key, first] of segments) {
    if (walked.has(key)) {
      continue;
    }
    const loop: Segment[] = [];
    let segment: Segment | undefined = first;
    while (segment !== first || loop.length === 0) {
      if (!segment || walked.has(keyOf(segment.from))) {
        throw new Error(`The boundary through the side ${key} does not close`);
      }
      walked.add(keyOf(segment.from));
      loop.push(segment);
      segment = segments.get(keyOf(segment.to));
    }
    loops.push(loop);
  }
  return loops;
}

/**
 * Where the boundary crosses `side`: the crossing handed in, or, on a side to
 * a point outside the grid, the frame point at the side's other end.
 */
function crossingPointOf(grid: RegionGrid, side: Side): Point {
  const { i, j, direction } = side;
  const last = { i: grid.x.length - 1, j: grid.y.length - 1 };
  if (direction === "across") {
    if (i < 0 || i >= last.i) {
      return { x: grid.x[Math.max(i, 0)], y: grid.y[j] };
    }
    return { x: pointAlong(grid.x, i, crossingOf(grid.across, side)), y: grid.y[j] };
  }
  if (j < 0 || j >= last.j) {
    return { x: grid.x[i], y: grid.y[Math.max(j, 0)] };
  }
  return { x: grid.x[i], y: pointAlong(grid.y, j, crossingOf(grid.up, side)) };
}

/**
 * Whether the run from `start` to `end` lies along the grid's frame: both on
 * one side of it. A run made outside the frame always does; so does one made
 * inside it whose crossings are handed in at frame points.
 */
function isAlongFrame(grid: RegionGrid, start: Point, end: Point): boolean {
  const onSide = (value: number, other: number, samples: readonly number[]) =>
    value === other && (value === samples[0] || value === samples[samples.length - 1]);
  return onSide(start.x, end.x, grid.x) || onSide(start.y, end.y, grid.y);
}

function crossingOf(table: RegionGrid["across"], { i, j, direction }: Side): number {
  const fraction = table[j]?.[i];
  if (fraction === undefined) {
    throw new Error(`No crossing is given ${direction} from grid point (${i}, ${j})`);
  }
  return fraction;
}

/**
 * The point `fraction` of the way from `samples[index]` to the next sample,
 * written so that 0 and 1 give the two samples exactly, which a frame point
 * must be.
 */
function pointAlong(samples: readonly number[], index: number, fraction: number): number {
  return (1 - fraction) * samples[index] + fraction * samples[index + 1];
}

/**
 * `ring` without a vertex that repeats the next one, so that no run has no
 * length; of the two, the later is kept, with the run that leaves it.
 */
function withoutRepeats<Corner extends Point>(ring: readonly Corner[]): Corner[] {
  return ring.filter((vertex, index) => {
    const next = ring[(index + 1) % ring.length];
    return vertex.x !== next.x || vertex.y !== next.y;
  });
}

/** `ring` with each run along one side of the frame as one run: a vertex between two of them goes. */
function withFrameRunsMerged(ring: readonly Vertex[]): Vertex[] {
  return ring.filter((vertex, index) => {
    const previous = ring[(index + ring.length - 1) % ring.length];
    const next = ring[(index + 1) % ring.length];
    const straight = (previous.x === vertex.x && vertex.x === next.x) || (previous.y === vertex.y && vertex.y === next.y);
    return !(previous.frame && vertex.frame && straight);
  });
}

function pieceOf(vertices: readonly Point[]): PathPiece {
  return { x: vertices.map((vertex) => vertex.x), y: vertices.map((vertex) => vertex.y) };
}

/** `ring`'s runs off the frame as polylines, each from where it leaves the frame to where it next meets it. */
function linesOf(ring: readonly Vertex[]): PathPiece[] {
  const start = ring.findIndex((vertex, index) => !vertex.frame && ring[(index + ring.length - 1) % ring.length].frame);
  if (start < 0) {
    return ring.some((vertex) => vertex.frame) ? [] : [pieceOf([...ring, ring[0]])];
  }
  const lines: PathPiece[] = [];
  let line: Vertex[] = [];
  for (let step = 0; step < ring.length; step++) {
    const vertex = ring[(start + step) % ring.length];
    if (vertex.frame) {
      if (line.length > 0) {
        lines.push(pieceOf([...line, vertex]));
        line = [];
      }
    } else {
      line.push(vertex);
    }
  }
  return lines;
}
