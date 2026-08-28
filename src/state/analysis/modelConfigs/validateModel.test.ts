import { describe, expect, it } from "vitest";
import { PhysicalQuantityId } from "../../../catalog/quantities";

import { ModelId } from "../../../catalog/modelIds";
import { ChartType } from "../../../catalog/chartTypes";
import { SurfaceId } from "../../../catalog/surfaces";
import { assembledCatalogs, comfortModelOrder, getComfortModelConfig } from ".";
import {
  assembleCatalogs,
  validateModel,
  type CatalogModelSlice,
} from "./validateModel";

const resultsTable = {
  results: [
    {
      id: "audit-row",
      label: "Audit row",
      format: () => ({ text: "value" }),
    },
  ],
} as const;

function createCatalogSlice(
  overrides: Partial<CatalogModelSlice> & Pick<CatalogModelSlice, "id">,
): CatalogModelSlice {
  const instanceId = `${overrides.id}-audit-chart`;
  return {
    extraQuantities: [],
    chartInstances: {
      entries: [
        {
          instanceId,
          type: ChartType.Dynamic,
        },
      ],
    },
    chartEngineRegistrations: [
      {
        instanceId,
        registration: { type: ChartType.Dynamic },
      },
    ],
    tables: resultsTable,
    workspaceCapabilities: [SurfaceId.Explore],
    ...overrides,
  };
}

describe("assembleCatalogs", () => {
  it("validates every registered model during assemble", () => {
    expect(assembledCatalogs.chartTypes.has(ChartType.Dynamic)).toBe(true);

    for (const modelId of comfortModelOrder) {
      expect(() =>
        validateModel(getComfortModelConfig(modelId), assembledCatalogs),
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
              { instanceId: sharedInstanceId, type: ChartType.Dynamic },
            ],
          },
          chartEngineRegistrations: [
            {
              instanceId: sharedInstanceId,
              registration: { type: ChartType.Dynamic },
            },
          ],
        }),
        createCatalogSlice({
          id: ModelId.Humidex,
          chartInstances: {
            entries: [
              { instanceId: sharedInstanceId, type: ChartType.Dynamic },
            ],
          },
          chartEngineRegistrations: [
            {
              instanceId: sharedInstanceId,
              registration: { type: ChartType.Dynamic },
            },
          ],
        }),
      ]),
    ).toThrow(
      /Chart instance ID "audit-shared-instance" is declared by both heat-index and humidex/,
    );

    expect(() =>
      validateModel(
        createCatalogSlice({
          id: ModelId.HeatIndex,
          chartInstances: {
            entries: [
              {
                instanceId: "pmv-ashrae-psychrometric",
                type: ChartType.Dynamic,
              },
            ],
          },
          chartEngineRegistrations: [
            {
              instanceId: "pmv-ashrae-psychrometric",
              registration: { type: ChartType.Dynamic },
            },
          ],
        }),
        assembledCatalogs,
      ),
    ).toThrow(
      /Chart instance ID "pmv-ashrae-psychrometric" is declared by both pmv-ashrae and heat-index/,
    );
  });

  it("fails validateModel on duplicate ChartType on one model", () => {
    expect(() =>
      validateModel(
        createCatalogSlice({
          id: ModelId.HeatIndex,
          chartInstances: {
            entries: [
              { instanceId: "heat-audit-a", type: ChartType.Dynamic },
              { instanceId: "heat-audit-b", type: ChartType.Dynamic },
            ],
          },
        }),
        assembledCatalogs,
      ),
    ).toThrow(/duplicate chart types \(dynamic\)/);
  });

  it("fails validateModel on unknown chart types", () => {
    expect(() =>
      validateModel(
        createCatalogSlice({
          id: ModelId.HeatIndex,
          chartInstances: {
            entries: [{ instanceId: "invented", type: "invented-type" }],
          },
          chartEngineRegistrations: [
            {
              instanceId: "invented",
              registration: { type: "invented-type" },
            },
          ],
        }),
        assembledCatalogs,
      ),
    ).toThrow(/Unknown chart type "invented-type"/);
  });

  it("fails validateModel on extra quantities that are not Extra catalog ids", () => {
    expect(() =>
      validateModel(
        createCatalogSlice({
          id: ModelId.HeatIndex,
          extraQuantities: [PhysicalQuantityId.DryBulbTemperature],
        }),
        assembledCatalogs,
      ),
    ).toThrow(/is not an Extra catalog quantity/);

    expect(() =>
      validateModel(
        createCatalogSlice({
          id: ModelId.HeatIndex,
          extraQuantities: [
            PhysicalQuantityId.BodyWeight,
            PhysicalQuantityId.BodyWeight,
          ],
        }),
        assembledCatalogs,
      ),
    ).toThrow(/duplicate extra quantity/);
  });

  it("fails validateModel on unknown chart types in registrations", () => {
    expect(() =>
      validateModel(
        createCatalogSlice({
          id: ModelId.HeatIndex,
          chartInstances: {
            entries: [{ instanceId: "invented", type: ChartType.Dynamic }],
          },
          chartEngineRegistrations: [
            {
              instanceId: "invented",
              registration: { type: "invented-type" },
            },
          ],
        }),
        assembledCatalogs,
      ),
    ).toThrow(/Unknown chart type "invented-type"/);
  });

  it("fails assemble when a Time-series table lacks Time-series capability", () => {
    const slice = createCatalogSlice({
      id: ModelId.HeatIndex,
      workspaceCapabilities: [SurfaceId.Explore],
      tables: {
        results: resultsTable.results,
        timeSeries: [
          {
            id: "summary-row",
            label: "Summary row",
            format: () => ({ text: "value" }),
          },
        ],
      },
    });

    expect(() => validateModel(slice, assembledCatalogs)).toThrow(
      /tables\.timeSeries is allowed only with Time-series workspace capability/,
    );
    expect(() => assembleCatalogs([slice])).toThrow(
      /tables\.timeSeries is allowed only with Time-series workspace capability/,
    );
  });
});
