import { describe, expect, expectTypeOf, it } from "vitest";

import { ModelId } from "../../../models/comfortModels";
import { ChartEngine } from "../../../models/output/chartKinds";
import { TableType } from "../../../models/output/tableLayouts";
import { WorkspaceId } from "../../../models/workspaces";
import {
  PhysicalQuantityId,
  PhysicalQuantityScope,
} from "../../../models/physicalQuantities";
import { PhsQuantityId } from "../../../models/phs";
import { assembledCatalogs, comfortModelOrder, getComfortModelConfig } from ".";
import {
  assembleCatalogs,
  type AssembledCatalogs,
  type CatalogModelSlice,
} from "./validateModel";

const analysisTable = {
  analysis: {
    type: TableType.Analysis,
    rows: [
      {
        id: "audit-row",
        label: "Audit row",
        format: () => ({ text: "value" }),
      },
    ],
  },
} as const;

function createCatalogSlice(
  overrides: Partial<CatalogModelSlice> & Pick<CatalogModelSlice, "id">,
): CatalogModelSlice {
  const instanceId = `${overrides.id}-audit-chart`;
  return {
    quantities: { extend: [] },
    chartInstances: {
      entries: [
        {
          instanceId,
          engine: ChartEngine.DynamicField,
        },
      ],
    },
    chartEngineRegistrations: [
      {
        instanceId,
        registration: { engine: ChartEngine.DynamicField },
      },
    ],
    tables: analysisTable,
    workspaceCapabilities: [WorkspaceId.Explore],
    ...overrides,
  };
}

function installedValidateModel(catalogs: AssembledCatalogs) {
  const hook = catalogs.validate?.model;
  if (hook === undefined) {
    throw new Error("assembleCatalogs must install validate.model");
  }
  return hook;
}

const exampleMass = {
  id: "audit.exampleMass",
  owner: ModelId.HeatIndex,
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
} as const;

