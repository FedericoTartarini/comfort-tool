import { describe, expect, it } from "vitest";
import { PhysicalQuantityId } from "../../catalog/quantities";

import { ModelId } from "../../catalog/modelIds";
import { ChartType } from "../../catalog/chartTypes";
import type { ChartPayload } from "../../charts/types";
import { FieldChartProfileKind } from "../../catalog/fieldChartProfile";
import { type ModelOutput, type NumericBand } from "../../catalog/modelCapabilities";
import { InputId } from "../../catalog/inputSlots";
import { UnitSystem } from "../../catalog/units";
import { ParametricYUnit } from "../../engines/comfort/charts/kinds/types";
import { measuredAirSpeedModifier } from "../../engines/comfort/inputModifiers";
import {
  createEmptyResults,
  defineModel,
  inputQuantity,
  parseEmptyOptions,
  resultQuantity,
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

function testLibrary() {
  return {};
}
testLibrary.label = "Test model";
testLibrary.description = "Test model description.";

function defineExploreModel(
  options: {
    chart?: FrontendChartDeclaration;
    charts?: readonly FrontendChartDeclaration[];
    modelId?: ModelId;
    inputs?: Parameters<typeof defineModel>[1]["inputs"];
    standardIds?: Parameters<typeof defineModel>[1]["standardIds"];
    tables?: Parameters<typeof defineModel>[1]["tables"];
    features?: Parameters<typeof defineModel>[1]["features"];
  } = {},
) {
  const chart = options.chart ?? createModelDynamicFieldChart();
  return defineModel(testLibrary, {
    id: options.modelId ?? ModelId.PmvAshrae,
    standardIds: options.standardIds ?? [],
    exploreMode: true,
    inputs: options.inputs ?? [],
    response: {
      values: [
        resultQuantity("pmv", PhysicalQuantityId.PredictedMeanVote),
      ],
    },
    tables: options.tables ?? { results: testTableRows },
    charts: options.charts ?? [chart],
    features: {
      exploreOutputs: [pmvOutput],
      invoke: () => ({}),
      defaultOptions: {},
      parseOptions: parseEmptyOptions,
      ...options.features,
    },
    dynamicAxisFields: [
      PhysicalQuantityId.DryBulbTemperature,
      PhysicalQuantityId.RelativeHumidity,
    ],
    defaultDynamicAxes: {
      xAxis: PhysicalQuantityId.DryBulbTemperature,
      yAxis: PhysicalQuantityId.RelativeHumidity,
    },
  });
}

describe("defineModel assembly", () => {
  it("builds a complete minimal validated configuration snapshot", () => {
    const definition = defineExploreModel();
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
    const definition = defineExploreModel({
      chart: createPmvPsychrometricChart(),
      modelId: ModelId.HeatIndex,
    });
    expect(definition.chartEngineRegistrations[0]?.registration.type).toBe(
      ChartType.Psychrometric,
    );
  });

  it("rejects unknown chart types", () => {
    expect(() =>
      defineExploreModel({
        chart: {
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
        } as unknown as FrontendChartDeclaration,
      }),
    ).toThrow(/Unknown chart type/);
  });

  it("requires Standard workspace for compliance profile", () => {
    expect(() =>
      defineExploreModel({
        features: {
          complianceProfile: {
            output: PhysicalQuantityId.PredictedMeanVote,
            bands,
            legendTitle: "Bands",
            caption: "Caption",
            getFeedback: () => ({ text: "ok", passes: true }),
          },
        },
      }),
    ).toThrow(/without Standard workspace/i);
  });

  it("rejects a Time-series table without Time-series capability", () => {
    expect(() =>
      defineExploreModel({
        tables: {
          results: testTableRows,
          timeSeries: [
            {
              id: "summary-row",
              label: "Summary row",
              format: () => ({ text: "value" }),
            },
          ],
        } as never,
      }),
    ).toThrow(
      /tables\.timeSeries is not a Compare table; declare features\.timeSeries/,
    );
  });

  it("rejects Time-series simulation without rows", () => {
    expect(() =>
      defineExploreModel({
        features: {
          timeSeries: {
            simulation: {
              charts: [{
                id: "test-history",
                type: ChartType.BodyTemperature,
                title: "Body temperature",
                description: "Test",
                emptyMessage: "Empty",
                heightClass: "h-10",
                spec: { build: () => ({
                  type: ChartType.BodyTemperature,
                  input: {
                    xAxis: { title: "t", range: [0, 1] },
                    yAxis: { title: "T", range: [0, 1] },
                    series: [],
                  },
                } satisfies ChartPayload) },
              }],
            },
          } as never,
        },
      }),
    ).toThrow(/features\.timeSeries requires rows and simulation charts/);
  });

  it("exposes a quantity input field for a catalog id without a default widget", () => {
    const definition = defineExploreModel({
      inputs: [
        inputQuantity("weight", PhysicalQuantityId.BodyWeight, {
          minValue: 30,
          maxValue: 200,
        }),
      ],
    });

    expect(definition.inputFields).toEqual([
      { kind: "quantity", quantityId: PhysicalQuantityId.BodyWeight, minValue: 30, maxValue: 200 },
    ]);
    expect(definition.controls.map(({ id }) => id)).toEqual([
      PhysicalQuantityId.BodyWeight,
    ]);
  });

  it("rejects a derived humidity quantity field", () => {
    expect(() =>
      defineExploreModel({
        inputs: [
          inputQuantity("hr", PhysicalQuantityId.HumidityRatio, {
            minValue: 0,
            maxValue: 0.025,
          }),
        ],
      }),
    ).toThrow(
      /cannot be a derived humidity slot/,
    );
  });

  it("rejects a modifier input quantity field", () => {
    expect(() =>
      defineExploreModel({
        inputs: [
          inputQuantity("v_measured", PhysicalQuantityId.MeasuredAirSpeed, {
            minValue: 0,
            maxValue: 2,
          }),
        ],
      }),
    ).toThrow(/cannot occupy a modifier input/);
  });

  it("rejects a modifier missing SI range for its inputs", () => {
    expect(() =>
      defineExploreModel({
        features: {
          modifiers: [{
            ...measuredAirSpeedModifier,
            modifierInputRangeSi: {} as typeof measuredAirSpeedModifier.modifierInputRangeSi,
          }],
        },
      }),
    ).toThrow(/missing SI range/);
  });
});

describe("defineModel", () => {
  function testLibrary() {
    return {};
  }
  testLibrary.label = "Test model";
  testLibrary.description = "Test model description.";

  const defineModelBase = {
    id: ModelId.PmvAshrae,
    standardIds: [] as const,
    exploreMode: true,
    inputs: [],
    response: {
      values: [
        resultQuantity("pmv", PhysicalQuantityId.PredictedMeanVote),
      ],
    },
    tables: {
      results: testTableRows,
    },
    features: {
      exploreOutputs: [pmvOutput],
      invoke: () => ({}),
      defaultOptions: {},
      parseOptions: parseEmptyOptions,
    },
    dynamicAxisFields: [
      PhysicalQuantityId.DryBulbTemperature,
      PhysicalQuantityId.RelativeHumidity,
    ],
    defaultDynamicAxes: { xAxis: PhysicalQuantityId.DryBulbTemperature, yAxis: PhysicalQuantityId.RelativeHumidity },
  } as const;

  it("assembles a complete declaration into a runtime definition", () => {
    const definition = defineModel(testLibrary, {
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
    expect(definition.exploreMode).toBe(true);
  });

  it("accepts frontend ChartType registrations on defineModel", () => {
    const definition = defineExploreModel({
      chart: createFrontendCharts()[0]!,
    });
    expect(definition.chartEngineRegistrations[0]?.registration.type).toBe(
      ChartType.Dynamic,
    );
  });

  it("builds a ready non-empty chart for defineModel Dynamic", () => {
    const definition = defineModel(testLibrary, {
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
      defineModel(testLibrary, {
        ...defineModelBase,
        charts: [
          createModelDynamicFieldChart(),
          createModelDynamicFieldChart(),
        ],
      }),
    ).toThrow(/duplicate chart types/);
  });

  it("accepts defineModel Psychrometric charts when the spec matches", () => {
    const definition = defineModel(testLibrary, {
      ...defineModelBase,
      charts: [createPmvPsychrometricChart()],
    });
    expect(definition.chartEngineRegistrations[0]?.registration.type).toBe(
      ChartType.Psychrometric,
    );
  });

  it("rejects mixed defineModel type/spec pairing", () => {
    expect(() =>
      defineModel(testLibrary, {
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
      defineModel(testLibrary, {
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
