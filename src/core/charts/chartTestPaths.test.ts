import { describe, expect, it } from "vitest";
import type { PathTrace } from "./chartSpec";
import { insideAtSamples, isInsideFill } from "./chartTestPaths";
import { traceRegion } from "./regionTracer";

describe("isInsideFill", () => {
  // A ring of members around a hole of one point, every crossing halfway: the
  // outer ring runs at 0.5 and 3.5, the hole is a diamond about (2, 2).
  const inside = [".....", ".###.", ".#.#.", ".###.", "....."].map((row) => [...row].map((mark) => mark === "#"));
  const { rings } = traceRegion({
    x: [0, 1, 2, 3, 4],
    y: [0, 1, 2, 3, 4],
    inside,
    across: inside.map(() => [0.5, 0.5, 0.5, 0.5]),
    up: inside.slice(1).map(() => [0.5, 0.5, 0.5, 0.5, 0.5]),
    centre: [],
  });
  const fill: PathTrace = { kind: "path", pieces: rings, color: "#000000", width: 0, fill: "#000000", hover: "off" };

  it("answers inside for a point between the outer ring and the hole", () => {
    expect(isInsideFill(fill, 1, 1)).toBe(true);
    expect(isInsideFill(fill, 3.2, 2)).toBe(true);
  });

  it("answers outside for a point beyond the outer ring", () => {
    expect(isInsideFill(fill, 0.2, 2)).toBe(false);
    expect(isInsideFill(fill, 2, 3.8)).toBe(false);
  });

  it("answers outside for a point inside the hole", () => {
    expect(isInsideFill(fill, 2, 2)).toBe(false);
    expect(isInsideFill(fill, 2.2, 1.9)).toBe(false);
  });
});

describe("insideAtSamples", () => {
  const samples = [0, 1, 2, 3];
  const grid = (inside: boolean[][]) =>
    traceRegion({
      x: samples,
      y: samples,
      inside,
      across: inside.map(() => [0.5, 0.5, 0.5]),
      up: inside.slice(1).map(() => [0.5, 0.5, 0.5, 0.5]),
      centre: [],
    });
  const fillOf = (inside: boolean[][]): PathTrace => ({ kind: "path", pieces: grid(inside).rings, color: "#000000", width: 0, fill: "#000000", hover: "off" });

  it("reads every point of a full grid inside, the frame's points and corners too", () => {
    const full = samples.map(() => samples.map(() => true));
    expect(insideAtSamples(fillOf(full), samples, samples)).toEqual(full);
  });

  it("reads each point as the membership the region was traced from, on the frame and off it", () => {
    const inside = ["##..", "###.", ".##.", "..#."].map((row) => [...row].map((mark) => mark === "#"));
    expect(insideAtSamples(fillOf(inside), samples, samples)).toEqual(inside);
  });
});
