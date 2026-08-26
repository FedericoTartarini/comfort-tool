import { describe, expect, it } from "vitest";

import {
  pmvAshraeDeclaration,
  pmvAshraeModelConfig,
} from "../../../comfortModels/pmv/pmvAshrae";
import { CalculationSource } from "../../../models/calculationMetadata";
import type { PlotTrace } from "../../plotlyTypes";
import { PhysicalQuantityId } from "../../../models/physicalQuantities";
import { InputId } from "../../../models/inputSlots";
import {
  ModelOutputKey,
  type NumericComplianceFieldChartConfig,
} from "../../../models/modelCapabilities";
import { FieldChartProfileKind } from "../../../models/output/fieldChartProfile";
import { UnitSystem } from "../../../models/units";
import {
  buildFieldChart,
  createBandedGridStrategy,
  GridBandRenderStrategy,
} from "./fieldChartEngine";
import { resolveInteractiveDynamicGridPoints } from "./types";

interface TestPayload {
  tdb: number;
  rh: number;
}

interface TestResult {
  category: string;
}

const layout = {
  title: "Field chart",
  margin: { l: 0, r: 0, t: 0, b: 0 },
};

function lineTrace(
  name: string,
  x: number[] = [],
  y: number[] = [],
): PlotTrace {
  return { type: "scatter", mode: "lines", name, x, y };
}

