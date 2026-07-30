import { describe, expect, it } from "vitest";

import type { GridEvaluationResult } from "./types";
import {
  buildBandTooltipTrace,
  buildConstraintBandTraces,
  buildZoneColorscale,
  buildZoneContourTraces,
} from "./zoneGrid";

function createGrid(zValues: number[][]): GridEvaluationResult {
  const columnCount = zValues[0]?.length ?? 0;
  return {
    xValues: Array.from({ length: columnCount }, (_, index) => index),
    yValues: Array.from({ length: zValues.length }, (_, index) => index),
    xValuesSi: Array.from({ length: columnCount }, (_, index) => index),
    yValuesSi: Array.from({ length: zValues.length }, (_, index) => index),
    zValues,
    textValues: zValues.map((row) => row.map(() => "")),
    hoverMetadata: zValues.map((row) => row.map((value) => [value])),
  };
}

describe("zone grid", () => {
  it("builds reusable zone layers and their colorscale", () => {
    const colorscale = buildZoneColorscale([
      { color: "#ffffff" },
      { color: "#000000" },
    ]);
    const traces = buildZoneContourTraces({
      name: "Zones",
      grid: createGrid([[0, 1]]),
      colorscale,
      zmin: 0,
      zmax: 1,
      contours: {
        coloring: "fill",
        showlines: false,
      },
      hovertemplate: "%{text}<extra></extra>",
      isBackgroundZone: true,
      includeHoverMetadata: false,
      boundaryLayer: {},
    });

    expect(colorscale).toEqual([
      [0, "#ffffff"],
      [0.5, "#ffffff"],
      [0.5, "#000000"],
      [1, "#000000"],
    ]);
    expect(traces).toHaveLength(2);
    expect(traces[0].isBackgroundZone).toBe(true);
    expect(traces[1]).toEqual(expect.objectContaining({
      name: "Boundaries",
      hoverinfo: "skip",
      text: undefined,
      hoverMetadata: undefined,
    }));
    expect(traces[1].contours?.coloring).toBe("none");
  });

  it("rejects an empty zone colorscale", () => {
    expect(() => buildZoneColorscale([])).toThrow(
      "At least one zone is required to build a colorscale",
    );
  });

  it("builds constraint fills and boundaries without hover hit regions", () => {
    const grid = createGrid([
      [0, 5, 10, 15, 20, 25, 30],
      [0, 5, 10, 15, 20, 25, 30],
    ]);
    const bands = [
      { min: -Infinity, max: 5, label: "Low", color: "#0000ff" },
      { min: 10, max: 25, label: "Middle", color: "#ffffff" },
      { min: 25, max: Infinity, label: "High", color: "#ff0000" },
    ];
    const traces = buildConstraintBandTraces({
      name: "Output bands",
      bands,
      grid,
    });
    const fillTraces = traces.filter((trace) => (
      trace.contours?.type === "constraint" && trace.contours.operation !== "="
    ));
    const boundaryTraces = traces.filter((trace) => trace.contours?.operation === "=");

    expect(fillTraces.map((trace) => trace.contours)).toEqual([
      expect.objectContaining({ operation: ">=", value: 5 }),
      expect.objectContaining({ operation: "][", value: [10, 25] }),
      expect.objectContaining({ operation: "<", value: 25 }),
    ]);
    expect(fillTraces.map((trace) => trace.fillcolor)).toEqual([
      "#0000ff",
      "#ffffff",
      "#ff0000",
    ]);
    expect(fillTraces.every((trace) => trace.z === grid.zValues)).toBe(true);
    expect(fillTraces.every((trace) => trace.hoverinfo === "skip")).toBe(true);
    expect(boundaryTraces.map((trace) => trace.contours?.value)).toEqual([5, 10, 25]);
    expect(boundaryTraces.every((trace) => trace.hoverinfo === "skip")).toBe(true);
    expect(boundaryTraces.every((trace) => trace.line?.color === "#333333")).toBe(true);
    expect(traces.every((trace) => trace.type === "contour")).toBe(true);
  });

  it("builds one transparent raw-grid tooltip with unclassified gaps", () => {
    const grid = createGrid([[0, 5, 10]]);
    grid.textValues = [["Low", "Unclassified", "High"]];
    const trace = buildBandTooltipTrace({
      name: "Output bands hover",
      grid,
      hovertemplate: "Band: %{text}; value: %{customdata[0]}",
    });

    expect(trace).toEqual(expect.objectContaining({
      type: "contour",
      name: "Output bands hover",
      z: grid.zValues,
      text: grid.textValues,
      hoverMetadata: grid.hoverMetadata,
      hoverongaps: false,
    }));
    expect(trace.colorscale).toEqual([
      [0, "rgba(0, 0, 0, 0)"],
      [1, "rgba(0, 0, 0, 0)"],
    ]);
  });

  it("covers one fully unbounded band with a finite constraint", () => {
    const traces = buildConstraintBandTraces({
      name: "All values",
      bands: [
        { min: -Infinity, max: Infinity, label: "All", color: "#ffffff" },
      ],
      grid: createGrid([[-2, 0, 2], [-2, 0, 2]]),
    });

    expect(traces).toHaveLength(1);
    expect(traces[0].contours).toEqual(expect.objectContaining({
      type: "constraint",
      operation: ">=",
      coloring: "none",
    }));
    const coverValue = traces[0].contours?.value;
    if (typeof coverValue !== "number") {
      throw new Error("Expected a numeric unbounded-band cover value.");
    }
    expect(coverValue).toBeGreaterThan(2);
    expect(Number.isFinite(coverValue)).toBe(true);
    expect(JSON.parse(JSON.stringify(traces))[0].contours.value).toBeGreaterThan(2);
  });

  it("omits constraint traces when the raw grid has no finite values", () => {
    expect(buildConstraintBandTraces({
      name: "No values",
      bands: [
        { min: -Infinity, max: Infinity, label: "All", color: "#ffffff" },
      ],
      grid: createGrid([[NaN, NaN], [NaN, NaN]]),
    })).toEqual([]);
  });
});
