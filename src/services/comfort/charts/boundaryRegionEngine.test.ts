import { describe, expect, it } from "vitest";

import { PhysicalQuantityId } from "../../../models/physicalQuantities";
import type { Band } from "../../../models/modelCapabilities";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../../models/units";
import { createFieldAxisScale } from "./axis";
import {
  buildBoundaryRegionTraces,
  buildClosedBoundaryPolygon,
  buildFilledBoundaryRegionTrace,
} from "./boundaryRegionEngine";

interface TestTraceContext {
  band: Band;
  polygonX: number[];
  polygonY: number[];
}

function buildTestTrace({
  band,
  polygonX,
  polygonY,
}: TestTraceContext) {
  return buildFilledBoundaryRegionTrace({
    name: band.label,
    color: band.color,
    polygonX,
    polygonY,
    lineColor: "#111111",
  });
}

function createAxes(
  unitSystem: UnitSystemType = UnitSystem.SI,
  boundaryAxis: "x" | "y" = "x",
) {
  const outdoorAxis = createFieldAxisScale({
    field: PhysicalQuantityId.DryBulbTemperature,
    unitSystem,
    rangeSi: { min: 0, max: 10 },
    points: 2,
  });
  const operativeAxis = createFieldAxisScale({
    field: PhysicalQuantityId.OperativeTemperature,
    unitSystem,
    rangeSi: { min: 10, max: 40 },
    points: 2,
  });
  return {
    xAxis: boundaryAxis === "x" ? outdoorAxis : operativeAxis,
    yAxis: boundaryAxis === "x" ? operativeAxis : outdoorAxis,
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

  it("resolves functional edges with partial SI inputs and extra boundary samples", () => {
    const { xAxis, yAxis } = createAxes();
    const lowerEdge = (xSi: number, inputsSi: Readonly<Partial<Record<string, number>>>) => (
      xSi + Number(inputsSi[PhysicalQuantityId.RelativeAirSpeed]) + 10
    );
    const upperEdge = (xSi: number, inputsSi: Readonly<Partial<Record<string, number>>>) => (
      xSi + Number(inputsSi[PhysicalQuantityId.RelativeAirSpeed]) + 20
    );
    const bands: Band[] = [
      { min: -Infinity, max: lowerEdge, label: "Lower", color: "#ddd" },
      { min: lowerEdge, max: upperEdge, label: "Middle", color: "#eee" },
      { min: upperEdge, max: Infinity, label: "Upper", color: "#fff" },
    ];

    const traces = buildBoundaryRegionTraces({
      bands,
      bandInputsSi: { [PhysicalQuantityId.RelativeAirSpeed]: 0.5 },
      xAxis,
      yAxis,
      boundaryAxis: "x",
      additionalBoundaryValuesSi: [-1, 2.5, 7.5, 11, Number.NaN],
      buildTrace: buildTestTrace,
    });

    expect(traces).toHaveLength(3);
    expect(traces[1].x).toEqual([0, 2.5, 7.5, 10, 10, 7.5, 2.5, 0]);
    expect(traces[1].y).toEqual([
      10.5, 13, 18, 20.5,
      30.5, 28, 23, 20.5,
    ]);
    expect(traces.every((trace) => trace.hoverinfo === "skip")).toBe(true);
    expect(traces.every((trace) => trace.hoverMetadata === undefined)).toBe(true);
  });

  it("transposes the same functional geometry without changing edge semantics", () => {
    const { xAxis, yAxis } = createAxes(UnitSystem.SI, "y");
    const lowerEdge = (outdoorTemperatureSi: number) => outdoorTemperatureSi + 10.5;
    const upperEdge = (outdoorTemperatureSi: number) => outdoorTemperatureSi + 20.5;
    const traces = buildBoundaryRegionTraces({
      bands: [
        { min: -Infinity, max: lowerEdge, label: "Lower", color: "#ddd" },
        { min: lowerEdge, max: upperEdge, label: "Middle", color: "#eee" },
        { min: upperEdge, max: Infinity, label: "Upper", color: "#fff" },
      ],
      bandInputsSi: {},
      xAxis,
      yAxis,
      boundaryAxis: "y",
      additionalBoundaryValuesSi: [2.5, 7.5],
      buildTrace: buildTestTrace,
    });

    expect(traces.map(({ name }) => name)).toEqual(["Lower", "Middle", "Upper"]);
    expect(traces[1].x).toEqual([
      10.5, 13, 18, 20.5,
      30.5, 28, 23, 20.5,
    ]);
    expect(traces[1].y).toEqual([0, 2.5, 7.5, 10, 10, 7.5, 2.5, 0]);
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
      boundaryAxis: "x",
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
      boundaryAxis: "x" as const,
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

  it("converts direct and transposed polygons to IP without hover payloads", () => {
    const directAxes = createAxes(UnitSystem.IP);
    const transposedAxes = createAxes(UnitSystem.IP, "y");
    const build = (boundaryAxis: "x" | "y") => buildBoundaryRegionTraces({
      ...(boundaryAxis === "x" ? directAxes : transposedAxes),
      bands: [
        { min: -Infinity, max: 20, label: "Lower", color: "#ddd" },
        { min: 20, max: Infinity, label: "Upper", color: "#eee" },
      ],
      bandInputsSi: {},
      boundaryAxis,
      buildTrace: buildTestTrace,
    });
    const direct = build("x");
    const transposed = build("y");

    expect(direct[0].x).toEqual([32, 50, 50, 32]);
    expect(direct[0].y).toEqual([50, 50, 68, 68]);
    expect(transposed[0].x).toEqual([50, 50, 68, 68]);
    expect(transposed[0].y).toEqual([32, 50, 50, 32]);
    expect([...direct, ...transposed].every(({ hoverMetadata }) => (
      hoverMetadata === undefined
    ))).toBe(true);
  });
});
