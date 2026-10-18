import { describe, expect, it } from "vitest";
import type { PathPiece } from "./chartSpec";
import { traceRegion, type RegionGrid } from "./regionTracer";

/**
 * A region over the grid `x[i]`, `y[j]` whose members are the points the rows
 * of `rows` mark `#`, the first row the lowest; every crossing halfway
 * between its two points, and every saddle's centre `centre`.
 */
function gridOf(
  rows: readonly string[],
  { x, y, centre = false }: { x?: readonly number[]; y?: readonly number[]; centre?: boolean } = {},
): RegionGrid {
  const inside = rows.map((row) => [...row].map((mark) => mark === "#"));
  const width = inside[0].length;
  return {
    x: x ?? Array.from({ length: width }, (_, index) => index),
    y: y ?? inside.map((_, index) => index),
    inside,
    across: inside.map((row) => row.slice(1).map(() => 0.5)),
    up: inside.slice(1).map((row) => row.map(() => 0.5)),
    centre: inside.slice(1).map((row) => row.slice(1).map(() => centre)),
  };
}

/** `piece`'s vertices as points, rotated to start at the lowest x, then the lowest y: a ring compared whatever vertex it starts at. */
function cycleOf(piece: PathPiece): [number, number][] {
  const points = piece.x.map((x, index): [number, number] => [x, piece.y[index]]);
  const start = points.reduce((best, point, index) => {
    const [lowestX, lowestY] = points[best];
    return point[0] < lowestX || (point[0] === lowestX && point[1] < lowestY) ? index : best;
  }, 0);
  return [...points.slice(start), ...points.slice(0, start)];
}

/** Twice the signed area `ring` encloses: positive wound counter-clockwise, with y up. */
function twiceSignedArea(ring: PathPiece): number {
  return ring.x.reduce((sum, x, index) => {
    const next = (index + 1) % ring.x.length;
    return sum + x * ring.y[next] - ring.x[next] * ring.y[index];
  }, 0);
}

