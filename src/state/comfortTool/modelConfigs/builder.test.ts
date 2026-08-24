import { describe, expect, it } from "vitest";

import { ComfortModel } from "../../../models/comfortModels";
import { PhysicalQuantityId, PhysicalQuantityScope } from "../../../models/physicalQuantities";
import { WorkspaceCapability } from "../../../models/output/workspaceCapabilities";
import { ChartKind } from "../../../models/output/chartKinds";
import { TableType } from "../../../models/output/tableLayouts";
import { ModelOutputKey, type ModelOutput, type NumericBand } from "../../../models/modelCapabilities";
import {
  ComfortModelBuilder,
  createEmptyResults,
  defineModel,
  parseEmptyOptions,
  type OutputChartDeclarationInput,
} from "./builder";

const bands: readonly NumericBand[] = [
  { min: -Infinity, max: Infinity, label: "All values", color: "#ffffff" },
];

const pmvOutput: ModelOutput = {
  key: ModelOutputKey.Pmv,
  label: "PMV",
  defaultBands: bands,
};

function createCustomOutputChart(
  instanceId: string = "pmv-ashrae-psychrometric",
): OutputChartDeclarationInput {
  return {
    instanceId,
    kind: ChartKind.Custom,
    name: "Test chart",
    emptyMessage: "No test chart yet.",
    spec: { build: () => null },
  };
}

function createExploreBuilder() {
  return new ComfortModelBuilder<unknown, unknown>(ComfortModel.PmvAshrae)
    .setLabel("Test model")
    .setDescription("Test model description.")
    .setStandardIds([])
    .setWorkspaceCapabilities([WorkspaceCapability.Explore])
    .setExploreOutputs([pmvOutput])
    .setModifiers([])
    .setOutputCharts([createCustomOutputChart()])
    .setTables({
      analysis: {
        type: TableType.Analysis,
        rows: [{
          id: "test-row",
          label: "Test row",
          format: () => ({ text: "value" }),
        }],
      },
    })
    .setDefaultOptions({})
    .setOptionParser(parseEmptyOptions)
    .setCalculator(() => ({ resultsByInput: createEmptyResults<unknown>(), chartSource: null }))
    .setDynamicAxisFields([
      PhysicalQuantityId.DryBulbTemperature,
      PhysicalQuantityId.RelativeHumidity,
    ])
    .setDefaultDynamicAxes({
      xAxis: PhysicalQuantityId.DryBulbTemperature,
      yAxis: PhysicalQuantityId.RelativeHumidity,
    });
}

