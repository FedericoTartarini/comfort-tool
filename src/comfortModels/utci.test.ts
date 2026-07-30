import { describe, expect, it } from "vitest";

import { ChartMode, ModelOutputKey } from "../models/modelCapabilities";
import { FieldKey } from "../models/fieldKeys";
import { InputId } from "../models/inputSlots";
import { UnitSystem } from "../models/units";
import {
  buildUtciDynamicChart,
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
      units: UnitSystem.SI,
    });

    expect(result.stressCategory).toBe(getUtciZoneMeta(result.utci).category);
  });
});

describe("UTCI Explore chart", () => {
  it("uses its declared raw output and working bands", () => {
    const request = { tdb: 25, tr: 25, v: 1, rh: 50, units: UnitSystem.SI };
    const result = calculateUtci(request);
    const chart = buildUtciDynamicChart(
      { inputs: { [InputId.Input1]: request } },
      { [InputId.Input1]: result },
      UnitSystem.SI,
      {
        mode: ChartMode.Explore,
        xField: FieldKey.DryBulbTemperature,
        yField: FieldKey.RelativeHumidity,
        zOutput: ModelOutputKey.Utci,
        bands: utciModelConfig.chartableOutputs[0].defaultBands,
      },
      InputId.Input1,
    );

    expect(chart.traces[0].type).toBe("contour");
    expect(chart.traces[0].z).toHaveLength(450);
    expect(chart.traces[0].z?.[0]).toHaveLength(450);
    expect(chart.traces[0].hovertemplate).toContain("UTCI");
    expect(chart.traces.some((trace) => trace.type === "scatter")).toBe(true);
  });

  it.each([
    [FieldKey.OperativeTemperature, FieldKey.DryBulbTemperature],
    [FieldKey.DryBulbTemperature, FieldKey.OperativeTemperature],
    [FieldKey.OperativeTemperature, FieldKey.MeanRadiantTemperature],
    [FieldKey.MeanRadiantTemperature, FieldKey.OperativeTemperature],
  ] as const)("supports UTCI operative/component axes without overwriting", (xAxis, yAxis) => {
    expect(utciModelConfig.dynamicAxisPairValidator?.(xAxis, yAxis) ?? true).toBe(true);
  });

  it.each([
    [FieldKey.DryBulbTemperature, FieldKey.MeanRadiantTemperature],
    [FieldKey.OperativeTemperature, FieldKey.RelativeHumidity],
    [FieldKey.WindSpeed, FieldKey.OperativeTemperature],
  ] as const)("keeps independent UTCI axis pairs chartable", (xAxis, yAxis) => {
    expect(utciModelConfig.dynamicAxisPairValidator?.(xAxis, yAxis) ?? true).toBe(true);
  });

  it("builds a coupled FieldChartConfig with finite resolved cells", () => {
    const request = { tdb: 25, tr: 25, v: 1, rh: 50, units: UnitSystem.SI };
    const chart = buildUtciDynamicChart(
      { inputs: { [InputId.Input1]: request } },
      {},
      UnitSystem.SI,
      {
        mode: ChartMode.Explore,
        xField: FieldKey.DryBulbTemperature,
        yField: FieldKey.OperativeTemperature,
        zOutput: ModelOutputKey.Utci,
        bands: utciModelConfig.chartableOutputs[0].defaultBands,
      },
      InputId.Input1,
    );

    const contour = chart.traces.find((trace) => trace.type === "contour");
    expect(chart.layout.title).toContain("Dynamic Chart");
    expect(contour).toBeDefined();
    expect(contour?.z?.flat().some(Number.isFinite)).toBe(true);
  });

  it("fails directly when UTCI dynamic axes violate the state invariant", () => {
    const request = { tdb: 25, tr: 25, v: 1, rh: 50, units: UnitSystem.SI };

    expect(() => buildUtciDynamicChart(
      { inputs: { [InputId.Input1]: request } },
      {},
      UnitSystem.SI,
      {
        mode: ChartMode.Explore,
        xField: FieldKey.DryBulbTemperature,
        yField: FieldKey.DryBulbTemperature,
        zOutput: ModelOutputKey.Utci,
        bands: utciModelConfig.chartableOutputs[0].defaultBands,
      },
      InputId.Input1,
    )).toThrow(/dynamic axis pair/i);
  });
});
