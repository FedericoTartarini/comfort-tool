import { describe, expect, it } from "vitest";

import { ModelId } from "../../../catalog/modelIds";
import {
  PhysicalQuantityId,
  PhysicalQuantityScope,
} from "../../../catalog/quantities";
import { WorkspaceId } from "../../../catalog/workspaces";
import { ChartType } from "../../../catalog/chartTypes";
import { TableType } from "../../../catalog/tableTypes";
import { FieldChartProfileKind } from "../../../catalog/output/fieldChartProfile";
import {
  ModelOutputKey,
  type ModelOutput,
  type NumericBand,
} from "../../../catalog/modelCapabilities";
import { InputId } from "../../../catalog/inputSlots";
import { SiUnit, UnitSystem } from "../../../catalog/units";
import { ParametricYUnit } from "../../../engines/comfort/charts/kinds/types";
import {
  ComfortModelBuilder,
  createEmptyResults,
  defineModel,
  parseEmptyOptions,
  type ModelChartDeclaration,
  type FrontendChartDeclaration,
} from "./builder";

const bands: readonly NumericBand[] = [
  { min: -Infinity, max: Infinity, label: "All values", color: "#ffffff" },
];

const pmvOutput: ModelOutput = {
  key: ModelOutputKey.Pmv,
  label: "PMV",
  defaultBands: bands,
};

function createModelDynamicFieldChart(
  id = "test-dynamic-field",
): ModelChartDeclaration {
  return {
    id,
    type: ChartType.Dynamic,
    emptyMessage: "No test chart yet.",
    spec: {
      title: "Test",
      axisFields: [
        PhysicalQuantityId.DryBulbTemperature,
        PhysicalQuantityId.RelativeHumidity,
      ],
      resolveGridSpec: () => ({
        output: pmvOutput,
        gridPoints: 5,
        requestAdapter: {
          getAxisValue: () => 0,
          setAxisValue: () => undefined,
        },
        evaluate: () => ({}),
        getOutputValue: () => 0,
      }),
    },
  };
}

function createModelUtciChart(
  id = "test-utci",
): FrontendChartDeclaration {
  return {
    id,
    type: ChartType.Utci,
    emptyMessage: "No stress chart yet.",
    capabilities: {
      allowsAxisSelection: false,
      locksYAxis: false,
      allowsOutputSelection: false,
      allowsBandEditing: false,
      allowsBaselineSelection: true,
      showsLegend: true,
      showsExport: true,
    },
    spec: {
      title: "Stress",
      getOutputValue: () => 0,
    },
  };
}

function createModelBodyTemperatureChart(
  id = "test-body-temperature",
): FrontendChartDeclaration {
  return {
    id,
    type: ChartType.BodyTemperature,
    emptyMessage: "No history chart yet.",
    capabilities: {
      allowsAxisSelection: false,
      locksYAxis: false,
      allowsOutputSelection: true,
      allowsBandEditing: false,
      allowsBaselineSelection: true,
      showsLegend: false,
      showsExport: true,
    },
    spec: {
      title: "History",
      yLabel: "Value",
      getSeries: () => [
        { x: 0, y: 1 },
        { x: 1, y: 2 },
      ],
    },
  };
}

function createModelAdaptiveChart(
  id = "test-adaptive",
): FrontendChartDeclaration {
  return {
    id,
    type: ChartType.Adaptive,
    emptyMessage: "No boundary chart yet.",
    spec: {
      title: "Boundary",
      axisFields: [
        PhysicalQuantityId.DryBulbTemperature,
        PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
      ],
    },
  };
}

function createModelHeatLossChart(
  id = "test-heat-loss",
): FrontendChartDeclaration {
  return {
    id,
    type: ChartType.HeatLoss,
    emptyMessage: "No parametric chart yet.",
    spec: {
      title: "Parametric",
      xField: PhysicalQuantityId.DryBulbTemperature,
      yLabel: "Heat loss",
      getGeometry: () => ({
        polylines: [
          {
            id: "total",
            label: "Total heat loss",
            color: "#000000",
            yUnit: ParametricYUnit.HeatFlux,
            points: [
              { x: 10, y: 50 },
              { x: 40, y: 80 },
            ],
          },
        ],
        limitBands: [
          {
            label: "Limit",
            color: "#86efac",
            min: 40,
            max: 90,
            yUnit: ParametricYUnit.HeatFlux,
          },
        ],
      }),
    },
  };
}

