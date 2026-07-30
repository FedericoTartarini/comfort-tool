import { describe, expect, it } from "vitest";

import { ComfortModel } from "../../../models/comfortModels";
import { FieldKey } from "../../../models/fieldKeys";
import {
  ChartMode,
  ModelOutputKey,
  type ModelOutput,
  type NumericBand,
} from "../../../models/modelCapabilities";
import { ComfortModelBuilder } from "./builder";

const bands: readonly NumericBand[] = [
  { min: -Infinity, max: Infinity, label: "All values", color: "#ffffff" },
];

const pmvOutput: ModelOutput = {
  key: ModelOutputKey.Pmv,
  label: "PMV",
  defaultBands: bands,
};

function createBuilder() {
  return new ComfortModelBuilder<unknown, unknown>(ComfortModel.PmvAshrae)
    .setDynamicAxisFields([
      FieldKey.DryBulbTemperature,
      FieldKey.RelativeHumidity,
    ])
    .setDefaultDynamicAxes({
      xAxis: FieldKey.DryBulbTemperature,
      yAxis: FieldKey.RelativeHumidity,
    });
}

describe("ComfortModelBuilder capabilities", () => {
  it("stores modes, chartable outputs, and compliance declarations", () => {
    const definition = createBuilder()
      .setModes([ChartMode.Compliance, ChartMode.Explore])
      .setChartableOutputs([pmvOutput])
      .setComplianceSpec({ output: ModelOutputKey.Pmv, bands })
      .build();

    expect(definition.modes).toEqual([ChartMode.Compliance, ChartMode.Explore]);
    expect(definition.chartableOutputs).toEqual([pmvOutput]);
    expect(definition.complianceSpec).toEqual({ output: ModelOutputKey.Pmv, bands });
  });

  it("accepts an explicitly empty output list for a compliance-only model", () => {
    const definition = createBuilder()
      .setModes([ChartMode.Compliance])
      .setChartableOutputs([])
      .setComplianceSpec({ output: ModelOutputKey.OperativeTemperature, bands })
      .build();

    expect(definition.chartableOutputs).toEqual([]);
  });

  it("requires at least one mode", () => {
    expect(() => createBuilder().setChartableOutputs([pmvOutput]).build())
      .toThrow(/at least one mode/i);
    expect(() => createBuilder().setModes([]).setChartableOutputs([pmvOutput]).build())
      .toThrow(/at least one mode/i);
  });

  it("requires an explicit chartable-output declaration", () => {
    expect(() => createBuilder().setModes([ChartMode.Explore]).build())
      .toThrow(/explicitly set chartable outputs/i);
  });

  it("requires Explore models to expose an output", () => {
    expect(() => createBuilder()
      .setModes([ChartMode.Explore])
      .setChartableOutputs([])
      .build())
      .toThrow(/Explore mode requires at least one chartable output/i);
  });

  it("requires Compliance models to expose non-empty fixed bands", () => {
    expect(() => createBuilder()
      .setModes([ChartMode.Compliance])
      .setChartableOutputs([])
      .build())
      .toThrow(/non-empty compliance specification/i);

    expect(() => createBuilder()
      .setModes([ChartMode.Compliance])
      .setChartableOutputs([])
      .setComplianceSpec({ output: ModelOutputKey.Pmv, bands: [] })
      .build())
      .toThrow(/non-empty compliance specification/i);
  });

  it("rejects a compliance specification without Compliance mode", () => {
    expect(() => createBuilder()
      .setModes([ChartMode.Explore])
      .setChartableOutputs([pmvOutput])
      .setComplianceSpec({ output: ModelOutputKey.Pmv, bands })
      .build())
      .toThrow(/without Compliance mode/i);
  });

  it("rejects duplicate modes and output keys", () => {
    expect(() => createBuilder()
      .setModes([ChartMode.Explore, ChartMode.Explore])
      .setChartableOutputs([pmvOutput])
      .build())
      .toThrow(/duplicate modes/i);

    expect(() => createBuilder()
      .setModes([ChartMode.Explore])
      .setChartableOutputs([pmvOutput, { ...pmvOutput, label: "Duplicate" }])
      .build())
      .toThrow(/duplicate output keys/i);
  });

  it("rejects malformed, unsorted, and overlapping Explore defaults", () => {
    const buildWithBands = (defaultBands: readonly NumericBand[]) => createBuilder()
      .setModes([ChartMode.Explore])
      .setChartableOutputs([{ ...pmvOutput, defaultBands }])
      .build();

    expect(() => buildWithBands([])).toThrow(/at least one band/i);
    expect(() => buildWithBands([
      { min: 1, max: 2, label: "Later", color: "#000" },
      { min: 0, max: 1, label: "Earlier", color: "#fff" },
    ])).toThrow(/sorted/i);
    expect(() => buildWithBands([
      { min: 0, max: 2, label: "One", color: "#000" },
      { min: 1, max: 3, label: "Two", color: "#fff" },
    ])).toThrow(/overlap/i);
    expect(() => buildWithBands([
      { min: NaN, max: 1, label: "Bad", color: "#000" },
    ])).toThrow(/numeric/i);
  });

  it("rejects missing or invalid default dynamic axes", () => {
    expect(() => new ComfortModelBuilder<unknown, unknown>(ComfortModel.PmvAshrae)
      .setModes([ChartMode.Explore])
      .setChartableOutputs([pmvOutput])
      .setDynamicAxisFields([
        FieldKey.DryBulbTemperature,
        FieldKey.RelativeHumidity,
      ])
      .build())
      .toThrow(/explicit default dynamic axes/i);

    expect(() => createBuilder()
      .setDefaultDynamicAxes({
        xAxis: FieldKey.DryBulbTemperature,
        yAxis: FieldKey.DryBulbTemperature,
      })
      .setModes([ChartMode.Explore])
      .setChartableOutputs([pmvOutput])
      .build())
      .toThrow(/supported and distinct/i);
  });
});
