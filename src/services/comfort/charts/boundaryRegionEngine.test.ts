import { describe, expect, it } from "vitest";

import { FieldKey } from "../../../models/fieldKeys";
import type { Band } from "../../../models/modelCapabilities";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../../models/units";
import { createFieldAxisScale } from "./axis";
import {
  buildBoundaryRegionTraces,
  buildClosedBoundaryPolygon,
  buildClosedBoundaryPolygonTrace,
  buildFilledBoundaryRegionTrace,
} from "./boundaryRegionEngine";

interface TestTraceContext {
  band: Band;
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

function createAxes(unitSystem: UnitSystemType = UnitSystem.SI) {
  return {
    xAxis: createFieldAxisScale({
      field: FieldKey.DryBulbTemperature,
      unitSystem,
      rangeSi: { min: 0, max: 10 },
      points: 2,
    }),
    yAxis: createFieldAxisScale({
      field: FieldKey.OperativeTemperature,
      unitSystem,
      rangeSi: { min: 10, max: 40 },
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

  it("resolves functional edges with partial SI inputs and extra X samples", () => {
    const { xAxis, yAxis } = createAxes();
    const lowerEdge = (xSi: number, inputsSi: Readonly<Partial<Record<string, number>>>) => (
      xSi + Number(inputsSi[FieldKey.RelativeAirSpeed]) + 10
    );
    const upperEdge = (xSi: number, inputsSi: Readonly<Partial<Record<string, number>>>) => (
      xSi + Number(inputsSi[FieldKey.RelativeAirSpeed]) + 20
    );
    const bands: Band[] = [
      { min: -Infinity, max: lowerEdge, label: "Lower", color: "#ddd" },
      { min: lowerEdge, max: upperEdge, label: "Middle", color: "#eee" },
      { min: upperEdge, max: Infinity, label: "Upper", color: "#fff" },
    ];

    const traces = buildBoundaryRegionTraces({
      bands,
      bandInputsSi: { [FieldKey.RelativeAirSpeed]: 0.5 },
      xAxis,
      yAxis,
      additionalXValuesSi: [-1, 2.5, 7.5, 11, Number.NaN],
      buildTrace: buildTestTrace,
    });

    expect(traces).toHaveLength(3);
    expect(traces[1].x).toEqual([0, 2.5, 7.5, 10, 10, 7.5, 2.5, 0]);
    expect(traces[1].y).toEqual([
      10.5, 13, 18, 20.5,
      30.5, 28, 23, 20.5,
    ]);
  });

  it("clamps unbounded bands to Y and preserves declared gaps", () => {
    const { xAxis, yAxis } = createAxes();
    const traces = buildBoundaryRegionTraces({
      bands: [
        { min: -Infinity, max: 15, label: "Low", color: "#ddd" },
        { min: 20, max: 30, label: "Middle", color: "#eee" },
        { min: 35, max: Infinity, label: "High", color: "#fff" },
      ],
      bandInputsSi: {},
      xAxis,
      yAxis,
      buildTrace: buildTestTrace,
    });

    expect(traces.map(({ name }) => name)).toEqual(["Low", "Middle", "High"]);
    expect(traces[0].y).toEqual([10, 10, 15, 15]);
    expect(traces[1].y).toEqual([20, 20, 30, 30]);
    expect(traces[2].y).toEqual([35, 35, 40, 40]);
  });

  it("rejects reversed bands, overlaps, and NaN edges at sampled X values", () => {
    const { xAxis, yAxis } = createAxes();
    const baseOptions = {
      bandInputsSi: {},
      xAxis,
      yAxis,
      buildTrace: buildTestTrace,
    };

    expect(() => buildBoundaryRegionTraces({
      ...baseOptions,
      bands: [{ min: 20, max: 19, label: "Reversed", color: "#ddd" }],
    })).toThrow("Boundary band 0 is reversed");
    expect(() => buildBoundaryRegionTraces({
      ...baseOptions,
      bands: [
        { min: 10, max: 25, label: "First", color: "#ddd" },
        { min: 24, max: 30, label: "Second", color: "#eee" },
      ],
    })).toThrow("Boundary bands overlap");
    expect(() => buildBoundaryRegionTraces({
      ...baseOptions,
      bands: [{ min: Number.NaN, max: 20, label: "NaN", color: "#ddd" }],
    })).toThrow("resolved to NaN");
  });

  it("converts polygons to IP while passing canonical-SI coordinates to hover hooks", () => {
    const { xAxis, yAxis } = createAxes(UnitSystem.IP);
    const traces = buildBoundaryRegionTraces({
      bands: [
        { min: -Infinity, max: 20, label: "Lower", color: "#ddd" },
        { min: 20, max: Infinity, label: "Upper", color: "#eee" },
      ],
      bandInputsSi: {},
      xAxis,
      yAxis,
      getHoverMetadata: (xSi, ySi, index, band, bandIndex) => [
        xSi,
        ySi,
        index,
        band.label,
        bandIndex,
      ],
      buildTrace: buildTestTrace,
    });

    expect(traces[0].x).toEqual([32, 50, 50, 32]);
    expect(traces[0].y).toEqual([50, 50, 68, 68]);
    expect(traces[0].hoverMetadata).toEqual([
      [0, 10, 0, "Lower", 0],
      [10, 10, 1, "Lower", 0],
      [10, 20, 2, "Lower", 0],
      [0, 20, 3, "Lower", 0],
    ]);
  });
});
