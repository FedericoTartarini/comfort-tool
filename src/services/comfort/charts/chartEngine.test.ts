import { describe, expect, it } from "vitest";

import { CalculationSource } from "../../../models/calculationMetadata";
import { FieldKey } from "../../../models/fieldKeys";
import { InputId } from "../../../models/inputSlots";
import { UnitSystem } from "../../../models/units";
import { createFieldAxisScale } from "./axis";
import {
  buildBoundaryRegionTraces,
  buildClosedBoundaryPolygon,
  buildClosedBoundaryPolygonTrace,
  buildFilledBoundaryRegionTrace,
} from "./boundaryRegionEngine";
import { buildGridContourFieldChart } from "./chartEngine";
import { evaluateGrid } from "./gridEngine";
import { buildInputScatterTraces, resolveBaselineInputEntry } from "./inputPoints";
import { buildZoneColorscale, buildZoneContourLayers } from "./zoneGrid";

describe("shared chart engine", () => {
  it("creates axis scales that preserve SI evaluation and display values", () => {
    const axis = createFieldAxisScale({
      field: FieldKey.DryBulbTemperature,
      unitSystem: UnitSystem.IP,
      rangeSi: { min: 0, max: 100 },
      points: 2,
    });

    expect(axis.toDisplay(0)).toBe(32);
    expect(axis.toSi(212)).toBe(100);
    expect(axis.units).toBe("°F");
  });

  it("evaluates grids with NaN cells when a point fails", () => {
    const xAxis = createFieldAxisScale({
      field: FieldKey.DryBulbTemperature,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: 0, max: 1 },
      points: 2,
    });
    const yAxis = createFieldAxisScale({
      field: FieldKey.RelativeHumidity,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: 0, max: 1 },
      points: 2,
    });

    const grid = evaluateGrid({
      xAxis,
      yAxis,
      evaluatePoint: (xSi, ySi) => {
        if (xSi > 0.5) {
          throw new Error("outside");
        }
        return { z: xSi + ySi, text: "ok", hoverMetadata: [xSi, ySi] };
      },
    });

    expect(grid.zValues).toEqual([[0, NaN], [1, NaN]]);
    expect(grid.textValues[0]).toEqual(["ok", "Error"]);
    expect(grid.hoverMetadata[0][0]).toEqual([0, 0]);
    expect(grid.hoverMetadata[0][1]).toEqual([NaN]);
  });

  it("builds input scatter traces from SI payload values", () => {
    const xAxis = createFieldAxisScale({
      field: FieldKey.DryBulbTemperature,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: 0, max: 40 },
      points: 2,
    });
    const yAxis = createFieldAxisScale({
      field: FieldKey.RelativeHumidity,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: 0, max: 100 },
      points: 2,
    });

    const traces = buildInputScatterTraces({
      inputsMap: {
        [InputId.Input1]: { tdb: 25, rh: 50 },
      },
      resultsByInput: {
        [InputId.Input1]: { category: "Neutral" },
      },
      xAxis,
      yAxis,
      getXSi: (payload) => payload.tdb,
      getYSi: (payload) => payload.rh,
      getHovertemplate: ({ inputLabel, result }) => `${inputLabel}: ${result?.category}<extra></extra>`,
    });

    expect(traces).toHaveLength(1);
    expect(traces[0].name).toBe("Input 1");
    expect(traces[0].x).toEqual([25]);
    expect(traces[0].y).toEqual([50]);
    expect(traces[0].hovertemplate).toContain("Neutral");
  });

  it("resolves preferred baseline inputs and falls back to the first ordered input", () => {
    const inputsMap = {
      [InputId.Input1]: { label: "first" },
      [InputId.Input2]: { label: "second" },
    };

    expect(resolveBaselineInputEntry(inputsMap, InputId.Input2)).toEqual({
      inputId: InputId.Input2,
      payload: { label: "second" },
    });
    expect(resolveBaselineInputEntry(inputsMap, InputId.Input3)).toEqual({
      inputId: InputId.Input1,
      payload: { label: "first" },
    });
    expect(resolveBaselineInputEntry({ [InputId.Input2]: { label: "only" } })).toEqual({
      inputId: InputId.Input2,
      payload: { label: "only" },
    });
  });

  it("runs grid charts with SI callback values and grouped input overlays", () => {
    const xAxis = createFieldAxisScale({
      field: FieldKey.DryBulbTemperature,
      unitSystem: UnitSystem.IP,
      rangeSi: { min: 0, max: 100 },
      points: 2,
    });
    const yAxis = createFieldAxisScale({
      field: FieldKey.RelativeHumidity,
      unitSystem: UnitSystem.IP,
      rangeSi: { min: 0, max: 100 },
      points: 2,
    });
    const xValuesSeen: number[] = [];

    const chart = buildGridContourFieldChart({
      xAxis,
      yAxis,
      leadingTraces: [{
        type: "scatter",
        mode: "lines",
        name: "Leading",
        x: [],
        y: [],
      }],
      grid: {
        evaluatePoint: (xSi, ySi) => {
          xValuesSeen.push(xSi);
          return { z: xSi + ySi, text: "grid" };
        },
        layers: [{
          name: "Grid",
          colorscale: [[0, "#ffffff"], [1, "#000000"]],
          contours: { coloring: "fill" },
          hovertemplate: "%{text}<extra></extra>",
        }],
      },
      beforeInputTraces: [{
        type: "scatter",
        mode: "lines",
        name: "Before inputs",
        x: [],
        y: [],
      }],
      inputGroups: [{
        inputsMap: {
          [InputId.Input1]: { tdb: 25, rh: 50 },
        },
        xAxis,
        yAxis,
        getXSi: (payload) => payload.tdb,
        getYSi: (payload) => payload.rh,
        buildOverlayTraces: ({ inputLabel, xDisplay, yDisplay }) => [{
          type: "scatter",
          mode: "lines",
          name: `${inputLabel} overlay`,
          x: [xDisplay],
          y: [yDisplay],
        }],
        getHovertemplate: ({ inputLabel }) => `${inputLabel}<extra></extra>`,
      }],
      layout: {
        title: "Grid chart",
        xAxis,
        yAxis,
        paperBgColor: "#ffffff",
        plotBgColor: "#ffffff",
        showLegend: false,
        margin: { l: 0, r: 0, t: 0, b: 0 },
      },
      source: CalculationSource.FrontendGenerated,
    });

    expect(xValuesSeen).toEqual([0, 100, 0, 100]);
    expect(chart.traces.map((trace) => trace.name)).toEqual([
      "Leading",
      "Grid",
      "Before inputs",
      "Input 1 overlay",
      "Input 1",
    ]);
    expect(chart.traces[4].x).toEqual([77]);
    expect(chart.traces[4].y).toEqual([50]);
  });

  it("builds boundary regions with axis-aware polygon orientation", () => {
    const xAxis = createFieldAxisScale({
      field: FieldKey.DryBulbTemperature,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: 0, max: 10 },
      points: 2,
    });
    const yAxis = createFieldAxisScale({
      field: FieldKey.RelativeHumidity,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: 0, max: 100 },
      points: 2,
    });

    const traces = buildBoundaryRegionTraces({
      variableValuesSi: [0, 10],
      boundaryCurvesSi: [[25, 75]],
      bands: [
        { label: "Lower", color: "#dddddd" },
        { label: "Upper", color: "#eeeeee" },
      ],
      variableAxis: xAxis,
      boundaryAxis: yAxis,
      xAxis,
      yAxis,
      buildTrace: ({ band, polygonX, polygonY, hoverMetadata }) => buildFilledBoundaryRegionTrace({
        name: band.label,
        color: band.color,
        polygonX,
        polygonY,
        lineColor: "#111111",
        hoverMetadata,
      }),
    });

    expect(traces).toHaveLength(2);
    expect(traces[0].x).toEqual([0, 10, 10, 0]);
    expect(traces[0].y).toEqual([0, 0, 75, 25]);
    expect(traces[1].y).toEqual([25, 75, 100, 100]);
  });

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

  it("builds closed boundary polygon traces with axis display conversion", () => {
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
      buildTrace: ({ polygonX, polygonY, hoverMetadata }) => buildFilledBoundaryRegionTrace({
        name: "Region",
        color: "#eeeeee",
        polygonX,
        polygonY,
        lineColor: "#111111",
        hoverMetadata,
      }),
    });

    expect(trace.x).toEqual([32, 50, 50, 32]);
    expect(trace.y).toEqual([20, 30, 90, 80]);
    expect(trace.hoverMetadata).toEqual([[], [], [], []]);
  });

  it("builds reusable zone contour layers with optional boundaries", () => {
    const colorscale = buildZoneColorscale([
      { color: "#ffffff" },
      { color: "#000000" },
    ]);
    const layers = buildZoneContourLayers({
      name: "Zones",
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
    expect(layers).toHaveLength(2);
    expect(layers[0].isBackgroundZone).toBe(true);
    expect(layers[1].name).toBe("Boundaries");
    expect(layers[1].contours?.coloring).toBe("none");
    expect(layers[1].includeText).toBe(false);
  });
});
