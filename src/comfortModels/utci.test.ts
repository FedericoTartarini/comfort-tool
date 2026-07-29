import { describe, expect, it } from "vitest";

import { ChartMode, ModelOutputKey } from "../models/modelCapabilities";
import { FieldKey } from "../models/fieldKeys";
import { InputId } from "../models/inputSlots";
import { UnitSystem } from "../models/units";
import {
  buildUtciDynamicChart,
  calculateUtci,
  utciModelConfig,
} from "./utci";

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
  ] as const)("rejects UTCI axes that overwrite the same temperature inputs", (xAxis, yAxis) => {
    expect(utciModelConfig.dynamicAxisPairValidator?.(xAxis, yAxis)).toBe(false);
  });

  it.each([
    [FieldKey.DryBulbTemperature, FieldKey.MeanRadiantTemperature],
    [FieldKey.OperativeTemperature, FieldKey.RelativeHumidity],
    [FieldKey.WindSpeed, FieldKey.OperativeTemperature],
  ] as const)("keeps independent UTCI axis pairs chartable", (xAxis, yAxis) => {
    expect(utciModelConfig.dynamicAxisPairValidator?.(xAxis, yAxis)).toBe(true);
  });

  it("defensively rejects a conflicting FieldChartConfig", () => {
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

    expect(chart.traces).toEqual([]);
    expect(chart.layout.title).toBe("Invalid Axes Selection");
  });
});
