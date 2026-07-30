import { describe, expect, it } from "vitest";

import { CalculationSource } from "../../../models/calculationMetadata";
import { FieldKey } from "../../../models/fieldKeys";
import { InputId } from "../../../models/inputSlots";
import { ChartMode, ModelOutputKey } from "../../../models/modelCapabilities";
import { UnitSystem } from "../../../models/units";
import { createFieldAxisScale } from "./axis";
import {
  buildBandedGridFieldChart,
  buildBoundaryRegionFieldChart,
  buildGridContourFieldChart,
  GridBandRenderStrategy,
} from "./chartEngine";
import type { ChartAxisScale } from "./types";

function createLayout(
  title: string,
  xAxis: ChartAxisScale,
  yAxis: ChartAxisScale,
) {
  return {
    title,
    xAxis,
    yAxis,
    paperBgColor: "#ffffff",
    plotBgColor: "#ffffff",
    showLegend: false,
    margin: { l: 0, r: 0, t: 0, b: 0 },
  };
}

describe("shared chart engine", () => {
  it("assembles grid, overlay, and input traces around authoritative axes", () => {
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
    const mismatchedAxis = createFieldAxisScale({
      field: FieldKey.DryBulbTemperature,
      unitSystem: UnitSystem.SI,
      rangeSi: { min: -10, max: 10 },
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
        xAxis: mismatchedAxis,
        yAxis: mismatchedAxis,
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
      layout: createLayout("Grid chart", mismatchedAxis, mismatchedAxis),
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
  });

  it("owns categorical band assignment and selected-output conversion", () => {
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
    const bands = [
      { min: -Infinity, max: 10, label: "Low", color: "#0000ff" },
      { min: 20, max: Infinity, label: "High", color: "#ff0000" },
    ];
    const xValuesSeen: number[] = [];

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
      layout: createLayout("Explore", xAxis, yAxis),
      source: CalculationSource.FrontendGenerated,
    });

    expect(xValuesSeen).toEqual([0, 10, 20]);
    expect(chart.traces[0].z).toEqual([[0, NaN, 1]]);
    expect(chart.traces[0].text).toEqual([["Low", "", "High"]]);
    expect(chart.traces[0].hoverMetadata?.[0]?.[0]).toEqual([32]);
    expect(chart.traces[0].hovertemplate).toContain("Heat Index");
  });

  it("honors a custom hover contract and additional model metadata", () => {
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
      hoverTemplate: "Custom: %{customdata[1]:.1f}<extra></extra>",
      xAxis,
      yAxis,
      evaluateOutput: () => ({
        valueSi: 10,
        additionalHoverMetadata: [123.4],
      }),
      layout: createLayout("Explore", xAxis, yAxis),
      source: CalculationSource.FrontendGenerated,
    });

    expect(chart.traces[0].hoverMetadata?.[0]?.[0]).toEqual([50, 123.4]);
    expect(chart.traces[0].hovertemplate).toBe(
      "Custom: %{customdata[1]:.1f}<extra></extra>",
    );
  });

  it("assembles continuous band traces without a full-grid hover contour", () => {
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
    const bands = [
      { min: -Infinity, max: 0.4, label: "Low", color: "#0000ff" },
      { min: 0.6, max: Infinity, label: "High", color: "#ff0000" },
    ];
    let evaluationCount = 0;

    const chart = buildBandedGridFieldChart({
      config: {
        mode: ChartMode.Explore,
        xField: FieldKey.DryBulbTemperature,
        yField: FieldKey.RelativeHumidity,
        zOutput: ModelOutputKey.Pmv,
        bands,
      },
      output: {
        key: ModelOutputKey.Pmv,
        label: "PMV",
        defaultBands: bands,
      },
      unitSystem: UnitSystem.SI,
      renderStrategy: GridBandRenderStrategy.ConstraintContours,
      xAxis,
      yAxis,
      evaluateOutput: (xSi, ySi) => {
        evaluationCount += 1;
        return xSi + ySi;
      },
      layout: createLayout("Continuous", xAxis, yAxis),
      source: CalculationSource.FrontendGenerated,
    });

    expect(evaluationCount).toBe(4);
    expect(chart.traces.filter((trace) => (
      trace.contours?.type === "constraint" && trace.contours.operation !== "="
    ))).toHaveLength(2);
    expect(chart.traces.filter((trace) => trace.hoveron === "fills")).toHaveLength(2);
    expect(chart.traces.some((trace) => (
      trace.type === "contour" && trace.name.endsWith(" hover")
    ))).toBe(false);
  });

  it("rejects mismatched axes, outputs, and malformed working bands", () => {
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
    const bands = [
      { min: -Infinity, max: Infinity, label: "All", color: "#ffffff" },
    ];
    const baseOptions = {
      config: {
        mode: ChartMode.Explore,
        xField: FieldKey.DryBulbTemperature,
        yField: FieldKey.RelativeHumidity,
        zOutput: ModelOutputKey.Pmv,
        bands,
      },
      output: {
        key: ModelOutputKey.Pmv,
        label: "PMV",
        defaultBands: bands,
      },
      unitSystem: UnitSystem.SI,
      xAxis,
      yAxis,
      evaluateOutput: () => 0,
      layout: createLayout("Explore", xAxis, yAxis),
      source: CalculationSource.FrontendGenerated,
    } as const;

    expect(() => buildBandedGridFieldChart({
      ...baseOptions,
      config: { ...baseOptions.config, xField: FieldKey.MeanRadiantTemperature },
    })).toThrow(/axes must match/i);
    expect(() => buildBandedGridFieldChart({
      ...baseOptions,
      output: { ...baseOptions.output, key: ModelOutputKey.Ppd },
    })).toThrow(/output must match/i);
    expect(() => buildBandedGridFieldChart({
      ...baseOptions,
      config: {
        ...baseOptions.config,
        bands: [
          { min: 0, max: 2, label: "One", color: "#000000" },
          { min: 1, max: 3, label: "Two", color: "#ffffff" },
        ],
      },
    })).toThrow(/invalid bands/i);
  });

  it("orders boundary traces before overlays and input markers", () => {
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
      layout: createLayout("Boundary chart", xAxis, yAxis),
      source: CalculationSource.FrontendGenerated,
    });

    expect(chart.traces.map((trace) => trace.name)).toEqual([
      "Leading",
      "Boundary",
      "Before inputs",
      "Input 1 overlay",
      "Input 1",
    ]);
    expect(chart.traces.at(-1)).toEqual(expect.objectContaining({
      x: [5],
      y: [50],
    }));
  });
});
