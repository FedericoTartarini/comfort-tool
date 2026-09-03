import { describe, expect, it } from "vitest";

import { ModelId } from "../../catalog/modelIds";
import { ChartType } from "../../catalog/chartTypes";
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
    exploreMode: true,
    standardIds: [],
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

  it("fails assemble when a Time-series table is declared on Compare tables", () => {
    const slice = createCatalogSlice({
      id: ModelId.HeatIndex,
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
      /tables\.timeSeries is not a Compare table; declare features\.timeSeries/,
    );
    expect(() => assembleCatalogs([slice])).toThrow(
      /tables\.timeSeries is not a Compare table; declare features\.timeSeries/,
    );
  });
});
