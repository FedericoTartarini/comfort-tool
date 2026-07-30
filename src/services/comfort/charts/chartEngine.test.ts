import { describe, expect, it } from "vitest";

import { CalculationSource } from "../../../models/calculationMetadata";
import { FieldKey } from "../../../models/fieldKeys";
import { InputId } from "../../../models/inputSlots";
import { ChartMode, ModelOutputKey } from "../../../models/modelCapabilities";
import { UnitSystem } from "../../../models/units";
import { createFieldAxisScale } from "./axis";
import {
  buildFieldChart,
  buildGridFieldChart,
  createBandedGridStrategy,
  GridBandRenderStrategy,
} from "./chartEngine";

function createLayout(title: string) {
  return {
    title,
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
    const xValuesSeen: number[] = [];

    const chart = buildGridFieldChart({
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
      layout: createLayout("Grid chart"),
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
      rangeSi: { min: 0, max: 30 },
      points: 4,
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

    const chart = buildGridFieldChart({
      xAxis,
      yAxis,
      grid: createBandedGridStrategy({
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
          return xSi === 30 ? null : xSi;
        },
      }),
      layout: createLayout("Explore"),
      source: CalculationSource.FrontendGenerated,
    });

    expect(xValuesSeen).toEqual([0, 10, 20, 30]);
    expect(chart.traces[0].z).toEqual([[0, NaN, 1, NaN]]);
    expect(chart.traces[0].hoverinfo).toBe("skip");
    const tooltipTrace = chart.traces.find(({ name }) => name === "Heat Index bands hover");
    expect(tooltipTrace?.z).toEqual([[0, 10, 20, NaN]]);
    expect(tooltipTrace?.text).toEqual([["Low", "Unclassified", "High", ""]]);
    const hoverMetadata = tooltipTrace?.hoverMetadata as unknown[][][];
    expect(hoverMetadata[0][0]).toEqual([32]);
    expect(hoverMetadata[0][3]).toEqual([]);
    expect(tooltipTrace?.hovertemplate).toContain("Heat Index");
    expect(tooltipTrace?.hoverongaps).toBe(false);
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

    const chart = buildGridFieldChart({
      xAxis,
      yAxis,
      grid: createBandedGridStrategy({
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
      }),
      layout: createLayout("Explore"),
      source: CalculationSource.FrontendGenerated,
    });

    const tooltipTrace = chart.traces.find(({ name }) => name === "Heat Index bands hover");
    const hoverMetadata = tooltipTrace?.hoverMetadata as unknown[][][];
    expect(hoverMetadata[0][0]).toEqual([50, 123.4]);
    expect(tooltipTrace?.hovertemplate).toBe(
      "Custom: %{customdata[1]:.1f}<extra></extra>",
    );
  });

  it("assembles continuous bands with one raw-grid tooltip contour", () => {
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

    const chart = buildGridFieldChart({
      xAxis,
      yAxis,
      grid: createBandedGridStrategy({
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
      }),
      layout: createLayout("Continuous"),
      source: CalculationSource.FrontendGenerated,
    });

    expect(evaluationCount).toBe(4);
    expect(chart.traces.filter((trace) => (
      trace.contours?.type === "constraint" && trace.contours.operation !== "="
    ))).toHaveLength(2);
    expect(chart.traces.filter((trace) => trace.hoveron === "fills")).toHaveLength(0);
    const tooltipTraces = chart.traces.filter((trace) => (
      trace.type === "contour" && trace.name.endsWith(" hover")
    ));
    expect(tooltipTraces).toHaveLength(1);
    expect(tooltipTraces[0].z).toEqual([[0, 1], [1, 2]]);
    expect(tooltipTraces[0].hoverongaps).toBe(false);
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

    const chart = buildFieldChart({
      xAxis,
      yAxis,
      leadingTraces: [{
        type: "scatter",
        mode: "lines",
        name: "Leading",
        x: [],
        y: [],
      }],
      strategyTraces: [{
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
      layout: createLayout("Boundary chart"),
      source: CalculationSource.FrontendGenerated,
    });

    expect(chart.traces.map((trace) => trace.name)).toEqual([
      "Leading",
      "Boundary",
      "Before inputs",
      "Input 1 overlay",
      "Input 1",
    ]);
    expect(chart.traces[chart.traces.length - 1]).toEqual(expect.objectContaining({
      x: [5],
      y: [50],
    }));
  });
});
