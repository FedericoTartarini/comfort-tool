import { wc, wind_chill_temperature } from "jsthermalcomfort";
import { CalculationSource } from "../catalog/calculationMetadata";
import type { ModelChartSource } from "../catalog/chartSource";
import { ModelId } from "../catalog/modelIds";
import { InputWidget } from "../catalog/inputWidgets";
import { numericBandFromToken, type ModelOutput } from "../catalog/modelCapabilities";
import { ChartType } from "../catalog/chartTypes";
import { SurfaceId } from "../catalog/surfaces";
import { PhysicalQuantityId, getQuantityPresentationMeta } from "../catalog/quantities";
import { ZoneToken } from "../catalog/zoneTokens";
import {
  calculatePerInput,
  defineLibraryQuantityMapping,
} from "../engines/comfort/requestMapping";
import {
  convertFieldValueFromSi,
  convertMetersPerSecondToKilometersPerHour,
} from "../engines/units";
import { defineModel } from "../state/modelRegistry/builder";

const WIND_CHILL_INDEX_LABEL = wc.label;
const WIND_CHILL_TEMPERATURE_LABEL = "wct";
const TDB_LIMITS = { min: -45, max: 0 };
const WIND_LIMITS = { min: 1, max: 20 };

/** Python/JS expose only WCI/WCT values. One unbounded band, no frostbite classifier. */
const windChillDefaultBands = [
  numericBandFromToken(ZoneToken.Neutral, {
    min: -Infinity,
    max: Infinity,
    label: WIND_CHILL_INDEX_LABEL,
  }),
];

export interface WindChillInputs {
  tdb: number;
  v: number;
}

export interface WindChillResponse {
  wci: number;
  wct: number;
  source: CalculationSource;
}

export const windChillQuantityMapping = defineLibraryQuantityMapping<WindChillInputs>({
  tdb: PhysicalQuantityId.DryBulbTemperature,
  v: PhysicalQuantityId.WindSpeed,
  wci: PhysicalQuantityId.WindChillIndex,
  wct: PhysicalQuantityId.WindChillTemperature,
});

const windChillOutput: ModelOutput = {
  key: PhysicalQuantityId.WindChillIndex,
  label: WIND_CHILL_INDEX_LABEL,
  defaultBands: windChillDefaultBands,
};

export function calculateWindChill(payload: WindChillInputs): WindChillResponse {
  const wci = wc(payload.tdb, payload.v).wci;
  if (!Number.isFinite(wci)) {
    throw new Error(`Wind Chill produced a non-finite value: ${wci}.`);
  }
  const wct = wind_chill_temperature(
    payload.tdb,
    convertMetersPerSecondToKilometersPerHour(payload.v),
  ).wct;

  return {
    wci,
    wct,
    source: CalculationSource.JsThermalComfort,
  };
}

export const windChillModelConfig = defineModel<
  WindChillResponse,
  ModelChartSource<WindChillInputs>
>({
  id: ModelId.WindChill,
  library: wc,
  standardIds: [],
  surfaceCapabilities: [SurfaceId.Explore],
  exploreOutputs: [windChillOutput],
  modifiers: [],
  inputFields: [
    {
      quantity: PhysicalQuantityId.DryBulbTemperature,
      minValue: TDB_LIMITS.min,
      maxValue: TDB_LIMITS.max,
    },
    {
      quantity: PhysicalQuantityId.WindSpeed,
      widget: InputWidget.OutdoorWindSpeed,
      minValue: WIND_LIMITS.min,
      maxValue: WIND_LIMITS.max,
    },
  ],
  charts: [{
    type: ChartType.Dynamic,
    capabilities: { locksYAxis: true },
    spec: {
      axes: {
        x: PhysicalQuantityId.DryBulbTemperature,
        y: PhysicalQuantityId.WindSpeed,
      },
      evaluate: calculateWindChill,
      getOutputValue: (result) => windChillQuantityMapping.fromLibrary(result)[
        PhysicalQuantityId.WindChillIndex
      ]!,
      requestAdapter: windChillQuantityMapping,
      dynamicHoverExtension: {
        getTemplateSuffix: (unitSystem) => {
          const units = getQuantityPresentationMeta(
            PhysicalQuantityId.WindChillTemperature,
            unitSystem,
          ).displayUnits;
          return `<br>${WIND_CHILL_TEMPERATURE_LABEL}: %{customdata[1]:.1f} ${units}`;
        },
        getMetadata: (result, unitSystem) => [
          result == null
            ? ""
            : convertFieldValueFromSi(
                PhysicalQuantityId.WindChillTemperature,
                windChillQuantityMapping.fromLibrary(result)[
                  PhysicalQuantityId.WindChillTemperature
                ]!,
                unitSystem,
              ),
        ],
      },
    },
  }],
  tables: {
    results: [
      {
        quantity: PhysicalQuantityId.WindChillIndex,
        id: "wind-chill-index",
        label: WIND_CHILL_INDEX_LABEL,
        value: (result) => windChillQuantityMapping.fromLibrary(result)[
          PhysicalQuantityId.WindChillIndex
        ]!,
      },
      {
        quantity: PhysicalQuantityId.WindChillTemperature,
        id: "wind-chill-temperature",
        label: WIND_CHILL_TEMPERATURE_LABEL,
        value: (result) => windChillQuantityMapping.fromLibrary(result)[
          PhysicalQuantityId.WindChillTemperature
        ]!,
      },
    ],
  },
  calculate: (context, visibleInputIds) =>
    calculatePerInput({
      context,
      visibleInputIds,
      mapRequest: windChillQuantityMapping.mapRequest,
      calculate: calculateWindChill,
    }),
});
