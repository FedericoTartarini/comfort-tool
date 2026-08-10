import { describe, expect, it } from "vitest";

import {
  ChartId,
  type ModelChartDefinition,
} from "../../../models/chartOptions";
import { ComfortModel } from "../../../models/comfortModels";
import { FieldKey } from "../../../models/fieldKeys";
import { OptionKey, TemperatureMode } from "../../../models/inputModes";
import { InputId, inputDefaultsById } from "../../../models/inputSlots";
import type { ModelCalculationContext } from "../../../models/modelCalculation";
import {
  ChartMode,
  ModelOutputKey,
  type ModelOutput,
  type NumericBand,
} from "../../../models/modelCapabilities";
import { solarGainModifier } from "../../../services/comfort/inputModifiers";
import {
  ComfortModelBuilder,
  buildResultSection,
  createEmptyResults,
  parseEmptyOptions,
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

function createChartDefinition(
  id: ChartId = ChartId.Psychrometric,
  overrides: Partial<ModelChartDefinition> = {},
): ModelChartDefinition {
  return {
    id,
    name: "Test chart",
    emptyMessage: "No test chart yet.",
    allowsAxisSelection: false,
    locksYAxis: false,
    showsZoneToggle: false,
    showsLegend: true,
    ...overrides,
  };
}

function createComplianceSpec(
  output: ModelOutputKey = ModelOutputKey.Pmv,
  complianceBands: readonly NumericBand[] = bands,
) {
  return {
    output,
    bands: complianceBands,
    legendTitle: "Test bands",
    caption: "Test compliance requirements.",
    getFeedback: complianceFeedback,
  };
}

type BuilderPart =
  | "label"
  | "description"
  | "modifiers"
  | "chart"
  | "defaultOptions"
  | "parser"
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
  if (includes("modifiers")) builder.setModifiers([]);
  if (includes("chart")) {
    builder.setCharts({
      defaultId: ChartId.Psychrometric,
      entries: [createChartDefinition()],
    });
  }
  if (includes("defaultOptions")) builder.setDefaultOptions({});
  if (includes("parser")) builder.setOptionParser(() => ({}));
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
      charts: {
        defaultId: ChartId.Psychrometric,
        entries: [createChartDefinition()],
      },
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
      .setModifiers([solarGainModifier])
      .setComplianceSpec(createComplianceSpec())
      .setCharts({
        defaultId: ChartId.Psychrometric,
        entries: [createChartDefinition()],
      })
      .setDefaultOptions({})
      .setOptionParser(() => ({}))
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
    expect(definition.modifiers).toEqual([solarGainModifier]);
    expect(definition.complianceSpec).toEqual(expect.objectContaining({
      ...createComplianceSpec(),
      getFeedback: expect.any(Function),
    }));
    expect(definition.complianceSpec?.getFeedback({})).toEqual({
      text: "Compliant",
      passes: true,
    });
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

  it("requires an explicit modifier declaration and rejects duplicates", () => {
    expect(() => createExploreBuilder(["modifiers"]).build())
      .toThrow(/explicitly set supported modifiers/i);
    expect(() => createExploreBuilder()
      .setModifiers([solarGainModifier, solarGainModifier])
      .build())
      .toThrow(/duplicate modifiers/i);
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

  it("requires Compliance models to expose a legend title and caption", () => {
    expect(() => createBuilder()
      .setModes([ChartMode.Compliance])
      .setChartableOutputs([])
      .setComplianceSpec({ ...createComplianceSpec(), legendTitle: "  " })
      .build())
      .toThrow(/non-empty compliance specification/i);

    expect(() => createBuilder()
      .setModes([ChartMode.Compliance])
      .setChartableOutputs([])
      .setComplianceSpec({ ...createComplianceSpec(), caption: "  " })
      .build())
      .toThrow(/non-empty compliance specification/i);

  });

  it("requires default options to satisfy the model's exact parser", () => {
    expect(() => createExploreBuilder()
      .setDefaultOptions({
        [OptionKey.TemperatureMode]: TemperatureMode.Air,
      })
      .setOptionParser(parseEmptyOptions)
      .build())
      .toThrow(/exact option schema/i);
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
    ["chart", /at least one chart definition/i],
    ["defaultOptions", /explicitly set default options/i],
    ["parser", /option parser/i],
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
      .setCharts({ defaultId: ChartId.Psychrometric, entries: [] })
      .build())
      .toThrow(/at least one chart definition/i);
    expect(() => createExploreBuilder()
      .setCharts({
        defaultId: ChartId.Psychrometric,
        entries: [createChartDefinition(), createChartDefinition()],
      })
      .build())
      .toThrow(/duplicate chart IDs/i);
    expect(() => createExploreBuilder()
      .setCharts({
        defaultId: ChartId.Psychrometric,
        entries: [createChartDefinition(ChartId.PmvDynamic)],
      })
      .build())
      .toThrow(/default chart must belong/i);
    expect(() => createExploreBuilder()
      .setCharts({
        defaultId: ChartId.Psychrometric,
        entries: [createChartDefinition(ChartId.Psychrometric, {
          locksYAxis: true,
        })],
      })
      .build())
      .toThrow(/locked Y axis requires an axis-selectable chart/i);
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
    const builder = createExploreBuilder();
    const definition = builder.build();

    builder
      .setLabel("Changed model")
      .setModes([ChartMode.Compliance])
      .setChartableOutputs([])
      .setCharts({
        defaultId: ChartId.PmvDynamic,
        entries: [createChartDefinition(ChartId.PmvDynamic, {
          name: "Changed chart",
        })],
      })
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
      .addOptionHandler(OptionKey.TemperatureMode, () => null);

    expect(definition.label).toBe("Test model");
    expect(definition.modes).toEqual([ChartMode.Explore]);
    expect(definition.chartableOutputs).toEqual([pmvOutput]);
    expect(definition.charts).toEqual({
      defaultId: ChartId.Psychrometric,
      entries: [createChartDefinition()],
    });
    expect(definition.defaultOptions).toEqual({});
    expect(definition.dynamicAxisFields).toEqual([
      FieldKey.DryBulbTemperature,
      FieldKey.RelativeHumidity,
    ]);
    expect(definition.defaultDynamicAxes).toEqual({
      xAxis: FieldKey.DryBulbTemperature,
      yAxis: FieldKey.RelativeHumidity,
    });
    expect(definition.optionHandlersByKey).toEqual({});
  });

  it.each([
    [0, "0"],
    [false, "false"],
    ["", ""],
  ])("formats the non-null falsy result %p", (result, expectedText) => {
    const results = {
      [InputId.Input1]: result,
      [InputId.Input2]: null,
      [InputId.Input3]: null,
    };
    const section = buildResultSection(
      "Falsy",
      results,
      [InputId.Input1],
      (value) => ({ text: String(value) }),
    );

    expect(section.valuesByInput[InputId.Input1]).toEqual({ text: expectedText });
  });

  it("erases model-specific calculation types only at the runtime boundary", () => {
    const definition = new ComfortModelBuilder<number, { source: string }>(
      ComfortModel.PmvAshrae,
    )
      .setLabel("Typed model")
      .setDescription("Typed result and chart source.")
      .setModes([ChartMode.Explore])
      .setChartableOutputs([pmvOutput])
      .setModifiers([])
      .setCharts({
        defaultId: ChartId.Psychrometric,
        entries: [createChartDefinition()],
      })
      .setDefaultOptions({})
      .setOptionParser(parseEmptyOptions)
      .setCalculator(() => ({
        resultsByInput: {
          [InputId.Input1]: 0,
          [InputId.Input2]: null,
          [InputId.Input3]: null,
        },
        chartSource: { source: "typed" },
      }))
      .setResultBuilder((results) => [{
        title: "Value",
        valuesByInput: {
          [InputId.Input1]: { text: String(results[InputId.Input1]) },
        },
      }])
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

    const context: ModelCalculationContext = {
      inputsByInput: inputDefaultsById,
      options: {},
    };

    expect(definition.calculate(context, [InputId.Input1])).toEqual({
      resultsByInput: {
        [InputId.Input1]: 0,
        [InputId.Input2]: null,
        [InputId.Input3]: null,
      },
      chartSource: { source: "typed" },
    });
  });
});
