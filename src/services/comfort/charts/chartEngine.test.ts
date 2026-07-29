import { describe, expect, it } from "vitest";

import { CalculationSource } from "../../../models/calculationMetadata";
import { FieldKey } from "../../../models/fieldKeys";
import { InputId } from "../../../models/inputSlots";
import { ChartMode, ModelOutputKey } from "../../../models/modelCapabilities";
import { UnitSystem } from "../../../models/units";
import { buildAxisValues, createFieldAxisScale } from "./axis";
import {
  buildBoundaryRegionTraces,
  buildClosedBoundaryPolygon,
  buildClosedBoundaryPolygonTrace,
  buildFilledBoundaryRegionTrace,
} from "./boundaryRegionEngine";
import {
  buildBandedGridFieldChart,
  buildBoundaryRegionFieldChart,
  buildGridContourFieldChart,
} from "./chartEngine";
import { evaluateGrid } from "./gridEngine";
import { buildInputTraceGroups, resolveBaselineInputEntry } from "./inputPoints";
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

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid axis point count %s",
    (points) => {
      const axis = createFieldAxisScale({
        field: FieldKey.DryBulbTemperature,
        unitSystem: UnitSystem.SI,
        rangeSi: { min: 0, max: 1 },
        points,
      });

      expect(() => buildAxisValues(axis)).toThrow(
        `Axis points must be a positive integer; received ${points}`,
      );
    },
  );

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

  it("preserves scalar and tuple grid hover metadata shapes", () => {
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
      points: 1,
    });

    const grid = evaluateGrid({
      xAxis,
      yAxis,
      evaluatePoint: (xSi, ySi) => ({
        z: xSi + ySi,
        hoverMetadata: xSi === 0 ? 12.5 : [xSi, ySi],
      }),
    });

    expect(grid.hoverMetadata[0][0]).toBe(12.5);
    expect(grid.hoverMetadata[0][1]).toEqual([1, 0]);
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

    const traces = buildInputTraceGroups({
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
    const mismatchedXAxis = createFieldAxisScale({
      field: FieldKey.DryBulbTemperature,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: -10, max: 10 },
      points: 3,
    });
    const mismatchedYAxis = createFieldAxisScale({
      field: FieldKey.DryBulbTemperature,
      unitSystem: UnitSystem.IP,
      rangeSi: { min: 10, max: 20 },
      points: 3,
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
        xAxis: mismatchedXAxis,
        yAxis: mismatchedYAxis,
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
        xAxis: mismatchedXAxis,
        yAxis: mismatchedYAxis,
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
    expect(chart.layout.xaxis.range).toEqual([32, 212]);
    expect(chart.layout.yaxis.range).toEqual([0, 100]);
    expect(String(chart.layout.xaxis.title)).toContain("°F");
  });

  it("drives categorical grid cells from selected output and working bands", () => {
    const xAxis = createFieldAxisScale({
      field: FieldKey.DryBulbTemperature,
      unitSystem: UnitSystem.IP,
      rangeSi: { min: 0, max: 20 },
      points: 3,
    });
    const yAxis = createFieldAxisScale({
      field: FieldKey.RelativeHumidity,
      unitSystem: UnitSystem.IP,
      rangeSi: { min: 50, max: 50 },
      points: 1,
    });
    const xValuesSeen: number[] = [];
    const bands = [
      { min: -Infinity, max: 10, label: "Low", color: "#0000ff" },
      { min: 20, max: Infinity, label: "High", color: "#ff0000" },
    ];

    const chart = buildBandedGridFieldChart({
      config: {
        mode: ChartMode.Explore,
        xField: FieldKey.DryBulbTemperature,
        yField: FieldKey.RelativeHumidity,
        zOutput: ModelOutputKey.HeatIndex,
        bands,
      },
      output: {
        key: ModelOutputKey.HeatIndex,
        label: "Heat Index",
        defaultBands: bands,
      },
      unitSystem: UnitSystem.IP,
      xAxis,
      yAxis,
      evaluateOutput: (xSi, _ySi, zOutput) => {
        xValuesSeen.push(xSi);
        expect(zOutput).toBe(ModelOutputKey.HeatIndex);
        return xSi;
      },
      layout: {
        title: "Explore",
        xAxis,
        yAxis,
        paperBgColor: "#fff",
        plotBgColor: "#fff",
        showLegend: false,
        margin: { l: 0, r: 0, t: 0, b: 0 },
      },
      source: CalculationSource.FrontendGenerated,
    });

    expect(xValuesSeen).toEqual([0, 10, 20]);
    expect(chart.traces[0].z).toEqual([[0, NaN, 1]]);
    expect(chart.traces[0].text).toEqual([["Low", "", "High"]]);
    expect(chart.traces[0].hoverMetadata?.[0]?.[0]).toEqual([32]);
    expect(chart.traces[0].colorscale).toEqual([
      [0, "#0000ff"],
      [0.5, "#0000ff"],
      [0.5, "#ff0000"],
      [1, "#ff0000"],
    ]);
    expect(chart.traces[0].hovertemplate).toContain("Heat Index");
  });

  it("appends declared hover metadata after the selected display output", () => {
    const xAxis = createFieldAxisScale({
      field: FieldKey.DryBulbTemperature,
      unitSystem: UnitSystem.IP,
      rangeSi: { min: 10, max: 10 },
      points: 1,
    });
    const yAxis = createFieldAxisScale({
      field: FieldKey.RelativeHumidity,
      unitSystem: UnitSystem.IP,
      rangeSi: { min: 50, max: 50 },
      points: 1,
    });
    const bands = [
      { min: -Infinity, max: Infinity, label: "All", color: "#ffffff" },
    ];

    const chart = buildBandedGridFieldChart({
      config: {
        mode: ChartMode.Explore,
        xField: FieldKey.DryBulbTemperature,
        yField: FieldKey.RelativeHumidity,
        zOutput: ModelOutputKey.HeatIndex,
        bands,
      },
      output: {
        key: ModelOutputKey.HeatIndex,
        label: "Heat Index",
        defaultBands: bands,
      },
      unitSystem: UnitSystem.IP,
      bandLabel: "Risk",
      hoverTemplateSuffix: "<br>Extra: %{customdata[1]:.1f}",
      xAxis,
      yAxis,
      evaluateOutput: () => ({
        valueSi: 10,
        additionalHoverMetadata: [123.4],
      }),
      layout: {
        title: "Explore",
        xAxis,
        yAxis,
        paperBgColor: "#fff",
        plotBgColor: "#fff",
        showLegend: false,
        margin: { l: 0, r: 0, t: 0, b: 0 },
      },
      source: CalculationSource.FrontendGenerated,
    });

    expect(chart.traces[0].hoverMetadata?.[0]?.[0]).toEqual([50, 123.4]);
    expect(chart.traces[0].hovertemplate).toContain("<b>Risk: %{text}</b>");
    expect(chart.traces[0].hovertemplate).toContain("Extra: %{customdata[1]:.1f}");
  });

  it("supports one band and rejects malformed FieldChartConfig values", () => {
    const xAxis = createFieldAxisScale({
      field: FieldKey.DryBulbTemperature,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: 0, max: 1 },
      points: 1,
    });
    const yAxis = createFieldAxisScale({
      field: FieldKey.RelativeHumidity,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: 0, max: 1 },
      points: 1,
    });
    const output = {
      key: ModelOutputKey.Pmv,
      label: "PMV",
      defaultBands: [{ min: -Infinity, max: Infinity, label: "All", color: "#fff" }],
    } as const;
    const baseOptions = {
      output,
      unitSystem: UnitSystem.SI,
      xAxis,
      yAxis,
      evaluateOutput: () => 0,
      layout: {
        title: "Explore",
        xAxis,
        yAxis,
        paperBgColor: "#fff",
        plotBgColor: "#fff",
        showLegend: false,
        margin: { l: 0, r: 0, t: 0, b: 0 },
      },
      source: CalculationSource.FrontendGenerated,
    };
    const chart = buildBandedGridFieldChart({
      ...baseOptions,
      config: {
        mode: ChartMode.Explore,
        xField: FieldKey.DryBulbTemperature,
        yField: FieldKey.RelativeHumidity,
        zOutput: ModelOutputKey.Pmv,
        bands: output.defaultBands,
      },
    });

    expect(chart.traces).toHaveLength(1);
    expect(chart.traces[0].z).toEqual([[0]]);
    expect(() => buildBandedGridFieldChart({
      ...baseOptions,
      config: {
        mode: ChartMode.Explore,
        xField: FieldKey.DryBulbTemperature,
        yField: FieldKey.RelativeHumidity,
        zOutput: ModelOutputKey.Pmv,
        bands: [
          { min: 0, max: 2, label: "One", color: "#000" },
          { min: 1, max: 3, label: "Two", color: "#fff" },
        ],
      },
    })).toThrow(/invalid bands/i);
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

  it("builds boundary regions when the boundary variable is on the y-axis", () => {
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
      variableValuesSi: [0, 100],
      boundaryCurvesSi: [[-5, 15]],
      bands: [
        { label: "Left", color: "#dddddd" },
        { label: "Right", color: "#eeeeee" },
      ],
      variableAxis: yAxis,
      boundaryAxis: xAxis,
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
    expect(traces[0].x).toEqual([0, 0, 10, 0]);
    expect(traces[0].y).toEqual([0, 100, 100, 0]);
    expect(traces[1].x).toEqual([0, 10, 10, 10]);
    expect(traces[1].y).toEqual([0, 100, 100, 0]);
  });

  it("rejects boundary curves with mismatched band or variable dimensions", () => {
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
    const buildTrace = ({
      band,
      polygonX,
      polygonY,
    }: {
      band: { label: string; color: string };
      polygonX: number[];
      polygonY: number[];
    }) => buildFilledBoundaryRegionTrace({
      name: band.label,
      color: band.color,
      polygonX,
      polygonY,
      lineColor: "#111111",
    });

    expect(() => buildBoundaryRegionTraces({
      variableValuesSi: [0, 10],
      boundaryCurvesSi: [[25, 75]],
      bands: [
        { label: "Lower", color: "#dddddd" },
        { label: "Middle", color: "#eeeeee" },
        { label: "Upper", color: "#ffffff" },
      ],
      variableAxis: xAxis,
      boundaryAxis: yAxis,
      xAxis,
      yAxis,
      buildTrace,
    })).toThrow("Boundary curves must match the band and variable dimensions");

    expect(() => buildBoundaryRegionTraces({
      variableValuesSi: [0, 10],
      boundaryCurvesSi: [[25]],
      bands: [
        { label: "Lower", color: "#dddddd" },
        { label: "Upper", color: "#eeeeee" },
      ],
      variableAxis: xAxis,
      boundaryAxis: yAxis,
      xAxis,
      yAxis,
      buildTrace,
    })).toThrow("Boundary curves must match the band and variable dimensions");
  });

  it("rejects inverted adjacent boundary curves", () => {
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

    expect(() => buildBoundaryRegionTraces({
      variableValuesSi: [0, 10],
      boundaryCurvesSi: [[60, 40], [50, 70]],
      bands: [
        { label: "Lower", color: "#dddddd" },
        { label: "Middle", color: "#eeeeee" },
        { label: "Upper", color: "#ffffff" },
      ],
      variableAxis: xAxis,
      boundaryAxis: yAxis,
      xAxis,
      yAxis,
      buildTrace: ({ band, polygonX, polygonY }) => buildFilledBoundaryRegionTrace({
        name: band.label,
        color: band.color,
        polygonX,
        polygonY,
        lineColor: "#111111",
      }),
    })).toThrow("Boundary curves must be ordered at every variable point");
  });

  it("builds boundary region hover metadata from SI values without reverse display conversion", () => {
    const xAxis = createFieldAxisScale({
      field: FieldKey.DryBulbTemperature,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: 0, max: 10 },
      points: 2,
      toDisplay: (valueSi) => valueSi + 1000,
      toSi: () => Number.NaN,
    });
    const yAxis = createFieldAxisScale({
      field: FieldKey.RelativeHumidity,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: 0, max: 100 },
      points: 2,
      toDisplay: (valueSi) => valueSi + 2000,
      toSi: () => Number.NaN,
    });

    const traces = buildBoundaryRegionTraces({
      variableValuesSi: [20, 80],
      boundaryCurvesSi: [[-5, 15]],
      bands: [
        { label: "Left", color: "#dddddd" },
        { label: "Right", color: "#eeeeee" },
      ],
      variableAxis: yAxis,
      boundaryAxis: xAxis,
      xAxis,
      yAxis,
      getHoverMetadata: (xSi, ySi, index) => [xSi, ySi, index],
      buildTrace: ({ band, polygonX, polygonY, hoverMetadata }) => buildFilledBoundaryRegionTrace({
        name: band.label,
        color: band.color,
        polygonX,
        polygonY,
        lineColor: "#111111",
        hoverMetadata,
      }),
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

  it("orders boundary strategy traces before pre-input overlays and input markers", () => {
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
    const mismatchedXAxis = createFieldAxisScale({
      field: FieldKey.DryBulbTemperature,
      unitSystem: UnitSystem.IP,
      rangeSi: { min: 10, max: 20 },
      points: 3,
    });
    const mismatchedYAxis = createFieldAxisScale({
      field: FieldKey.DryBulbTemperature,
      unitSystem: UnitSystem.IP,
      rangeSi: { min: 10, max: 20 },
      points: 3,
    });

    const chart = buildBoundaryRegionFieldChart({
      leadingTraces: [{
        type: "scatter",
        mode: "lines",
        name: "Leading",
        x: [],
        y: [],
      }],
      boundaryTraces: [{
        type: "scatter",
        mode: "lines",
        name: "Boundary",
        x: [],
        y: [],
      }],
      beforeInputTraces: [{
        type: "scatter",
        mode: "lines",
        name: "Before inputs",
        x: [],
        y: [],
      }],
      inputGroups: [{
        inputsMap: {
          [InputId.Input1]: { tdb: 5, rh: 50 },
        },
        xAxis: mismatchedXAxis,
        yAxis: mismatchedYAxis,
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
        title: "Boundary chart",
        xAxis,
        yAxis,
        paperBgColor: "#ffffff",
        plotBgColor: "#ffffff",
        showLegend: false,
        margin: { l: 0, r: 0, t: 0, b: 0 },
      },
      source: CalculationSource.FrontendGenerated,
    });

    expect(chart.traces.map((trace) => trace.name)).toEqual([
      "Leading",
      "Boundary",
      "Before inputs",
      "Input 1 overlay",
      "Input 1",
    ]);
    expect(chart.traces[4].x).toEqual([5]);
    expect(chart.traces[4].y).toEqual([50]);
    expect(chart.layout.xaxis.range).toEqual([0, 10]);
    expect(chart.layout.yaxis.range).toEqual([0, 100]);
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

  it("rejects an empty zone colorscale configuration", () => {
    expect(() => buildZoneColorscale([])).toThrow(
      "At least one zone is required to build a colorscale",
    );
  });
});