function createFrontendCharts(): FrontendChartDeclaration[] {
  return [
    createModelDynamicFieldChart(),
    createModelUtciChart(),
    createModelAdaptiveChart(),
    createModelBodyTemperatureChart(),
    createModelHeatLossChart(),
  ];
}

const modelChartBuildProfile = {
  kind: FieldChartProfileKind.Explore,
  xField: PhysicalQuantityId.DryBulbTemperature,
  yField: PhysicalQuantityId.RelativeHumidity,
  zOutput: ModelOutputKey.Pmv,
  bands: [
    { min: 10, max: 20, label: "Low", color: "#eeeeee" },
    { min: 20, max: 40, label: "High", color: "#cccccc" },
  ],
} as const;

function createPmvPsychrometricChart(): FrontendChartDeclaration {
  return {
    id: "test-pmv-custom",
    type: ChartType.Psychrometric,
    emptyMessage: "No psychrometric chart yet.",
    spec: { build: () => null },
  };
}

function createExploreBuilder(
  chart: FrontendChartDeclaration = createModelDynamicFieldChart(),
  modelId: ModelId = ModelId.PmvAshrae,
) {
  return new ComfortModelBuilder<unknown, unknown>(modelId)
    .setLabel("Test model")
    .setDescription("Test model description.")
    .setStandardIds([])
    .setWorkspaceCapabilities([WorkspaceId.Explore])
    .setExploreOutputs([pmvOutput])
    .setModifiers([])
    .setCharts([chart])
    .setTables({
      analysis: {
        type: TableType.Analysis,
        rows: [
          {
            id: "test-row",
            label: "Test row",
            format: () => ({ text: "value" }),
          },
        ],
      },
    })
    .setDefaultOptions({})
    .setOptionParser(parseEmptyOptions)
    .setCalculator(() => ({
      resultsByInput: createEmptyResults<unknown>(),
      chartSource: null,
    }))
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
    expect(definition.chartInstances.defaultInstanceId).toBe(
      "test-dynamic-field",
    );
    expect(definition.buildChart).toBeTypeOf("function");
    expect(definition.chartInstances.entries[0]).not.toHaveProperty("spec");
    expect(definition.chartEngineRegistrations[0]?.registration.type).toBe(
      ChartType.Dynamic,
    );
  });

  it("accepts Psychrometric on PMV models", () => {
    const definition = createExploreBuilder(
      createPmvPsychrometricChart(),
    ).build();
    expect(definition.chartEngineRegistrations[0]?.registration.type).toBe(
      ChartType.Psychrometric,
    );
    expect(definition.chartInstances.defaultInstanceId).toBe("test-pmv-custom");
  });

  it("rejects Psychrometric charts on non-PMV models", () => {
    expect(() =>
      createExploreBuilder(
        {
          id: "not-psychrometric",
          type: ChartType.Psychrometric,
          emptyMessage: "No chart.",
          spec: { build: () => null },
        },
        ModelId.HeatIndex,
      ),
    ).toThrow(/Psychrometric is frontend-only for PMV geometry/);
  });

  it("rejects unknown chart types", () => {
    expect(() =>
      createExploreBuilder({
        id: "invented",
        type: "invented-type",
        emptyMessage: "No chart.",
        spec: {
          title: "Nope",
          axisFields: [
            PhysicalQuantityId.DryBulbTemperature,
            PhysicalQuantityId.RelativeHumidity,
          ],
          resolveGridSpec: () => ({
            output: pmvOutput,
            requestAdapter: {
              getAxisValue: () => 0,
              setAxisValue: () => undefined,
            },
            evaluate: () => null,
            getOutputValue: () => 0,
          }),
        },
      } as unknown as FrontendChartDeclaration),
    ).toThrow(/Unknown chart type/);
  });

  it("requires Standard workspace for compliance profile", () => {
    expect(() =>
      createExploreBuilder()
        .setComplianceProfile({
          output: ModelOutputKey.Pmv,
          bands,
          legendTitle: "Bands",
          caption: "Caption",
          getFeedback: () => ({ text: "ok", passes: true }),
        })
        .build(),
    ).toThrow(/without Standard workspace/i);
  });

  it("rejects a Time-series table without Time-series capability", () => {
    expect(() =>
      createExploreBuilder()
        .setTables({
          analysis: {
            type: TableType.Analysis,
            rows: [
              {
                id: "test-row",
                label: "Test row",
                format: () => ({ text: "value" }),
              },
            ],
          },
          timeSeries: {
            type: TableType.TimeSeries,
            rows: [
              {
                id: "summary-row",
                label: "Summary row",
                format: () => ({ text: "value" }),
              },
            ],
          },
        })
        .build(),
    ).toThrow(
      /tables\.timeSeries is allowed only with Time-series workspace capability/i,
    );
  });

  it("rejects Time-series capability without a Time-series table", () => {
    expect(() =>
      createExploreBuilder()
        .setWorkspaceCapabilities([
          WorkspaceId.Explore,
          WorkspaceId.TimeSeries,
        ])
        .build(),
    ).toThrow(/Time-series workspace capability requires tables\.timeSeries/i);
  });

  it("rejects analysis tables that are not TableType.Analysis", () => {
    expect(() =>
      createExploreBuilder()
        .setTables({
          analysis: {
            type: TableType.TimeSeries,
            rows: [
              {
                id: "test-row",
                label: "Test row",
                format: () => ({ text: "value" }),
              },
            ],
          },
        })
        .build(),
    ).toThrow(/tables\.analysis must use TableType\.Analysis/i);
  });

  it("defaults quantities.extend to an empty list", () => {
    expect(createExploreBuilder().build().quantities.extend).toEqual([]);
  });

  it("accepts model-scoped quantity extensions owned by this model", () => {
    const extension = {
      id: "pmv.testMass",
      owner: ModelId.PmvAshrae,
      scope: PhysicalQuantityScope.Model,
      label: "Test mass",
      display: {
        units: { SI: SiUnit.Kilogram, IP: "lb" },
        displayUnits: { SI: "kg", IP: "lb" },
        step: 1,
        decimals: 0,
      },
      defaultSi: 70,
      minSi: 40,
      maxSi: 120,
    };
    expect(
      createExploreBuilder().extendQuantities([extension]).build().quantities
        .extend,
    ).toEqual([extension]);
  });

  it("rejects quantity extensions owned by another model", () => {
    expect(() =>
      createExploreBuilder()
        .extendQuantities([
          {
            id: "pmv.testMass",
            owner: ModelId.Phs2023,
            scope: PhysicalQuantityScope.Model,
            label: "Test mass",
            display: {
              units: { SI: SiUnit.Kilogram, IP: "lb" },
              displayUnits: { SI: "kg", IP: "lb" },
              step: 1,
              decimals: 0,
            },
            defaultSi: 70,
            minSi: 40,
            maxSi: 120,
          },
        ])
        .build(),
    ).toThrow(/owner phs-2023 does not match pmv-ashrae/);
  });

  it("rejects quantity extensions that collide with the system seed", () => {
    expect(() =>
      createExploreBuilder()
        .extendQuantities([
          {
            id: PhysicalQuantityId.DryBulbTemperature,
            owner: ModelId.PmvAshrae,
            scope: PhysicalQuantityScope.Model,
            label: "Air temperature",
            display: {
              units: { SI: SiUnit.DegreeCelsius, IP: "degF" },
              displayUnits: { SI: "°C", IP: "°F" },
              step: 0.5,
              decimals: 1,
            },
            defaultSi: 25,
            minSi: 10,
            maxSi: 40,
          },
        ])
        .build(),
    ).toThrow(/collides with a system-seed quantity/);
  });

  it("contributes and exposes a model quantity before catalog assembly", () => {
    const extension = {
      id: "audit.exampleMass",
      owner: ModelId.PmvAshrae,
      scope: PhysicalQuantityScope.Model,
      label: "Example mass",
      display: {
        units: { SI: SiUnit.Kilogram, IP: "lb" },
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

    expect(definition.quantities.extend.map((entry) => entry.id)).toEqual([
      extension.id,
    ]);
    expect(definition.inputFields).toEqual([
      { kind: "modelQuantity", quantityId: extension.id },
    ]);
    expect(definition.controls.map(({ id }) => id)).toEqual([extension.id]);
  });

  it("rejects a modelQuantity field that is not in quantities.extend", () => {
    expect(() =>
      createExploreBuilder()
        .setInputFields([
          { kind: "modelQuantity", quantityId: "audit.exampleMass" },
        ])
        .build(),
    ).toThrow(
      /modelQuantity field audit.exampleMass must reference a quantities.extend entry owned by pmv-ashrae/,
    );
  });
});

