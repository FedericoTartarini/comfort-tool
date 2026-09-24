import { heat_index } from "jsthermalcomfort";
import { PhysicalQuantityId } from "../catalog/quantities";
import { ModelId } from "../catalog/modelIds";
import {
  bandsFromJsBins,
  intervalFromBins,
  thermalZonesFromBands,
  tokenMapFromRows,
} from "../catalog/classifierBins";
import { ChartType } from "../catalog/chartTypes";
import { ZoneToken } from "../catalog/zoneTokens";
import {
  defineModel,
  inputQuantity,
  quantityRow,
  resultQuantity,
} from "../state/modelRegistry/builder";

const heatIndexTokenRows = [
  { label: "no risk", token: ZoneToken.Safe },
  { label: "caution", token: ZoneToken.Caution },
  { label: "extreme caution", token: ZoneToken.StrongCaution },
  { label: "danger", token: ZoneToken.Danger },
  { label: "extreme danger", token: ZoneToken.ExtremeDanger },
] as const;

export const heatIndexZonesList = thermalZonesFromBands(
  bandsFromJsBins(heat_index.mapping.bins, heatIndexTokenRows),
  tokenMapFromRows(heatIndexTokenRows),
);

export const heatIndexModelConfig = defineModel(heat_index, {
  id: ModelId.HeatIndex,
  standardIds: [],
  exploreMode: true,

  inputs: [
    inputQuantity("tdb", PhysicalQuantityId.DryBulbTemperature, {
      minValue: 20,
      maxValue: 50,
    }),
    inputQuantity("rh", PhysicalQuantityId.RelativeHumidity, {
      minValue: 0,
      maxValue: 100,
    }),
  ],

  response: {
    values: [resultQuantity("hi", PhysicalQuantityId.HeatIndex)],
    intervals: [
      intervalFromBins(
        PhysicalQuantityId.HeatIndex,
        heat_index.mapping.bins,
        heatIndexTokenRows,
      ),
    ],
  },

  tables: {
    results: [quantityRow(PhysicalQuantityId.HeatIndex)],
  },

  charts: [
    {
      type: ChartType.Dynamic,
      capabilities: { allowsOutputSelection: false },
      spec: {
        axes: {
          x: PhysicalQuantityId.DryBulbTemperature,
          y: PhysicalQuantityId.RelativeHumidity,
        },
      },
    },
  ],
});
