import { describe, expect, it } from "vitest";

import {
  ChartMode,
  ModelOutputKey,
  type ChartBuildContext,
} from "../models/modelCapabilities";
import { FieldKey } from "../models/fieldKeys";
import { InputId } from "../models/inputSlots";
import { UnitSystem } from "../models/units";
import {
  buildUtciDynamicChart,
  buildUtciStressChart,
  calculateUtci,
  getUtciZoneMeta,
  utciModelConfig,
} from "./utci";

describe("UTCI stress zones", () => {
  it.each([
    [-40, "Very Strong Cold Stress"],
    [-27, "Strong Cold Stress"],
    [-13, "Moderate Cold Stress"],
    [0, "Slight Cold Stress"],
    [9, "No Thermal Stress"],
    [26, "Moderate Heat Stress"],
    [32, "Strong Heat Stress"],
    [38, "Very Strong Heat Stress"],
    [46, "Extreme Heat Stress"],
  ] as const)("assigns the exact %s °C boundary to %s", (value, expectedLabel) => {
    expect(getUtciZoneMeta(value).label).toBe(expectedLabel);
  });

  it("derives the reported category from the calculated UTCI value", () => {
    const result = calculateUtci({
      tdb: 25,
      tr: 25,
      v: 1,
      rh: 50,
    });

    expect(result.stressCategory).toBe(getUtciZoneMeta(result.utci).category);
  });
});

describe("UTCI Explore chart", () => {
  it("applies edited bands and preserves gaps in the fixed stress strip", () => {
    const request = { tdb: 25, tr: 25, v: 1, rh: 50 };
    const result = calculateUtci(request);
    const bands = [
      {
        min: -Infinity,
        max: result.utci,
        label: "Below marker",
        color: "#123456",
      },
      {
        min: result.utci,
        max: result.utci + 1,
        label: "Marker band",
        color: "#abcdef",
      },
      {
        min: result.utci + 2,
        max: Infinity,
        label: "Above gap",
        color: "#fedcba",
      },
    ];
    const chart = buildUtciStressChart(
      { inputs: { [InputId.Input1]: request } },
      { [InputId.Input1]: result },
      {
        unitSystem: UnitSystem.SI,
        dynamicAxes: utciModelConfig.defaultDynamicAxes,
        baselineInputId: InputId.Input1,
        fieldChartConfig: {
          mode: ChartMode.Explore,
          xField: FieldKey.DryBulbTemperature,
          yField: FieldKey.RelativeHumidity,
          zOutput: ModelOutputKey.Utci,
          bands,
        },
      },
    );
    const fillTrace = chart.traces.find(({ name }) => name === "UTCI bands");
    const hoverTrace = chart.traces.find(
      ({ name }) => name === "UTCI bands hover",
    );
    const inputTrace = chart.traces.find(({ name }) => name === "Input 1");
    const gapIndex = fillTrace?.x.findIndex((value) => (
      value > result.utci + 1 && value < result.utci + 2
    )) ?? -1;

    expect(gapIndex).toBeGreaterThanOrEqual(0);
    expect(fillTrace?.z?.every((row) => Number.isNaN(row[gapIndex]))).toBe(true);
    expect(hoverTrace?.text?.every((row) => row[gapIndex] === "Unclassified"))
      .toBe(true);
    expect(fillTrace?.colorscale?.map(([, color]) => color))
      .toEqual(expect.arrayContaining(["#123456", "#abcdef", "#fedcba"]));
    expect(inputTrace?.hovertemplate).toContain("Marker band");
    expect(chart.annotations.map(({ text }) => text))
      .toEqual(expect.arrayContaining(["Below marker", "Marker band", "Above gap"]));
  });

  it("uses its declared raw output and working bands", () => {
    const request = { tdb: 25, tr: 25, v: 1, rh: 50 };
    const result = calculateUtci(request);
    const chart = buildUtciDynamicChart(
      { inputs: { [InputId.Input1]: request } },
      { [InputId.Input1]: result },
      {
        unitSystem: UnitSystem.SI,
        dynamicAxes: utciModelConfig.defaultDynamicAxes,
        baselineInputId: InputId.Input1,
        fieldChartConfig: {
          mode: ChartMode.Explore,
          xField: FieldKey.DryBulbTemperature,
          yField: FieldKey.RelativeHumidity,
          zOutput: ModelOutputKey.Utci,
          bands: utciModelConfig.chartableOutputs[0].defaultBands,
        },
      },
    );

    const tooltipTrace = chart.traces.find(({ name }) => name === "UTCI bands hover");
    expect(tooltipTrace?.type).toBe("contour");
    expect(tooltipTrace?.z).toHaveLength(450);
    expect(tooltipTrace?.z?.[0]).toHaveLength(450);
    expect(tooltipTrace?.hovertemplate).toContain("UTCI");
    expect(tooltipTrace?.hoverongaps).toBe(false);
    expect(chart.traces.filter(({ hoveron }) => hoveron === "fills")).toHaveLength(0);
    expect(chart.traces.some((trace) => trace.type === "scatter")).toBe(true);
  });

  it("builds a coupled FieldChartConfig with finite resolved cells", () => {
    const request = { tdb: 25, tr: 25, v: 1, rh: 50 };
    const context = {
      unitSystem: UnitSystem.SI,
      dynamicAxes: {
        xAxis: FieldKey.DryBulbTemperature,
        yAxis: FieldKey.OperativeTemperature,
      },
      baselineInputId: InputId.Input1,
      fieldChartConfig: {
        mode: ChartMode.Explore,
        xField: FieldKey.DryBulbTemperature,
        yField: FieldKey.OperativeTemperature,
        zOutput: ModelOutputKey.Utci,
        bands: utciModelConfig.chartableOutputs[0].defaultBands,
      },
    } satisfies ChartBuildContext;
    const chart = buildUtciDynamicChart(
      { inputs: { [InputId.Input1]: request } },
      {},
      context,
    );

    const contour = chart.traces.find((trace) => trace.type === "contour");
    expect(chart.layout.title).toContain("Dynamic Chart");
    expect(contour).toBeDefined();
    expect(contour?.z?.flat().some(Number.isFinite)).toBe(true);
  });

  it("fails directly when UTCI dynamic axes violate the state invariant", () => {
    const request = { tdb: 25, tr: 25, v: 1, rh: 50 };

    expect(() => buildUtciDynamicChart(
      { inputs: { [InputId.Input1]: request } },
      {},
      {
        unitSystem: UnitSystem.SI,
        dynamicAxes: utciModelConfig.defaultDynamicAxes,
        baselineInputId: InputId.Input1,
        fieldChartConfig: {
          mode: ChartMode.Explore,
          xField: FieldKey.DryBulbTemperature,
          yField: FieldKey.DryBulbTemperature,
          zOutput: ModelOutputKey.Utci,
          bands: utciModelConfig.chartableOutputs[0].defaultBands,
        },
      },
    )).toThrow(/dynamic axis pair/i);
  });
});