describe("shared chart engine", () => {
  it("accepts PMV numeric Compliance bands without a cast", () => {
    const complianceProfile = pmvAshraeDeclaration.complianceProfile;
    const output = pmvAshraeModelConfig.exploreOutputs.find(
      ({ key }) => key === complianceProfile?.output,
    );
    if (!complianceProfile || !output) {
      throw new Error(
        "PMV must declare a chartable numeric Compliance output.",
      );
    }
    const config: NumericComplianceFieldChartConfig = {
      profileKind: FieldChartProfileKind.Compliance,
      xField: PhysicalQuantityId.DryBulbTemperature,
      yField: PhysicalQuantityId.RelativeHumidity,
      zOutput: complianceProfile.output,
      bands: complianceProfile.bands,
    };

    const strategy = createBandedGridStrategy({
      config,
      output,
      evaluateOutput: () => 0,
    });

    expect(strategy.kind).toBe("grid");
  });

  it("evaluates a canonical-SI grid and orders overlays before multi-input markers", () => {
    const xValuesSeen: number[] = [];
    const chart = buildFieldChart<TestPayload, TestResult>({
      unitSystem: UnitSystem.IP,
      xAxis: {
        field: PhysicalQuantityId.DryBulbTemperature,
        rangeSi: { min: 0, max: 100 },
        points: 2,
      },
      yAxis: {
        field: PhysicalQuantityId.RelativeHumidity,
        rangeSi: { min: 0, max: 100 },
        points: 2,
      },
      strategy: {
        kind: "grid",
        evaluatePoint: (xSi, ySi) => {
          xValuesSeen.push(xSi);
          return { z: xSi + ySi, text: "grid" };
        },
        renderTraces: (grid) => [
          {
            type: "contour",
            name: "Grid",
            x: grid.xValues,
            y: grid.yValues,
            z: grid.zValues,
            text: grid.textValues,
            contours: { type: "levels" },
            hovertemplate: "%{text}<extra></extra>",
          },
        ],
      },
      chartOverlays: () => [lineTrace("Chart overlay")],
      inputGroups: () => [
        {
          inputsMap: {
            [InputId.Input1]: { tdb: 25, rh: 50 },
            [InputId.Input2]: { tdb: 30, rh: 60 },
          },
          getXSi: (payload) => payload.tdb,
          getYSi: (payload) => payload.rh,
          buildOverlayTraces: ({ inputLabel, xDisplay, yDisplay }) => [
            lineTrace(`${inputLabel} overlay`, [xDisplay], [yDisplay]),
          ],
          getHovertemplate: ({ inputLabel }) => `${inputLabel}<extra></extra>`,
        },
      ],
      layout,
      source: CalculationSource.FrontendGenerated,
    });

    expect(xValuesSeen).toEqual([0, 100, 0, 100]);
    expect(chart.traces.map(({ name }) => name)).toEqual([
      "Grid",
      "Chart overlay",
      "Input 1 overlay",
      "Input 2 overlay",
      "Input 1",
      "Input 2",
    ]);
    expect(chart.traces[4].x).toEqual([77]);
    expect(chart.traces[5].x).toEqual([86]);
    expect(chart.layout.xaxis.range).toEqual([32, 212]);
    expect(chart.layout.yaxis.range).toEqual([0, 100]);
    expect(chart.layout.showlegend).toBe(true);
    expect(chart.layout.height).toBe(480);
  });

  it("renders categorical bands, gaps, and IP output conversion", () => {
    const bands = [
      { min: -Infinity, max: 10, label: "Low", color: "#0000ff" },
      { min: 20, max: Infinity, label: "High", color: "#ff0000" },
    ];
    const xValuesSeen: number[] = [];
    const chart = buildFieldChart({
      unitSystem: UnitSystem.IP,
      xAxis: {
        field: PhysicalQuantityId.DryBulbTemperature,
        rangeSi: { min: 0, max: 30 },
        points: 4,
      },
      yAxis: {
        field: PhysicalQuantityId.RelativeHumidity,
        rangeSi: { min: 50, max: 50 },
        points: 1,
      },
      strategy: createBandedGridStrategy({
        config: {
          xField: PhysicalQuantityId.DryBulbTemperature,
          yField: PhysicalQuantityId.RelativeHumidity,
          zOutput: ModelOutputKey.HeatIndex,
          bands,
        },
        output: {
          key: ModelOutputKey.HeatIndex,
          label: "Heat Index",
          defaultBands: bands,
        },
        evaluateOutput: (xSi, _ySi, zOutput) => {
          xValuesSeen.push(xSi);
          expect(zOutput).toBe(ModelOutputKey.HeatIndex);
          return xSi === 30 ? null : xSi;
        },
      }),
      layout,
      source: CalculationSource.FrontendGenerated,
    });

    expect(xValuesSeen).toEqual([0, 10, 20, 30]);
    expect(chart.traces[0].z).toEqual([[0, NaN, 1, NaN]]);
    expect(chart.traces[0].hoverinfo).toBe("skip");
    const tooltip = chart.traces.find(
      ({ name }) => name === "Heat Index bands hover",
    );
    expect(tooltip?.z).toEqual([[32, 50, 68, NaN]]);
    expect(tooltip?.text).toEqual([["Low", "Unclassified", "High", ""]]);
    expect(tooltip?.hoverMetadata).toBeUndefined();
    expect(tooltip?.hovertemplate).toContain("%{z:");
    expect(tooltip?.hoverongaps).toBe(false);
  });

  it("projects band fills without removing gaps from the hover grid", () => {
    const bands = [{ min: 0, max: 1, label: "Target", color: "#00ff00" }];
    let evaluatedGridGap = false;
    const chart = buildFieldChart({
      unitSystem: UnitSystem.SI,
      xAxis: {
        field: PhysicalQuantityId.DryBulbTemperature,
        rangeSi: { min: 0, max: 1 },
        points: 2,
      },
      yAxis: {
        field: PhysicalQuantityId.RelativeHumidity,
        rangeSi: { min: 50, max: 50 },
        points: 1,
      },
      strategy: createBandedGridStrategy({
        config: {
          xField: PhysicalQuantityId.DryBulbTemperature,
          yField: PhysicalQuantityId.RelativeHumidity,
          zOutput: ModelOutputKey.HeatIndex,
          bands,
        },
        output: {
          key: ModelOutputKey.HeatIndex,
          label: "Heat Index",
          defaultBands: bands,
        },
        renderStrategy: GridBandRenderStrategy.ConstraintContours,
        evaluateOutput: (xSi) => (xSi === 1 ? null : 0.5),
        projectFillGrid: (grid) => {
          evaluatedGridGap = Number.isNaN(grid.zValues[0][1]);
          return {
            ...grid,
            zValues: grid.zValues.map((row) =>
              row.map((value) => (Number.isNaN(value) ? 0.5 : value)),
            ),
          };
        },
      }),
      layout,
      source: CalculationSource.FrontendGenerated,
    });

    const fill = chart.traces.find(
      ({ contours }) =>
        contours?.type === "constraint" && contours.operation !== "=",
    );
    const tooltip = chart.traces.find(
      ({ name }) => name === "Heat Index bands hover",
    );

    expect(evaluatedGridGap).toBe(true);
    expect(fill?.z).toEqual([[0.5, 0.5]]);
    expect(tooltip?.z).toEqual([[0.5, NaN]]);
    expect(tooltip?.hoverMetadata).toBeUndefined();
  });

  it("preserves custom hover metadata in a banded grid", () => {
    const bands = [
      { min: -Infinity, max: Infinity, label: "All", color: "#ffffff" },
    ];
    const chart = buildFieldChart({
      unitSystem: UnitSystem.IP,
      xAxis: {
        field: PhysicalQuantityId.DryBulbTemperature,
        rangeSi: { min: 10, max: 10 },
        points: 1,
      },
      yAxis: {
        field: PhysicalQuantityId.RelativeHumidity,
        rangeSi: { min: 50, max: 50 },
        points: 1,
      },
      strategy: createBandedGridStrategy({
        config: {
          xField: PhysicalQuantityId.DryBulbTemperature,
          yField: PhysicalQuantityId.RelativeHumidity,
          zOutput: ModelOutputKey.HeatIndex,
          bands,
        },
        output: {
          key: ModelOutputKey.HeatIndex,
          label: "Heat Index",
          defaultBands: bands,
        },
        hoverTemplate: "Custom: %{customdata[1]:.1f}<extra></extra>",
        evaluateOutput: () => ({
          valueSi: 10,
          additionalHoverMetadata: [123.4],
        }),
      }),
      layout,
      source: CalculationSource.FrontendGenerated,
    });

    const tooltip = chart.traces.find(
      ({ name }) => name === "Heat Index bands hover",
    );
    expect((tooltip?.hoverMetadata as unknown[][][])[0][0]).toEqual([
      50, 123.4,
    ]);
    expect(tooltip?.hovertemplate).toBe(
      "Custom: %{customdata[1]:.1f}<extra></extra>",
    );
  });

  it("renders continuous constraints from one SI evaluation grid", () => {
    const bands = [
      { min: -Infinity, max: 0.4, label: "Low", color: "#0000ff" },
      { min: 0.6, max: Infinity, label: "High", color: "#ff0000" },
    ];
    let evaluationCount = 0;
    const chart = buildFieldChart({
      unitSystem: UnitSystem.SI,
      xAxis: {
        field: PhysicalQuantityId.DryBulbTemperature,
        rangeSi: { min: 0, max: 1 },
        points: 2,
      },
      yAxis: {
        field: PhysicalQuantityId.RelativeHumidity,
        rangeSi: { min: 0, max: 1 },
        points: 2,
      },
      strategy: createBandedGridStrategy({
        config: {
          xField: PhysicalQuantityId.DryBulbTemperature,
          yField: PhysicalQuantityId.RelativeHumidity,
          zOutput: ModelOutputKey.Pmv,
          bands,
        },
        output: {
          key: ModelOutputKey.Pmv,
          label: "PMV",
          defaultBands: bands,
        },
        renderStrategy: GridBandRenderStrategy.ConstraintContours,
        evaluateOutput: (xSi, ySi) => {
          evaluationCount += 1;
          return xSi + ySi;
        },
      }),
      layout,
      source: CalculationSource.FrontendGenerated,
    });

    expect(evaluationCount).toBe(4);
    expect(
      chart.traces.filter(
        (trace) =>
          trace.contours?.type === "constraint" &&
          trace.contours.operation !== "=",
      ),
    ).toHaveLength(2);
    const tooltips = chart.traces.filter(
      (trace) => trace.type === "contour" && trace.name.endsWith(" hover"),
    );
    expect(tooltips).toHaveLength(1);
    expect(tooltips[0].z).toEqual([
      [0, 1],
      [1, 2],
    ]);
    expect(tooltips[0].hoverongaps).toBe(false);
  });

  it("builds boundary traces from render context before chart and input overlays", () => {
    const chart = buildFieldChart<TestPayload, never>({
      unitSystem: UnitSystem.IP,
      xAxis: {
        field: PhysicalQuantityId.DryBulbTemperature,
        rangeSi: { min: 0, max: 10 },
        points: 2,
      },
      yAxis: {
        field: PhysicalQuantityId.RelativeHumidity,
        rangeSi: { min: 0, max: 100 },
        points: 2,
      },
      strategy: {
        kind: "boundary",
        buildTraces: ({ xAxis, unitSystem }) => {
          expect(unitSystem).toBe(UnitSystem.IP);
          return [lineTrace("Boundary", [xAxis.toDisplay(0)], [0])];
        },
      },
      chartOverlays: () => [lineTrace("Chart overlay")],
      inputGroups: () => [
        {
          inputsMap: {
            [InputId.Input1]: { tdb: 5, rh: 50 },
          },
          getXSi: (payload) => payload.tdb,
          getYSi: (payload) => payload.rh,
          buildOverlayTraces: ({ inputLabel }) => [
            lineTrace(`${inputLabel} overlay`),
          ],
          getHovertemplate: ({ inputLabel }) => `${inputLabel}<extra></extra>`,
        },
      ],
      layout,
      source: CalculationSource.FrontendGenerated,
    });

    expect(chart.traces.map(({ name }) => name)).toEqual([
      "Boundary",
      "Chart overlay",
      "Input 1 overlay",
      "Input 1",
    ]);
    expect(chart.traces[0].x).toEqual([32]);
    expect(chart.traces[3]).toEqual(
      expect.objectContaining({
        x: [41],
        y: [50],
      }),
    );
  });
});

describe("interactive Dynamic grid cap", () => {
  it("defaults to 100 and clamps higher 2-D requests", () => {
    expect(resolveInteractiveDynamicGridPoints()).toBe(100);
    expect(resolveInteractiveDynamicGridPoints(31)).toBe(31);
    expect(resolveInteractiveDynamicGridPoints(450)).toBe(100);
  });
});