describe("traceRegion", () => {
  it("gives nothing for an empty membership", () => {
    expect(traceRegion(gridOf(["...", "...", "..."]))).toEqual({ rings: [], lines: [] });
  });

  it("gives two separate regions two rings, each wound counter-clockwise", () => {
    const { rings } = traceRegion(gridOf([".....", ".#.#.", "....."]));
    expect(rings.map(cycleOf)).toEqual([
      [[0.5, 1], [1, 0.5], [1.5, 1], [1, 1.5]],
      [[2.5, 1], [3, 0.5], [3.5, 1], [3, 1.5]],
    ]);
    expect(rings.every((ring) => twiceSignedArea(ring) > 0)).toBe(true);
  });

  it("gives a region with a hole an outer ring and an inner ring wound the other way", () => {
    const { rings } = traceRegion(gridOf([".....", ".###.", ".#.#.", ".###.", "....."]));
    expect(rings.map(cycleOf)).toEqual([
      [[0.5, 1], [1, 0.5], [2, 0.5], [3, 0.5], [3.5, 1], [3.5, 2], [3.5, 3], [3, 3.5], [2, 3.5], [1, 3.5], [0.5, 3], [0.5, 2]],
      [[1.5, 2], [2, 2.5], [2.5, 2], [2, 1.5]],
    ]);
    expect(rings.map((ring) => Math.sign(twiceSignedArea(ring)))).toEqual([1, -1]);
  });

  describe("a saddle cell", () => {
    const diagonal = ["....", ".#..", "..#.", "...."];
    const otherDiagonal = ["....", "..#.", ".#..", "...."];

    it("joins its two members across the cell when its centre is in the region", () => {
      expect(traceRegion(gridOf(diagonal, { centre: true })).rings.map(cycleOf)).toEqual([
        [[0.5, 1], [1, 0.5], [1.5, 1], [2, 1.5], [2.5, 2], [2, 2.5], [1.5, 2], [1, 1.5]],
      ]);
      expect(traceRegion(gridOf(otherDiagonal, { centre: true })).rings).toHaveLength(1);
    });

    it("separates them when its centre is not", () => {
      expect(traceRegion(gridOf(diagonal, { centre: false })).rings.map(cycleOf)).toEqual([
        [[0.5, 1], [1, 0.5], [1.5, 1], [1, 1.5]],
        [[1.5, 2], [2, 1.5], [2.5, 2], [2, 2.5]],
      ]);
      expect(traceRegion(gridOf(otherDiagonal, { centre: false })).rings).toHaveLength(2);
    });
  });

  it("puts a vertex exactly where each crossing handed in says, on unevenly scaled axes", () => {
    const grid = gridOf(["...", ".#.", "..."], { x: [10, 20, 30], y: [0, 0.5, 1] });
    const handed = {
      ...grid,
      across: [grid.across[0], [0.25, 0.8], grid.across[2]],
      up: [[0.5, 0.3, 0.5], [0.5, 0.6, 0.5]],
    };
    expect(traceRegion(handed).rings.map(cycleOf)).toEqual([[[12.5, 0.5], [20, 0.15], [28, 0.5], [20, 0.8]]]);
  });

  it("leaves every run along the frame out of the line", () => {
    const { rings, lines } = traceRegion(gridOf(["#..", "#..", "#.."]));
    expect(rings.map(cycleOf)).toEqual([[[0, 0], [0.5, 0], [0.5, 1], [0.5, 2], [0, 2]]]);
    expect(lines).toEqual([{ x: [0.5, 0.5, 0.5], y: [0, 1, 2] }]);
  });

  describe("a crossing handed in at a frame point itself", () => {
    /** The segments of `lines` with both ends on one side of the frame of `x` and `y`: runs along it. */
    function frameRunsOf(lines: readonly PathPiece[], x: readonly number[], y: readonly number[]) {
      const sides = [
        (px: number) => px === x[0],
        (px: number) => px === x[x.length - 1],
      ];
      const ends = [
        (py: number) => py === y[0],
        (py: number) => py === y[y.length - 1],
      ];
      return lines.flatMap((line) =>
        line.x.slice(1).flatMap((x2, index) => {
          const [x1, y1, y2] = [line.x[index], line.y[index], line.y[index + 1]];
          const along = sides.some((on) => on(x1) && on(x2)) || ends.some((on) => on(y1) && on(y2));
          return along ? [[[x1, y1], [x2, y2]]] : [];
        }),
      );
    }

    it("strokes no run along the frame where the crossing puts the boundary on it", () => {
      const grid = gridOf(["##..", "##..", "#...", "...."]);
      const handed = { ...grid, across: grid.across.map((row, j) => (j === 2 ? [0, ...row.slice(1)] : row)) };
      const { lines } = traceRegion(handed);
      expect(lines.length).toBeGreaterThan(0);
      expect(frameRunsOf(lines, grid.x, grid.y)).toEqual([]);
    });

    it("gives a region of no area along the frame no ring and no line", () => {
      const grid = gridOf(["###", "...", "..."]);
      const handed = { ...grid, up: grid.up.map((row) => row.map(() => 0)) };
      expect(traceRegion(handed)).toEqual({ rings: [], lines: [] });
    });
  });

  it("breaks the line of a ring that meets the frame twice into two pieces", () => {
    const { lines } = traceRegion(gridOf(["..#..", "..#..", "..#.."]));
    expect(lines).toHaveLength(2);
    expect(lines).toEqual(
      expect.arrayContaining([
        { x: [2.5, 2.5, 2.5], y: [0, 1, 2] },
        { x: [1.5, 1.5, 1.5], y: [2, 1, 0] },
      ]),
    );
  });

  it("gives a region touching no frame a line equal to its rings, each closed", () => {
    const { rings, lines } = traceRegion(gridOf([".....", ".###.", ".#.#.", ".###.", "....."]));
    expect(lines).toEqual(rings.map((ring) => ({ x: [...ring.x, ring.x[0]], y: [...ring.y, ring.y[0]] })));
  });

  it("gives a full membership the frame as its ring and no line", () => {
    const { rings, lines } = traceRegion(gridOf(["###", "###", "###"], { x: [0, 1, 4] }));
    expect(rings.map(cycleOf)).toEqual([[[0, 0], [4, 0], [4, 2], [0, 2]]]);
    expect(lines).toEqual([]);
  });
});
