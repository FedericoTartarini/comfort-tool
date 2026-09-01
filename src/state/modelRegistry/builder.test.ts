import { describe, expect, it } from "vitest";
import { PhysicalQuantityId } from "../../catalog/quantities";

import { ModelId } from "../../catalog/modelIds";
import { SurfaceId } from "../../catalog/surfaces";
import { ChartType } from "../../catalog/chartTypes";
import { FieldChartProfileKind } from "../../catalog/fieldChartProfile";
import { type ModelOutput, type NumericBand } from "../../catalog/modelCapabilities";
import { InputId } from "../../catalog/inputSlots";
import { UnitSystem } from "../../catalog/units";
import { ParametricYUnit } from "../../engines/comfort/charts/kinds/types";
import {
  ComfortModelBuilder,
  createEmptyResults,
  defineModel,
  parseEmptyOptions,
  type FrontendChartDeclaration,
} from "./builder";

const bands: readonly NumericBand[] = [
  { min: -Infinity, max: Infinity, label: "All values", color: "#ffffff" },
];

const pmvOutput: ModelOutput = {
  key: PhysicalQuantityId.PredictedMeanVote,
  label: "PMV",
  defaultBands: bands,
};

function createModelDynamicFieldChart(): FrontendChartDeclaration {
  return {
    type: ChartType.Dynamic,
    emptyMessage: "No test chart yet.",
    spec: {
      title: "Test",
      axes: {
        x: PhysicalQuantityId.DryBulbTemperature,
        y: PhysicalQuantityId.RelativeHumidity,
      },
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
        axisRanges: {
          [PhysicalQuantityId.DryBulbTemperature]: { min: 10, max: 40 },
          [PhysicalQuantityId.RelativeHumidity]: { min: 0, max: 100 },
        },
      }),
    },
  };
}

