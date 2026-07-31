import { describe, expect, it } from "vitest";

import { ChartId } from "../../../models/chartOptions";
import { ComfortModel } from "../../../models/comfortModels";
import { FieldKey } from "../../../models/fieldKeys";
import { OptionKey, TemperatureMode } from "../../../models/inputModes";
import {
  ChartMode,
  ModelOutputKey,
  type ModelOutput,
  type NumericBand,
} from "../../../models/modelCapabilities";
import { ThermalZone } from "../../../models/thermalZone";
import {
  ComfortModelBuilder,
  createEmptyResults,
} from "./builder";

const bands: readonly NumericBand[] = [
  { min: -Infinity, max: Infinity, label: "All values", color: "#ffffff" },
];

const pmvOutput: ModelOutput = {
  key: ModelOutputKey.Pmv,
  label: "PMV",
  defaultBands: bands,
};

const complianceFeedback = () => ({ text: "Compliant", passes: true });

function createComplianceSpec(
  output: ModelOutputKey = ModelOutputKey.Pmv,
  complianceBands: readonly NumericBand[] = bands,
) {
  return {
    output,
    bands: complianceBands,
    caption: "Test compliance requirements.",
    getFeedback: complianceFeedback,
  };
}

type BuilderPart =
  | "label"
  | "description"
  | "chart"
  | "defaultOptions"
  | "normalizer"
  | "calculator"
  | "resultBuilder"
  | "chartBuilder"
  | "dynamicFields"
  | "dynamicDefaults";

function createBuilder(omitted: readonly BuilderPart[] = []) {
  const builder = new ComfortModelBuilder<unknown, unknown>(
    ComfortModel.PmvAshrae,
  );
  const includes = (part: BuilderPart) => !omitted.includes(part);

  if (includes("label")) builder.setLabel("Test model");
  if (includes("description")) builder.setDescription("Test model description.");
  if (includes("chart")) {
    builder.setDefaultChart(ChartId.Psychrometric, [ChartId.Psychrometric]);
  }
  if (includes("defaultOptions")) builder.setDefaultOptions({});
  if (includes("normalizer")) builder.setOptionNormalizer(() => ({}));
  if (includes("calculator")) {
    builder.setCalculator(() => ({
      resultsByInput: createEmptyResults<unknown>(),
      chartSource: null,
    }));
  }
  if (includes("resultBuilder")) builder.setResultBuilder(() => []);
  if (includes("chartBuilder")) builder.setChartBuilder(() => null);
  if (includes("dynamicFields")) {
    builder.setDynamicAxisFields([
      FieldKey.DryBulbTemperature,
      FieldKey.RelativeHumidity,
    ]);
  }
  if (includes("dynamicDefaults")) {
    builder.setDefaultDynamicAxes({
      xAxis: FieldKey.DryBulbTemperature,
      yAxis: FieldKey.RelativeHumidity,
    });
  }

  return builder;
}

function createExploreBuilder(omitted: readonly BuilderPart[] = []) {
  return createBuilder(omitted)
    .setModes([ChartMode.Explore])
    .setChartableOutputs([pmvOutput]);
}

