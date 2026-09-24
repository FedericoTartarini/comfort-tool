import { humidex } from "jsthermalcomfort";
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

const humidexTokenRows = [
  { label: "Little or no discomfort", token: ZoneToken.Safe },
  { label: "Noticeable discomfort", token: ZoneToken.Caution },
  { label: "Evident discomfort", token: ZoneToken.StrongCaution },
  { label: "Intense discomfort; avoid exertion", token: ZoneToken.Intense },
  { label: "Dangerous discomfort", token: ZoneToken.Danger },
  { label: "Heat stroke probable", token: ZoneToken.ExtremeDanger },
] as const;

export const humidexZonesList = thermalZonesFromBands(
  bandsFromJsBins(humidex.mapping.bins, humidexTokenRows),
  tokenMapFromRows(humidexTokenRows),
);

export const humidexModelConfig = defineModel(humidex, {
  id: ModelId.Humidex,
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
    values: [
      resultQuantity("humidex", PhysicalQuantityId.Humidex),
    ],
    intervals: [
      intervalFromBins(
        PhysicalQuantityId.Humidex,
        humidex.mapping.bins,
        humidexTokenRows,
      ),
    ],
  },

  tables: {
    results: [
      quantityRow(PhysicalQuantityId.Humidex),
    ],
  },

  charts: [{
    type: ChartType.Dynamic,
    capabilities: { allowsOutputSelection: false },
    spec: {
      axes: {
        x: PhysicalQuantityId.DryBulbTemperature,
        y: PhysicalQuantityId.RelativeHumidity,
      },
    },
  }],
});