describe("ComfortModelBuilder capabilities", () => {
  it("builds a complete minimal validated configuration snapshot", () => {
    const definition = createExploreBuilder().build();
    expect(definition.outputCharts.defaultInstanceId).toBe(
      "pmv-ashrae-psychrometric",
    );
    expect(definition.buildChart).toBeTypeOf("function");
  });

  it("requires Standard workspace for compliance profile", () => {
    expect(() => createExploreBuilder().setComplianceProfile({
      output: ModelOutputKey.Pmv,
      bands,
      legendTitle: "Bands",
      caption: "Caption",
      getFeedback: () => ({ text: "ok", passes: true }),
    }).build()).toThrow(/without Standard workspace/i);
  });

  it("rejects a Time-series table without Time-series capability", () => {
    expect(() => createExploreBuilder().setTables({
      analysis: {
        type: TableType.Analysis,
        rows: [{
          id: "test-row",
          label: "Test row",
          format: () => ({ text: "value" }),
        }],
      },
      timeSeries: {
        type: TableType.TimeSeries,
        rows: [{
          id: "summary-row",
          label: "Summary row",
          format: () => ({ text: "value" }),
        }],
      },
    }).build()).toThrow(/tables\.timeSeries is allowed only with Time-series workspace capability/i);
  });

  it("rejects Time-series capability without a Time-series table", () => {
    expect(() => createExploreBuilder()
      .setWorkspaceCapabilities([
        WorkspaceCapability.Explore,
        WorkspaceCapability.TimeSeries,
      ])
      .build()).toThrow(/Time-series workspace capability requires tables\.timeSeries/i);
  });

  it("rejects analysis tables that are not TableType.Analysis", () => {
    expect(() => createExploreBuilder().setTables({
      analysis: {
        type: TableType.TimeSeries,
        rows: [{
          id: "test-row",
          label: "Test row",
          format: () => ({ text: "value" }),
        }],
      },
    }).build()).toThrow(/tables\.analysis must use TableType\.Analysis/i);
  });

  it("defaults quantities.extend to an empty list", () => {
    expect(createExploreBuilder().build().quantities.extend).toEqual([]);
  });

  it("accepts model-scoped quantity extensions owned by this model", () => {
    const extension = {
      id: "pmv.testMass",
      owner: ComfortModel.PmvAshrae,
      scope: PhysicalQuantityScope.Model,
      label: "Test mass",
      display: {
        units: { SI: "kg", IP: "lb" },
        displayUnits: { SI: "kg", IP: "lb" },
        step: 1,
        decimals: 0,
      },
      defaultSi: 70,
      minSi: 40,
      maxSi: 120,
    };
    expect(createExploreBuilder().extendQuantities([extension]).build().quantities.extend)
      .toEqual([extension]);
  });

  it("rejects quantity extensions owned by another model", () => {
    expect(() => createExploreBuilder().extendQuantities([{
      id: "pmv.testMass",
      owner: ComfortModel.Phs2023,
      scope: PhysicalQuantityScope.Model,
      label: "Test mass",
      display: {
        units: { SI: "kg", IP: "lb" },
        displayUnits: { SI: "kg", IP: "lb" },
        step: 1,
        decimals: 0,
      },
      defaultSi: 70,
      minSi: 40,
      maxSi: 120,
    }]).build()).toThrow(/owner PHS_2023 does not match PMV_ASHRAE/);
  });

  it("rejects quantity extensions that collide with the system seed", () => {
    expect(() => createExploreBuilder().extendQuantities([{
      id: PhysicalQuantityId.DryBulbTemperature,
      owner: ComfortModel.PmvAshrae,
      scope: PhysicalQuantityScope.Model,
      label: "Air temperature",
      display: {
        units: { SI: "degC", IP: "degF" },
        displayUnits: { SI: "°C", IP: "°F" },
        step: 0.5,
        decimals: 1,
      },
      defaultSi: 25,
      minSi: 10,
      maxSi: 40,
    }]).build()).toThrow(/collides with a system-seed quantity/);
  });

  it("contributes and exposes a model quantity before catalog assembly", () => {
    const extension = {
      id: "audit.exampleMass",
      owner: ComfortModel.PmvAshrae,
      scope: PhysicalQuantityScope.Model,
      label: "Example mass",
      display: {
        units: { SI: "kg", IP: "lb" },
        displayUnits: { SI: "kg", IP: "lb" },
        step: 1,
        decimals: 0,
      },
      defaultSi: 70,
      minSi: 40,
      maxSi: 120,
    };

    const definition = createExploreBuilder()
      .extendQuantities([extension])
      .setInputFields([{ kind: "modelQuantity", quantityId: extension.id }])
      .build();

    expect(definition.quantities.extend.map((entry) => entry.id)).toEqual([extension.id]);
    expect(definition.controls.map(({ id }) => id)).toEqual([extension.id]);
  });

  it("rejects a modelQuantity field that is not in quantities.extend", () => {
    expect(() => createExploreBuilder()
      .setInputFields([{ kind: "modelQuantity", quantityId: "audit.exampleMass" }])
      .build()).toThrow(
      /modelQuantity field audit.exampleMass must reference a quantities.extend entry owned by PMV_ASHRAE/,
    );
  });
});

describe("defineModel", () => {
  it("assembles a complete declaration into a runtime definition", () => {
    const definition = defineModel({
      id: ComfortModel.PmvAshrae,
      label: "Test model",
      description: "Test model description.",
      standardIds: [],
      workspaceCapabilities: [WorkspaceCapability.Explore],
      exploreOutputs: [pmvOutput],
      modifiers: [],
      inputFields: [],
      outputCharts: [createCustomOutputChart()],
      tables: {
        analysis: {
          type: TableType.Analysis,
          rows: [{
            id: "test-row",
            label: "Test row",
            format: () => ({ text: "value" }),
          }],
        },
      },
      calculate: () => ({ resultsByInput: createEmptyResults<unknown>(), chartSource: null }),
      dynamicAxisFields: [
        PhysicalQuantityId.DryBulbTemperature,
        PhysicalQuantityId.RelativeHumidity,
      ],
      defaultDynamicAxes: {
        xAxis: PhysicalQuantityId.DryBulbTemperature,
        yAxis: PhysicalQuantityId.RelativeHumidity,
      },
      defaultOptions: {},
      parseOptions: parseEmptyOptions,
    });

    expect(definition.id).toBe(ComfortModel.PmvAshrae);
    expect(definition.outputCharts.defaultInstanceId).toBe("pmv-ashrae-psychrometric");
    expect(definition.buildChart).toBeTypeOf("function");
    expect(definition.buildTable).toBeTypeOf("function");
  });
});