describe("defineModel", () => {
  const defineModelBase = {
    id: ModelId.PmvAshrae,
    label: "Test model",
    description: "Test model description.",
    standardIds: [] as const,
    workspaceCapabilities: [WorkspaceId.Explore],
    exploreOutputs: [pmvOutput],
    modifiers: [],
    inputFields: [],
    tables: {
      analysis: {
        type: TableType.Analysis,
        rows: [
          {
            id: "test-row",
            label: "Test row",
            format: () => ({ text: "value" }),
          },
        ],
      },
    },
    calculate: () => ({
      resultsByInput: createEmptyResults<unknown>(),
      chartSource: null,
    }),
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
  };

  it("assembles a complete declaration into a runtime definition", () => {
    const definition = defineModel({
      ...defineModelBase,
      charts: [createModelDynamicFieldChart()],
    });

    expect(definition.id).toBe(ModelId.PmvAshrae);
    expect(definition.inputFields).toEqual([]);
    expect(definition.chartInstances.defaultInstanceId).toBe(
      "test-dynamic-field",
    );
    expect(definition.buildChart).toBeTypeOf("function");
    expect(definition.buildTable).toBeTypeOf("function");
  });

  it("accepts frontend ChartType registrations on ComfortModelBuilder", () => {
    const definition = createExploreBuilder(createFrontendCharts()[0]!).build();
    expect(definition.chartEngineRegistrations[0]?.registration.type).toBe(
      ChartType.Dynamic,
    );
  });

  it("builds a ready non-empty chart for defineModel Dynamic", () => {
    const definition = defineModel({
      ...defineModelBase,
      charts: [createModelDynamicFieldChart()],
    });
    const resultsByInput = {
      ...createEmptyResults<unknown>(),
      [InputId.Input1]: { value: 1 },
    };
    const chartSource = { inputs: { [InputId.Input1]: {} } };

    for (const { instanceId } of definition.chartInstances.entries) {
      const result = definition.buildChart(
        instanceId,
        chartSource,
        resultsByInput,
        modelChartBuildProfile,
        {
          unitSystem: UnitSystem.SI,
          baselineInputId: InputId.Input1,
          chartSourceVersion: 1,
          modelInputs: {},
        },
      );
      expect(result.readiness, instanceId).toBe("ready");
      expect(result.payload, instanceId).not.toBeNull();
    }
  });

  it("rejects duplicate ChartType on one model", () => {
    expect(() =>
      defineModel({
        ...defineModelBase,
        charts: [
          createModelDynamicFieldChart("type-a"),
          createModelDynamicFieldChart("type-b"),
        ],
      }),
    ).toThrow(/duplicate chart types/);
  });

  it("rejects defineModel Psychrometric charts even when the type is bypassed", () => {
    expect(() =>
      defineModel({
        ...defineModelBase,
        charts: [
          createPmvPsychrometricChart() as unknown as ModelChartDeclaration,
        ],
      }),
    ).toThrow(/defineModel can only declare Dynamic/);
  });

  it("rejects mixed defineModel type/spec pairing even when the type is bypassed", () => {
    expect(() =>
      defineModel({
        ...defineModelBase,
        charts: [
          {
            id: "mixed",
            type: ChartType.Utci,
            emptyMessage: "No chart.",
            spec: createModelDynamicFieldChart().spec,
          } as unknown as ModelChartDeclaration,
        ],
      }),
    ).toThrow(/defineModel can only declare Dynamic/);
  });

  it("rejects defineModel Plotly builders even when the type is bypassed", () => {
    expect(() =>
      defineModel({
        ...defineModelBase,
        charts: [
          {
            ...createModelDynamicFieldChart(),
            spec: {
              title: "Test",
              axisFields: [
                PhysicalQuantityId.DryBulbTemperature,
                PhysicalQuantityId.RelativeHumidity,
              ],
              build: () => null,
            },
          } as unknown as ModelChartDeclaration,
        ],
      }),
    ).toThrow(/defineModel cannot provide a Plotly build/);
  });
});