describe("assembled catalog validate.model", () => {
  it("types validate.model as an optional catalog hook", () => {
    expectTypeOf<AssembledCatalogs["validate"]>().toEqualTypeOf<
      | {
          readonly model?: (model: CatalogModelSlice) => void;
        }
      | undefined
    >();
    expectTypeOf<
      NonNullable<AssembledCatalogs["validate"]>["model"]
    >().toEqualTypeOf<((model: CatalogModelSlice) => void) | undefined>();

    const withoutHook: AssembledCatalogs = {
      quantities: {},
      chartInstanceOwners: new Map(),
      chartTypeOwners: new Map(),
      chartEngines: new Set(),
      tableTypes: new Set(),
    };
    const validateWithoutModel: AssembledCatalogs = {
      ...withoutHook,
      validate: {},
    };
    expect(withoutHook.validate).toBeUndefined();
    expect(validateWithoutModel.validate?.model).toBeUndefined();
  });

  it("exists on assembled catalogs and accepts every registered model", () => {
    const validateModelHook = installedValidateModel(assembledCatalogs);
    expect(assembledCatalogs.chartEngines.has(ChartEngine.DynamicField)).toBe(
      true,
    );
    expect(assembledCatalogs.tableTypes.has(TableType.Analysis)).toBe(true);

    for (const modelId of comfortModelOrder) {
      expect(() =>
        validateModelHook(getComfortModelConfig(modelId)),
      ).not.toThrow();
    }
  });

  it("fails assemble on duplicate chart instance ids", () => {
    const sharedInstanceId = "audit-shared-instance";
    expect(() =>
      assembleCatalogs([
        createCatalogSlice({
          id: ModelId.HeatIndex,
          chartInstances: {
            entries: [
              { instanceId: sharedInstanceId, engine: ChartEngine.DynamicField },
            ],
          },
          chartEngineRegistrations: [
            {
              instanceId: sharedInstanceId,
              registration: { engine: ChartEngine.DynamicField },
            },
          ],
        }),
        createCatalogSlice({
          id: ModelId.Humidex,
          chartInstances: {
            entries: [
              { instanceId: sharedInstanceId, engine: ChartEngine.DynamicField },
            ],
          },
          chartEngineRegistrations: [
            {
              instanceId: sharedInstanceId,
              registration: { engine: ChartEngine.DynamicField },
            },
          ],
        }),
      ]),
    ).toThrow(
      /Chart instance ID "audit-shared-instance" is declared by both heat-index and humidex/,
    );

    expect(() =>
      installedValidateModel(assembledCatalogs)(
        createCatalogSlice({
          id: ModelId.HeatIndex,
          chartInstances: {
            entries: [
              {
                instanceId: "pmv-ashrae-psychrometric",
                engine: ChartEngine.DynamicField,
              },
            ],
          },
          chartEngineRegistrations: [
            {
              instanceId: "pmv-ashrae-psychrometric",
              registration: { engine: ChartEngine.DynamicField },
            },
          ],
        }),
      ),
    ).toThrow(
      /Chart instance ID "pmv-ashrae-psychrometric" is declared by both pmv-ashrae and heat-index/,
    );
  });

  it("fails assemble on duplicate named chart types", () => {
    expect(() =>
      assembleCatalogs([
        createCatalogSlice({
          id: ModelId.HeatIndex,
          chartInstances: {
            entries: [
              {
                instanceId: "heat-audit",
                engine: ChartEngine.DynamicField,
                type: "audit.shared-type",
              },
            ],
          },
        }),
        createCatalogSlice({
          id: ModelId.Humidex,
          chartInstances: {
            entries: [
              {
                instanceId: "humidex-audit",
                engine: ChartEngine.DynamicField,
                type: "audit.shared-type",
              },
            ],
          },
        }),
      ]),
    ).toThrow(
      /Chart type "audit.shared-type" is declared by both heat-index and humidex/,
    );
  });

  it("fails assemble on duplicate quantity ids across declarations", () => {
    expect(() =>
      assembleCatalogs([
        createCatalogSlice({
          id: ModelId.HeatIndex,
          quantities: { extend: [exampleMass] },
        }),
        createCatalogSlice({
          id: ModelId.Humidex,
          quantities: {
            extend: [{ ...exampleMass, owner: ModelId.Humidex }],
          },
        }),
      ]),
    ).toThrow(/Duplicate quantity id "audit.exampleMass"/);
  });

  it("fails validate.model on duplicate quantity ids", () => {
    const validateModelHook = installedValidateModel(assembledCatalogs);

    expect(() =>
      validateModelHook(
        createCatalogSlice({
          id: ModelId.HeatIndex,
          quantities: { extend: [exampleMass, { ...exampleMass }] },
        }),
      ),
    ).toThrow(/Duplicate quantity id "audit.exampleMass"/);

    expect(() =>
      validateModelHook(
        createCatalogSlice({
          id: ModelId.HeatIndex,
          quantities: {
            extend: [{ ...exampleMass, id: PhysicalQuantityId.HumidityRatio }],
          },
        }),
      ),
    ).toThrow(/Duplicate quantity id "hr"/);
  });

  it("fails validate.model on wrong quantity owners", () => {
    const validateModelHook = installedValidateModel(assembledCatalogs);

    expect(() =>
      validateModelHook(
        createCatalogSlice({
          id: ModelId.HeatIndex,
          quantities: {
            extend: [
              {
                id: PhsQuantityId.BodyWeight,
                owner: ModelId.Phs2023,
                scope: PhysicalQuantityScope.Model,
                label: "Body weight",
                display: {
                  units: { SI: "kg", IP: "lb" },
                  displayUnits: { SI: "kg", IP: "lb" },
                  step: 1,
                  decimals: 1,
                },
                defaultSi: 75,
                minSi: 30,
                maxSi: 200,
              },
            ],
          },
        }),
      ),
    ).toThrow(
      'Quantity extension "phs.bodyWeight" is owned by phs-2023 but registered on heat-index.',
    );

    expect(() =>
      validateModelHook(
        createCatalogSlice({
          id: ModelId.HeatIndex,
          quantities: {
            extend: [
              {
                id: PhsQuantityId.BodyWeight,
                owner: ModelId.HeatIndex,
                scope: PhysicalQuantityScope.Model,
                label: "Body weight",
                display: {
                  units: { SI: "kg", IP: "lb" },
                  displayUnits: { SI: "kg", IP: "lb" },
                  step: 1,
                  decimals: 1,
                },
                defaultSi: 75,
                minSi: 30,
                maxSi: 200,
              },
            ],
          },
        }),
      ),
    ).toThrow(
      'Quantity extension "phs.bodyWeight" is owned by phs-2023 but registered on heat-index.',
    );
  });

  it("fails validate.model on unknown chart engines", () => {
    expect(() =>
      installedValidateModel(assembledCatalogs)(
        createCatalogSlice({
          id: ModelId.HeatIndex,
          chartInstances: {
            entries: [{ instanceId: "invented", engine: "invented-engine" }],
          },
          chartEngineRegistrations: [
            {
              instanceId: "invented",
              registration: { engine: "invented-engine" },
            },
          ],
        }),
      ),
    ).toThrow(/Unknown chart engine "invented-engine"/);
  });

  it("fails assemble when a TimeSeries table lacks Time-series capability", () => {
    const slice = createCatalogSlice({
      id: ModelId.HeatIndex,
      workspaceCapabilities: [WorkspaceId.Explore],
      tables: {
        analysis: analysisTable.analysis,
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
      },
    });

    expect(() => installedValidateModel(assembledCatalogs)(slice)).toThrow(
      /tables\.timeSeries is allowed only with Time-series workspace capability/,
    );
    expect(() => assembleCatalogs([slice])).toThrow(
      /tables\.timeSeries is allowed only with Time-series workspace capability/,
    );
  });
});
