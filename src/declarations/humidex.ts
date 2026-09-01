import { humidex } from "jsthermalcomfort";
import { PhysicalQuantityId, getPhysicalQuantityMeta } from "../catalog/quantities";
import { CalculationSource } from "../catalog/calculationMetadata";
import type { ModelChartSource } from "../catalog/chartSource";
import { ModelId } from "../catalog/modelIds";
import {
  bandsFromJsBins,
  displayClassifierLabel,
  requireMappedCategory,
  thermalZonesFromBands,
} from "../catalog/classifierBins";
import type { ModelOutput } from "../catalog/modelCapabilities";
import { ChartType } from "../catalog/chartTypes";
import { SurfaceId } from "../catalog/surfaces";
import { resolveZoneAppearance, ZoneToken } from "../catalog/zoneTokens";
import {
  calculatePerInput,
  defineLibraryQuantityMapping,
} from "../engines/comfort/requestMapping";
import { defineModel } from "../state/modelRegistry/builder";

const TDB_LIMITS = { min: 20, max: 50 };

const HUMIDEX_DISCOMFORT_TOKENS: Readonly<Record<string, ZoneToken>> = {
  "Little or no discomfort": ZoneToken.Safe,
  "Noticeable discomfort": ZoneToken.Caution,
  "Evident discomfort": ZoneToken.StrongCaution,
  "Intense discomfort; avoid exertion": ZoneToken.Intense,
  "Dangerous discomfort": ZoneToken.Danger,
  "Heat stroke probable": ZoneToken.ExtremeDanger,
};

function humidexTokenForDiscomfort(discomfort: string): ZoneToken {
  const token = HUMIDEX_DISCOMFORT_TOKENS[discomfort];
  if (token === undefined) {
    throw new Error(`Unknown Humidex discomfort category: ${discomfort}`);
  }
  return token;
}

const humidexDefaultBands = bandsFromJsBins(
  humidex.mapping.bins,
  HUMIDEX_DISCOMFORT_TOKENS,
);

export const humidexZonesList = thermalZonesFromBands(
  humidexDefaultBands,
  HUMIDEX_DISCOMFORT_TOKENS,
);

export interface HumidexInputs {
  tdb: number;
  rh: number;
}

export interface HumidexResponse {
  humidex: number;
  humidexDiscomfort: string;
  source: CalculationSource;
}

export const humidexQuantityMapping = defineLibraryQuantityMapping<HumidexInputs>({
  tdb: PhysicalQuantityId.DryBulbTemperature,
  rh: PhysicalQuantityId.RelativeHumidity,
  humidex: PhysicalQuantityId.Humidex,
});

const humidexOutput: ModelOutput = {
  key: PhysicalQuantityId.Humidex,
  label: getPhysicalQuantityMeta(PhysicalQuantityId.Humidex).label,
  defaultBands: humidexDefaultBands,
};

export function calculateHumidex(payload: HumidexInputs): HumidexResponse {
  const result = humidex(payload.tdb, payload.rh, { round: true });
  if (!Number.isFinite(result.humidex)) {
    throw new Error(`Humidex produced a non-finite value: ${result.humidex}.`);
  }
  const discomfort = requireMappedCategory(result.discomfort, "Humidex");
  return {
    humidex: result.humidex,
    humidexDiscomfort: discomfort,
    source: CalculationSource.JsThermalComfort,
  };
}

export const humidexModelConfig = defineModel<
  HumidexResponse,
  ModelChartSource<HumidexInputs>
>({
  id: ModelId.Humidex,
  library: humidex,
  standardIds: [],
  surfaceCapabilities: [SurfaceId.Explore],
  exploreOutputs: [humidexOutput],
  modifiers: [],
  inputFields: [
    {
      quantity: PhysicalQuantityId.DryBulbTemperature,
      minValue: TDB_LIMITS.min,
      maxValue: TDB_LIMITS.max,
    },
    {
      quantity: PhysicalQuantityId.RelativeHumidity,
      minValue: 0,
      maxValue: 100,
    },
  ],
  charts: [{
    type: ChartType.Dynamic,
    capabilities: { allowsOutputSelection: false },
    spec: {
      axes: {
        x: PhysicalQuantityId.DryBulbTemperature,
        y: PhysicalQuantityId.RelativeHumidity,
      },
      evaluate: calculateHumidex,
      getOutputValue: (result) => humidexQuantityMapping.fromLibrary(result)[
        PhysicalQuantityId.Humidex
      ]!,
      requestAdapter: humidexQuantityMapping,
    },
  }],
  tables: {
    results: [
      {
        quantity: PhysicalQuantityId.Humidex,
        label: humidex.label,
        value: (result) => humidexQuantityMapping.fromLibrary(result)[
          PhysicalQuantityId.Humidex
        ]!,
        subtext: (result) => displayClassifierLabel(result.humidexDiscomfort),
        color: (result) => resolveZoneAppearance(
          humidexTokenForDiscomfort(result.humidexDiscomfort),
        ).text,
      },
    ],
  },
  calculate: (context, visibleInputIds) =>
    calculatePerInput({
      context,
      visibleInputIds,
      mapRequest: humidexQuantityMapping.mapRequest,
      calculate: calculateHumidex,
    }),
});