describe("ComfortModelBuilder capabilities", () => {
  it("builds a complete minimal validated configuration snapshot", () => {
    const definition = createExploreBuilder().build();

    expect(definition).toEqual(expect.objectContaining({
      id: ComfortModel.PmvAshrae,
      label: "Test model",
      description: "Test model description.",
      modes: [ChartMode.Explore],
      chartIds: [ChartId.Psychrometric],
      defaultChartId: ChartId.Psychrometric,
      defaultOptions: {},
    }));
    expect(definition.calculate).toBeTypeOf("function");
    expect(definition.buildResultSections).toBeTypeOf("function");
    expect(definition.buildChartResult).toBeTypeOf("function");
  });

  it("stores modes, chartable outputs, and numeric compliance declarations", () => {
    const definition = new ComfortModelBuilder<unknown, unknown, NumericBand>(
      ComfortModel.PmvAshrae,
    )
      .setLabel("Test model")
      .setDescription("Test model description.")
      .setModes([ChartMode.Compliance, ChartMode.Explore])
      .setChartableOutputs([pmvOutput])
      .setComplianceSpec(createComplianceSpec())
      .setDefaultChart(ChartId.Psychrometric, [ChartId.Psychrometric])
      .setDefaultOptions({})
      .setOptionNormalizer(() => ({}))
      .setCalculator(() => ({
        resultsByInput: createEmptyResults<unknown>(),
        chartSource: null,
      }))
      .setResultBuilder(() => [])
      .setChartBuilder(() => null)
      .setDynamicAxisFields([
        FieldKey.DryBulbTemperature,
        FieldKey.RelativeHumidity,
      ])
      .setDefaultDynamicAxes({
        xAxis: FieldKey.DryBulbTemperature,
        yAxis: FieldKey.RelativeHumidity,
      })
      .build();

    expect(definition.modes).toEqual([ChartMode.Compliance, ChartMode.Explore]);
    expect(definition.chartableOutputs).toEqual([pmvOutput]);
    expect(definition.complianceSpec).toEqual(createComplianceSpec());
    expect(definition.complianceSpec?.bands).not.toBe(bands);
  });

  it("accepts an explicitly empty output list for a compliance-only model", () => {
    const definition = createBuilder()
      .setModes([ChartMode.Compliance])
      .setChartableOutputs([])
      .setComplianceSpec(createComplianceSpec(ModelOutputKey.OperativeTemperature))
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
      .setComplianceSpec(createComplianceSpec(ModelOutputKey.Pmv, []))
      .build())
      .toThrow(/non-empty compliance specification/i);
  });

  it("requires Compliance models to expose a caption and feedback callback", () => {
    expect(() => createBuilder()
      .setModes([ChartMode.Compliance])
      .setChartableOutputs([])
      .setComplianceSpec({ ...createComplianceSpec(), caption: "  " })
      .build())
      .toThrow(/non-empty compliance specification/i);

    expect(() => createBuilder()
      .setModes([ChartMode.Compliance])
      .setChartableOutputs([])
      .setComplianceSpec({
        ...createComplianceSpec(),
        getFeedback: null as never,
      })
      .build())
      .toThrow(/non-empty compliance specification/i);
  });

  it("rejects a compliance specification without Compliance mode", () => {
    expect(() => createExploreBuilder()
      .setComplianceSpec(createComplianceSpec())
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

  it.each([
    ["label", /non-empty label/i],
    ["description", /non-empty description/i],
    ["chart", /at least one chart ID/i],
    ["defaultOptions", /explicitly set default options/i],
    ["normalizer", /option normalizer/i],
    ["calculator", /calculator/i],
    ["resultBuilder", /result builder/i],
    ["chartBuilder", /chart builder/i],
    ["dynamicFields", /dynamic axis fields/i],
    ["dynamicDefaults", /explicit default dynamic axes/i],
  ] as const)("reports a clear error when %s is missing", (part, expected) => {
    expect(() => createExploreBuilder([part]).build()).toThrow(expected);
  });

  it("rejects empty, duplicate, and mismatched chart declarations", () => {
    expect(() => createExploreBuilder()
      .setDefaultChart(ChartId.Psychrometric, [])
      .build())
      .toThrow(/at least one chart ID/i);
    expect(() => createExploreBuilder()
      .setDefaultChart(ChartId.Psychrometric, [
        ChartId.Psychrometric,
        ChartId.Psychrometric,
      ])
      .build())
      .toThrow(/duplicate chart IDs/i);
    expect(() => createExploreBuilder()
      .setDefaultChart(ChartId.Psychrometric, [ChartId.PmvDynamic])
      .build())
      .toThrow(/default chart must belong/i);
  });

  it("rejects duplicate, unsupported, or identical dynamic axes", () => {
    expect(() => createExploreBuilder()
      .setDynamicAxisFields([
        FieldKey.DryBulbTemperature,
        FieldKey.DryBulbTemperature,
      ])
      .build())
      .toThrow(/duplicates/i);
    expect(() => createExploreBuilder()
      .setDefaultDynamicAxes({
        xAxis: FieldKey.DryBulbTemperature,
        yAxis: FieldKey.OperativeTemperature,
      })
      .build())
      .toThrow(/supported and distinct/i);
    expect(() => createExploreBuilder()
      .setDefaultDynamicAxes({
        xAxis: FieldKey.DryBulbTemperature,
        yAxis: FieldKey.DryBulbTemperature,
      })
      .build())
      .toThrow(/supported and distinct/i);
  });

  it("keeps prior snapshots isolated from subsequent builder mutations", () => {
    const originalZone = new ThermalZone({
      label: "Original",
      color: "#123456",
    });
    const builder = createExploreBuilder()
      .setZones([originalZone])
      .setLegendChartIds([ChartId.Psychrometric])
      .setLegendTitle("Original legend")
      .setLockYAxisChartIds([ChartId.Psychrometric]);
    const definition = builder.build();

    builder
      .setLabel("Changed model")
      .setModes([ChartMode.Compliance])
      .setChartableOutputs([])
      .setDefaultChart(ChartId.PmvDynamic, [ChartId.PmvDynamic])
      .setDefaultOptions({
        [OptionKey.TemperatureMode]: TemperatureMode.Operative,
      })
      .setDynamicAxisFields([
        FieldKey.OperativeTemperature,
        FieldKey.RelativeHumidity,
      ])
      .setDefaultDynamicAxes({
        xAxis: FieldKey.OperativeTemperature,
        yAxis: FieldKey.RelativeHumidity,
      })
      .setZones([])
      .setLegendChartIds([])
      .setLegendTitle("Changed legend")
      .setLockYAxisChartIds([])
      .addOptionHandler(OptionKey.TemperatureMode, () => null);

    expect(definition.label).toBe("Test model");
    expect(definition.modes).toEqual([ChartMode.Explore]);
    expect(definition.chartableOutputs).toEqual([pmvOutput]);
    expect(definition.chartIds).toEqual([ChartId.Psychrometric]);
    expect(definition.defaultOptions).toEqual({});
    expect(definition.dynamicAxisFields).toEqual([
      FieldKey.DryBulbTemperature,
      FieldKey.RelativeHumidity,
    ]);
    expect(definition.defaultDynamicAxes).toEqual({
      xAxis: FieldKey.DryBulbTemperature,
      yAxis: FieldKey.RelativeHumidity,
    });
    expect(definition.zones).toEqual([originalZone]);
    expect(definition.legendChartIds).toEqual([ChartId.Psychrometric]);
    expect(definition.legendTitle).toBe("Original legend");
    expect(definition.lockYAxisChartIds).toEqual([ChartId.Psychrometric]);
    expect(definition.optionHandlersByKey).toEqual({});
  });
});
