import { describe, expect, it } from "vitest";

import { ComfortModel } from "../../../models/comfortModels";
import {
  PhysicalQuantityId,
  PhysicalQuantityScope,
} from "../../../models/physicalQuantities";
import { WorkspaceCapability } from "../../../models/output/workspaceCapabilities";
import { ChartKind } from "../../../models/output/chartKinds";
import { TableType } from "../../../models/output/tableLayouts";
import { FieldChartProfileKind } from "../../../models/output/fieldChartProfile";
import {
  ModelOutputKey,
  type ModelOutput,
  type NumericBand,
} from "../../../models/modelCapabilities";
import { InputId } from "../../../models/inputSlots";
import { UnitSystem } from "../../../models/units";
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
  instanceId = "test-dynamic-field",
): ModelChartDeclaration {
  return {
    instanceId,
    kind: ChartKind.DynamicField,
    name: "Test chart",
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

function createModelBandScalarChart(
  instanceId = "test-band-scalar",
): ModelChartDeclaration {
  return {
    instanceId,
    kind: ChartKind.BandScalar,
    name: "Stress",
    emptyMessage: "No stress chart yet.",
    capabilities: {
      allowsAxisSelection: false,
      locksYAxis: false,
      allowsOutputSelection: false,
      allowsBandEditing: false,
      allowsBaselineSelection: true,
      showsZoneToggle: false,
      showsLegend: true,
      showsExport: true,
    },
    spec: {
      title: "Stress",
      getOutputValue: () => 0,
    },
  };
}

function createModelTimeSeriesChart(
  instanceId = "test-time-series-line",
): ModelChartDeclaration {
  return {
    instanceId,
    kind: ChartKind.TimeSeriesLine,
    name: "History",
    emptyMessage: "No history chart yet.",
    capabilities: {
      allowsAxisSelection: false,
      locksYAxis: false,
      allowsOutputSelection: true,
      allowsBandEditing: false,
      allowsBaselineSelection: true,
      showsZoneToggle: false,
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

function createModelBoundaryChart(
  instanceId = "test-boundary-region",
): ModelChartDeclaration {
  return {
    instanceId,
    kind: ChartKind.BoundaryRegion,
    name: "Boundary",
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

function createModelEngineCharts(): ModelChartDeclaration[] {
  return [
    createModelDynamicFieldChart(),
    createModelBandScalarChart(),
    createModelBoundaryChart(),
    createModelTimeSeriesChart(),
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

function createPmvPsychrometricCustomChart(): FrontendChartDeclaration {
  return {
    instanceId: "test-pmv-custom",
    kind: ChartKind.Custom,
    name: "Psychrometric",
    emptyMessage: "No psychrometric chart yet.",
    spec: { build: () => null },
  };
}

function createExploreBuilder(
  chart: FrontendChartDeclaration = createModelDynamicFieldChart(),
  modelId: ComfortModel = ComfortModel.PmvAshrae,
) {
  return new ComfortModelBuilder<unknown, unknown>(modelId)
    .setLabel("Test model")
    .setDescription("Test model description.")
    .setStandardIds([])
    .setWorkspaceCapabilities([WorkspaceCapability.Explore])
    .setExploreOutputs([pmvOutput])
    .setModifiers([])
    .setOutputCharts([chart])
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
    expect(definition.outputCharts.defaultInstanceId).toBe(
      "test-dynamic-field",
    );
    expect(definition.buildChart).toBeTypeOf("function");
    expect(definition.outputCharts.entries[0]).not.toHaveProperty("spec");
    expect(definition.chartKindRegistrations[0]?.registration.kind).toBe(
      ChartKind.DynamicField,
    );
  });

  it("accepts Custom on PMV models", () => {
    const definition = createExploreBuilder(
      createPmvPsychrometricCustomChart(),
    ).build();
    expect(definition.chartKindRegistrations[0]?.registration.kind).toBe(
      ChartKind.Custom,
    );
    expect(definition.outputCharts.defaultInstanceId).toBe("test-pmv-custom");
  });

  it("rejects Custom charts on non-PMV models", () => {
    expect(() =>
      createExploreBuilder(
        {
          instanceId: "not-psychrometric",
          kind: ChartKind.Custom,
          name: "Nope",
          emptyMessage: "No chart.",
          spec: { build: () => null },
        },
        ComfortModel.HeatIndex,
      ),
    ).toThrow(/Custom is frontend-only for PMV psychrometric geometry/);
  });

  it("rejects unknown chart engines", () => {
    expect(() =>
      createExploreBuilder({
        instanceId: "invented",
        kind: "invented-engine",
        name: "Nope",
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
    ).toThrow(/Unknown chart engine/);
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
          WorkspaceCapability.Explore,
          WorkspaceCapability.TimeSeries,
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
          },
        ])
        .build(),
    ).toThrow(/owner PHS_2023 does not match PMV_ASHRAE/);
  });

  it("rejects quantity extensions that collide with the system seed", () => {
    expect(() =>
      createExploreBuilder()
        .extendQuantities([
          {
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
          },
        ])
        .build(),
    ).toThrow(/collides with a system-seed quantity/);
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

    expect(definition.quantities.extend.map((entry) => entry.id)).toEqual([
      extension.id,
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
      /modelQuantity field audit.exampleMass must reference a quantities.extend entry owned by PMV_ASHRAE/,
    );
  });
});

describe("defineModel", () => {
  const defineModelBase = {
    id: ComfortModel.PmvAshrae,
    label: "Test model",
    description: "Test model description.",
    standardIds: [] as const,
    workspaceCapabilities: [WorkspaceCapability.Explore],
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
      outputCharts: [createModelDynamicFieldChart()],
    });

    expect(definition.id).toBe(ComfortModel.PmvAshrae);
    expect(definition.outputCharts.defaultInstanceId).toBe(
      "test-dynamic-field",
    );
    expect(definition.buildChart).toBeTypeOf("function");
    expect(definition.buildTable).toBeTypeOf("function");
  });

  it("accepts data-only defineModel charts for every permitted engine", () => {
    const definition = defineModel({
      ...defineModelBase,
      outputCharts: createModelEngineCharts(),
    });

    expect(
      definition.chartKindRegistrations.map(
        ({ registration }) => registration.kind,
      ),
    ).toEqual([
      ChartKind.DynamicField,
      ChartKind.BandScalar,
      ChartKind.BoundaryRegion,
      ChartKind.TimeSeriesLine,
    ]);
  });

  it("builds a ready non-empty chart for every defineModel engine", () => {
    const definition = defineModel({
      ...defineModelBase,
      outputCharts: createModelEngineCharts(),
    });
    const resultsByInput = {
      ...createEmptyResults<unknown>(),
      [InputId.Input1]: { value: 1 },
    };
    const chartSource = { inputs: { [InputId.Input1]: {} } };

    for (const { instanceId } of definition.outputCharts.entries) {
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
      expect(result.plotly, instanceId).not.toBeNull();
      expect(result.plotly?.traces.length, instanceId).toBeGreaterThan(0);
    }
  });

  it("accepts a named extended type on an existing defineModel engine", () => {
    const definition = defineModel({
      ...defineModelBase,
      outputCharts: [
        {
          ...createModelBandScalarChart(),
          type: "audit.stress-band",
        },
      ],
    });

    expect(definition.outputCharts.entries[0]?.type).toBe("audit.stress-band");
    expect(definition.chartKindRegistrations[0]?.registration.kind).toBe(
      ChartKind.BandScalar,
    );
  });

  it("rejects duplicate named chart types", () => {
    expect(() =>
      defineModel({
        ...defineModelBase,
        outputCharts: [
          { ...createModelBandScalarChart("type-a"), type: "audit.dup" },
          { ...createModelBandScalarChart("type-b"), type: "audit.dup" },
        ],
      }),
    ).toThrow(/duplicate chart types/);
  });

  it("rejects an empty named chart type", () => {
    expect(() =>
      defineModel({
        ...defineModelBase,
        outputCharts: [{ ...createModelBandScalarChart(), type: "   " }],
      }),
    ).toThrow(/empty type/);
  });

  it("rejects defineModel Custom charts even when the type is bypassed", () => {
    expect(() =>
      defineModel({
        ...defineModelBase,
        outputCharts: [
          createPmvPsychrometricCustomChart() as unknown as ModelChartDeclaration,
        ],
      }),
    ).toThrow(/defineModel cannot add ChartEngine members or declare Custom/);
  });

  it("rejects an extended type that escapes onto Custom", () => {
    expect(() =>
      defineModel({
        ...defineModelBase,
        outputCharts: [
          {
            ...createPmvPsychrometricCustomChart(),
            type: "audit.escape",
          } as unknown as ModelChartDeclaration,
        ],
      }),
    ).toThrow(/defineModel cannot add ChartEngine members or declare Custom/);
  });

  it("rejects mixed defineModel engine/spec pairing even when the type is bypassed", () => {
    expect(() =>
      defineModel({
        ...defineModelBase,
        outputCharts: [
          {
            instanceId: "mixed",
            kind: ChartKind.BandScalar,
            name: "Nope",
            emptyMessage: "No chart.",
            spec: createModelDynamicFieldChart().spec,
          } as unknown as ModelChartDeclaration,
        ],
      }),
    ).toThrow(/spec does not match engine/);
  });

  it("rejects defineModel Plotly builders even when the type is bypassed", () => {
    expect(() =>
      defineModel({
        ...defineModelBase,
        outputCharts: [
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
