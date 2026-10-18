import { describe, expect, it } from "vitest";
import type { ChartSpec, PathTrace } from "$lib/core/charts/chartSpec";
import { toPlotlyData } from "./plotlyFigure";

/** `traces` as a chart of nothing else. */
function chartOf(...traces: PathTrace[]): ChartSpec {
  const axis = { title: "", range: [0, 10] as const };
  return { traces, layout: { x: axis, y: axis }, legend: [], annotations: [] };
}

describe("toPlotlyData", () => {
  it("draws a path of two rings, the inner wound opposite, as one filled scatter with the rings separated by null", () => {
    const outer = { x: [0, 10, 10, 0], y: [0, 0, 10, 10] };
    const hole = { x: [3, 3, 7, 7], y: [3, 7, 7, 3] };
    const fill: PathTrace = { kind: "path", pieces: [outer, hole], color: "#336699", width: 0, fill: "#336699", hover: "off" };
    const [drawn, ...rest] = toPlotlyData(chartOf(fill));
    expect(rest).toEqual([]);
    expect(drawn).toMatchObject({
      type: "scatter",
      fill: "toself",
      fillcolor: "#336699",
      x: [0, 10, 10, 0, null, 3, 3, 7, 7],
      y: [0, 0, 10, 10, null, 3, 7, 7, 3],
    });
  });

  it("draws a path of one piece as its own vertices, with no null", () => {
    const line: PathTrace = { kind: "path", pieces: [{ x: [0, 5], y: [1, 2] }], color: "#336699", width: 1, hover: "off" };
    expect(toPlotlyData(chartOf(line))[0]).toMatchObject({ type: "scatter", fill: "none", x: [0, 5], y: [1, 2] });
  });
});
