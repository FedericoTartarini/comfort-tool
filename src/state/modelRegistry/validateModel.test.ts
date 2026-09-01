import { describe, expect, it } from "vitest";
import { PhysicalQuantityId } from "../../catalog/quantities";

import { ModelId } from "../../catalog/modelIds";
import { ChartType } from "../../catalog/chartTypes";
import { SurfaceId } from "../../catalog/surfaces";
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
  return {
    extraQuantities: [],
    chartInstances: {
      entries: [
        {
          instanceId: ChartType.Dynamic,
          type: ChartType.Dynamic,
        },
      ],
    },
    chartEngineRegistrations: [
      {
        instanceId: ChartType.Dynamic,
        registration: { type: ChartType.Dynamic },
      },
    ],
    tables: resultsTable,
    surfaceCapabilities: [SurfaceId.Explore],
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

  it("allows the same ChartType on different models", () => {
    expect(() =>
      assembleCatalogs([
        createCatalogSlice({
          id: ModelId.HeatIndex,
          chartInstances: {
            entries: [
              { instanceId: ChartType.Dynamic, type: ChartType.Dynamic },
            ],
          },
          chartEngineRegistrations: [
            {
              instanceId: ChartType.Dynamic,
              registration: { type: ChartType.Dynamic },
            },
          ],
        }),
        createCatalogSlice({
          id: ModelId.Humidex,
          chartInstances: {
            entries: [
              { instanceId: ChartType.Dynamic, type: ChartType.Dynamic },
            ],
          },
          chartEngineRegistrations: [
            {
              instanceId: ChartType.Dynamic,
              registration: { type: ChartType.Dynamic },
            },
          ],
        }),
      ]),
    ).not.toThrow();
  });

  it("fails validateModel on duplicate ChartType on one model", () => {
    expect(() =>
      validateModel(
        createCatalogSlice({
          id: ModelId.HeatIndex,
          chartInstances: {
            entries: [
              { instanceId: ChartType.Dynamic, type: ChartType.Dynamic },
              { instanceId: ChartType.Dynamic, type: ChartType.Dynamic },
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
    ).toThrow(/cannot be declared as extra/);

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
            entries: [{ instanceId: ChartType.Dynamic, type: ChartType.Dynamic }],
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
      surfaceCapabilities: [SurfaceId.Explore],
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