function createModelUtciChart(): FrontendChartDeclaration {
  return {
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

function createModelBodyTemperatureChart(): FrontendChartDeclaration {
  return {
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

function createModelAdaptiveChart(): FrontendChartDeclaration {
  return {
    type: ChartType.Adaptive,
    emptyMessage: "No boundary chart yet.",
    spec: {
      title: "Boundary",
      axisFields: [
        PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
        PhysicalQuantityId.OperativeTemperature,
      ],
      outdoorRangeSi: { min: 10, max: 33.5 },
      outdoorLabel: "Outdoor",
      operativeRangeSi: { min: 10, max: 40 },
      evaluate: () => ({}),
      requestFromPoint: (baseline) => baseline,
      getHoverMetadata: () => [],
      buildHoverTemplate: () => "",
    },
  };
}

function createModelHeatLossChart(): FrontendChartDeclaration {
  return {
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
  zOutput: PhysicalQuantityId.PredictedMeanVote,
  bands: [
    { min: 10, max: 20, label: "Low", color: "#eeeeee" },
    { min: 20, max: 40, label: "High", color: "#cccccc" },
  ],
} as const;

const testTableRows = [
  {
    id: "test-row",
    label: "Test row",
    format: () => ({ text: "value" }),
  },
];

function createPmvPsychrometricChart(): FrontendChartDeclaration {
  return {
    type: ChartType.Psychrometric,
    emptyMessage: "No psychrometric chart yet.",
    spec: {
      evaluate: () => null,
      trEqualsTdb: () => false,
    },
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
    .setSurfaceCapabilities([SurfaceId.Explore])
    .setExploreOutputs([pmvOutput])
    .setModifiers([])
    .setCharts([chart])
    .setTables({
      results: testTableRows,
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
    .setDefaultDynamicAxes({ xAxis: PhysicalQuantityId.DryBulbTemperature, yAxis: PhysicalQuantityId.RelativeHumidity });
}

describe("ComfortModelBuilder capabilities", () => {
  it("builds a complete minimal validated configuration snapshot", () => {
    const definition = createExploreBuilder().build();
    expect(definition.chartInstances.defaultInstanceId).toBe(
      ChartType.Dynamic,
    );
    expect(definition.buildChart).toBeTypeOf("function");
    expect(definition.chartInstances.entries[0]).not.toHaveProperty("spec");
    expect(definition.chartEngineRegistrations[0]?.registration.type).toBe(
      ChartType.Dynamic,
    );
  });

  it("accepts Psychrometric on any model when the spec matches ChartType", () => {
    const definition = createExploreBuilder(
      createPmvPsychrometricChart(),
      ModelId.HeatIndex,
    ).build();
    expect(definition.chartEngineRegistrations[0]?.registration.type).toBe(
      ChartType.Psychrometric,
    );
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
          output: PhysicalQuantityId.PredictedMeanVote,
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
          results: testTableRows,
          timeSeries: [
            {
              id: "summary-row",
              label: "Summary row",
              format: () => ({ text: "value" }),
            },
          ],
        })
        .build(),
    ).toThrow(
      /tables\.timeSeries is allowed only with Time-series workspace capability/i,
    );
  });

  it("rejects Time-series capability without a Time-series table", () => {
    expect(() =>
      createExploreBuilder()
        .setSurfaceCapabilities([
          SurfaceId.Explore,
          SurfaceId.TimeSeries,
        ])
        .build(),
    ).toThrow(/Time-series workspace capability requires tables\.timeSeries/i);
  });

  it("exposes a quantity input field for a catalog id without a default widget", () => {
    const definition = createExploreBuilder()
      .setInputFields([
        { kind: "quantity", quantityId: PhysicalQuantityId.BodyWeight, minValue: 30, maxValue: 200 },
      ])
      .build();

    expect(definition.inputFields).toEqual([
      { kind: "quantity", quantityId: PhysicalQuantityId.BodyWeight, minValue: 30, maxValue: 200 },
    ]);
    expect(definition.controls.map(({ id }) => id)).toEqual([
      PhysicalQuantityId.BodyWeight,
    ]);
  });

  it("rejects a derived humidity quantity field", () => {
    expect(() =>
      createExploreBuilder()
        .setInputFields([
          { kind: "quantity", quantityId: PhysicalQuantityId.HumidityRatio, minValue: 0, maxValue: 0.025 },
        ])
        .build(),
    ).toThrow(
      /cannot be a derived humidity slot/,
    );
  });
});

describe("defineModel", () => {
  const defineModelBase = {
    id: ModelId.PmvAshrae,
    library: {
      label: "Test model",
      description: "Test model description.",
    },
    standardIds: [] as const,
    surfaceCapabilities: [SurfaceId.Explore],
    exploreOutputs: [pmvOutput],
    modifiers: [],
    inputFields: [],
    tables: {
      results: testTableRows,
    },
    calculate: () => ({
      resultsByInput: createEmptyResults<unknown>(),
      chartSource: null,
    }),
    dynamicAxisFields: [
      PhysicalQuantityId.DryBulbTemperature,
      PhysicalQuantityId.RelativeHumidity,
    ],
    defaultDynamicAxes: { xAxis: PhysicalQuantityId.DryBulbTemperature, yAxis: PhysicalQuantityId.RelativeHumidity },
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
      ChartType.Dynamic,
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
          createModelDynamicFieldChart(),
          createModelDynamicFieldChart(),
        ],
      }),
    ).toThrow(/duplicate chart types/);
  });

  it("accepts defineModel Psychrometric charts when the spec matches", () => {
    const definition = defineModel({
      ...defineModelBase,
      charts: [createPmvPsychrometricChart()],
    });
    expect(definition.chartEngineRegistrations[0]?.registration.type).toBe(
      ChartType.Psychrometric,
    );
  });

  it("rejects mixed defineModel type/spec pairing", () => {
    expect(() =>
      defineModel({
        ...defineModelBase,
        charts: [
          {
            type: ChartType.Utci,
            emptyMessage: "No chart.",
            spec: createModelDynamicFieldChart().spec,
          } as unknown as FrontendChartDeclaration,
        ],
      }),
    ).toThrow(/spec does not match type/);
  });

  it("rejects defineModel Dynamic charts that still carry a Plotly build()", () => {
    expect(() =>
      defineModel({
        ...defineModelBase,
        charts: [
          {
            ...createModelDynamicFieldChart(),
            spec: { title: "Test", axisFields: [
                PhysicalQuantityId.DryBulbTemperature, PhysicalQuantityId.RelativeHumidity, ], build: () => null },
          } as unknown as FrontendChartDeclaration,
        ],
      }),
    ).toThrow(/spec does not match type/);
  });
});
