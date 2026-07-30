import { describe, expect, it } from "vitest";

import { FieldKey } from "../../../models/fieldKeys";
import { UnitSystem } from "../../../models/units";
import { createFieldAxisScale } from "./axis";
import {
  buildBoundaryRegionTraces,
  buildClosedBoundaryPolygon,
  buildClosedBoundaryPolygonTrace,
  buildFilledBoundaryRegionTrace,
} from "./boundaryRegionEngine";

interface TestTraceContext {
  band: { label: string; color: string };
  polygonX: number[];
  polygonY: number[];
  hoverMetadata: unknown[][];
}

function buildTestTrace({
  band,
  polygonX,
  polygonY,
  hoverMetadata,
}: TestTraceContext) {
  return buildFilledBoundaryRegionTrace({
    name: band.label,
    color: band.color,
    polygonX,
    polygonY,
    lineColor: "#111111",
    hoverMetadata,
  });
}

function createDistinctFieldAxes() {
  return {
    xAxis: createFieldAxisScale({
      field: FieldKey.DryBulbTemperature,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: 0, max: 10 },
      points: 2,
    }),
    yAxis: createFieldAxisScale({
      field: FieldKey.RelativeHumidity,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: 0, max: 100 },
      points: 2,
    }),
  };
}

describe("boundary region engine", () => {
  it("builds a closed polygon from two boundary edges", () => {
    expect(buildClosedBoundaryPolygon({
      lowerX: [1, 2],
      lowerY: [3, 4],
      upperX: [5, 6],
      upperY: [7, 8],
    })).toEqual({
      polygonX: [1, 2, 6, 5],
      polygonY: [3, 4, 8, 7],
    });
  });

  it("builds closed polygon traces with axis display conversion", () => {
    const xAxis = createFieldAxisScale({
      field: FieldKey.DryBulbTemperature,
      unitSystem: UnitSystem.IP,
      rangeSi: { min: 0, max: 10 },
      points: 2,
    });
    const yAxis = createFieldAxisScale({
      field: FieldKey.RelativeHumidity,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: 0, max: 100 },
      points: 2,
    });

    const trace = buildClosedBoundaryPolygonTrace({
      lowerXValuesSi: [0, 10],
      lowerYValuesSi: [20, 30],
      upperXValuesSi: [0, 10],
      upperYValuesSi: [80, 90],
      xAxis,
      yAxis,
      buildTrace: ({ polygonX, polygonY, hoverMetadata }) => (
        buildFilledBoundaryRegionTrace({
          name: "Region",
          color: "#eeeeee",
          polygonX,
          polygonY,
          lineColor: "#111111",
          hoverMetadata,
        })
      ),
    });

    expect(trace.x).toEqual([32, 50, 50, 32]);
    expect(trace.y).toEqual([20, 30, 90, 80]);
    expect(trace.hoverMetadata).toEqual([[], [], [], []]);
  });

  it("orients regions when the variable dimension is x", () => {
    const { xAxis, yAxis } = createDistinctFieldAxes();
    const traces = buildBoundaryRegionTraces({
      variableValuesSi: [0, 10],
      boundaryCurvesSi: [[25, 75]],
      bands: [
        { label: "Lower", color: "#dddddd" },
        { label: "Upper", color: "#eeeeee" },
      ],
      variableAxis: xAxis,
      boundaryAxis: yAxis,
      variableDimension: "x",
      buildTrace: buildTestTrace,
    });

    expect(traces).toHaveLength(2);
    expect(traces[0].x).toEqual([0, 10, 10, 0]);
    expect(traces[0].y).toEqual([0, 0, 75, 25]);
    expect(traces[1].y).toEqual([25, 75, 100, 100]);
  });

  it("orients regions when the variable dimension is y", () => {
    const xAxis = createFieldAxisScale({
      field: FieldKey.DryBulbTemperature,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: 0, max: 100 },
      points: 2,
    });
    const yAxis = createFieldAxisScale({
      field: FieldKey.DryBulbTemperature,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: 0, max: 10 },
      points: 2,
    });

    const traces = buildBoundaryRegionTraces({
      variableValuesSi: [0, 10],
      boundaryCurvesSi: [[25, 75]],
      bands: [
        { label: "Left", color: "#dddddd" },
        { label: "Right", color: "#eeeeee" },
      ],
      variableAxis: yAxis,
      boundaryAxis: xAxis,
      variableDimension: "y",
      buildTrace: buildTestTrace,
    });

    expect(traces[0].x).toEqual([0, 0, 75, 25]);
    expect(traces[0].y).toEqual([0, 10, 10, 0]);
    expect(traces[1].x).toEqual([25, 75, 100, 100]);
  });

  it("rejects mismatched dimensions and inverted adjacent curves", () => {
    const { xAxis, yAxis } = createDistinctFieldAxes();
    const baseOptions = {
      variableValuesSi: [0, 10],
      bands: [
        { label: "Lower", color: "#dddddd" },
        { label: "Upper", color: "#eeeeee" },
      ],
      variableAxis: xAxis,
      boundaryAxis: yAxis,
      variableDimension: "x" as const,
      buildTrace: buildTestTrace,
    };

    expect(() => buildBoundaryRegionTraces({
      ...baseOptions,
      boundaryCurvesSi: [[25]],
    })).toThrow("Boundary curves must match the band and variable dimensions");
    expect(() => buildBoundaryRegionTraces({
      ...baseOptions,
      boundaryCurvesSi: [[25, 75]],
      bands: [...baseOptions.bands, { label: "Extra", color: "#ffffff" }],
    })).toThrow("Boundary curves must match the band and variable dimensions");
    expect(() => buildBoundaryRegionTraces({
      ...baseOptions,
      boundaryCurvesSi: [[60, 40], [50, 70]],
      bands: [...baseOptions.bands, { label: "Extra", color: "#ffffff" }],
    })).toThrow("Boundary curves must be ordered at every variable point");
  });

  it("builds hover metadata directly from SI coordinates", () => {
    const { xAxis: baseXAxis, yAxis: baseYAxis } = createDistinctFieldAxes();
    const xAxis = {
      ...baseXAxis,
      toDisplay: (valueSi: number) => valueSi + 1000,
      toSi: () => Number.NaN,
    };
    const yAxis = {
      ...baseYAxis,
      toDisplay: (valueSi: number) => valueSi + 2000,
      toSi: () => Number.NaN,
    };

    const traces = buildBoundaryRegionTraces({
      variableValuesSi: [20, 80],
      boundaryCurvesSi: [[-5, 15]],
      bands: [
        { label: "Left", color: "#dddddd" },
        { label: "Right", color: "#eeeeee" },
      ],
      variableAxis: yAxis,
      boundaryAxis: xAxis,
      variableDimension: "y",
      getHoverMetadata: (xSi, ySi, index) => [xSi, ySi, index],
      buildTrace: buildTestTrace,
    });

    expect(traces[0].x).toEqual([1000, 1000, 1010, 1000]);
    expect(traces[0].y).toEqual([2020, 2080, 2080, 2020]);
    expect(traces[0].hoverMetadata).toEqual([
      [0, 20, 0],
      [0, 80, 1],
      [10, 80, 2],
      [0, 20, 3],
    ]);
  });
});
