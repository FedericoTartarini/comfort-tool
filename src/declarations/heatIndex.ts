import { heat_index } from "jsthermalcomfort";
import { PhysicalQuantityId } from "../catalog/quantities";
import { CalculationSource } from "../catalog/calculationMetadata";
import type { ModelChartSource } from "../catalog/chartSource";
import { ModelId } from "../catalog/modelIds";
import {
  bandsFromJsBins,
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

// --- Identity and classifier ---

const TDB_LIMITS = { min: 20, max: 50 };

const HEAT_INDEX_STRESS_TOKENS: Readonly<Record<string, ZoneToken>> = {
  "no risk": ZoneToken.Safe,
  caution: ZoneToken.Caution,
  "extreme caution": ZoneToken.StrongCaution,
  danger: ZoneToken.Danger,
  "extreme danger": ZoneToken.ExtremeDanger,
};

function heatIndexTokenForCategory(category: string): ZoneToken {
  const token = HEAT_INDEX_STRESS_TOKENS[category];
  if (token === undefined) {
    throw new Error(`Unknown Heat Index stress category: ${category}`);
  }
  return token;
}

const heatIndexDefaultBands = bandsFromJsBins(
  heat_index.mapping.bins,
  HEAT_INDEX_STRESS_TOKENS,
);

export const heatIndexZonesList = thermalZonesFromBands(
  heatIndexDefaultBands,
  HEAT_INDEX_STRESS_TOKENS,
);

export interface HeatIndexInputs {
  tdb: number;
  rh: number;
}

export interface HeatIndexResponse {
  hi: number;
  category: string;
  source: CalculationSource;
}

export const heatIndexQuantityMapping = defineLibraryQuantityMapping<HeatIndexInputs>({
  tdb: PhysicalQuantityId.DryBulbTemperature,
  rh: PhysicalQuantityId.RelativeHumidity,
  hi: PhysicalQuantityId.HeatIndex,
});

export const heatIndexOutput: ModelOutput = {
  key: PhysicalQuantityId.HeatIndex,
  label: heat_index.label,
  defaultBands: heatIndexDefaultBands,
};

// --- Calculation ---

export function calculateHeatIndex(payload: HeatIndexInputs): HeatIndexResponse {
  const result = heat_index(payload.tdb, payload.rh, {
    units: "SI",
    round: true,
    limit_inputs: false,
  });
  if (!Number.isFinite(result.hi)) {
    throw new Error(`Heat Index produced a non-finite value: ${result.hi}.`);
  }
  const category = requireMappedCategory(result.stress_category, "Heat Index");
  return { hi: result.hi, category, source: CalculationSource.JsThermalComfort };
}

// --- Charts ---

export const heatIndexModelConfig = defineModel<
  HeatIndexResponse,
  ModelChartSource<HeatIndexInputs>
>({
  id: ModelId.HeatIndex,
  library: heat_index,
  standardIds: [],
  surfaceCapabilities: [SurfaceId.Explore],
  exploreOutputs: [heatIndexOutput],
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
      evaluate: calculateHeatIndex,
      getOutputValue: (result) => heatIndexQuantityMapping.fromLibrary(result)[
        PhysicalQuantityId.HeatIndex
      ]!,
      requestAdapter: heatIndexQuantityMapping,
    },
  }],
  tables: {
    results: [
      {
        quantity: PhysicalQuantityId.HeatIndex,
        label: heat_index.label,
        value: (result) => heatIndexQuantityMapping.fromLibrary(result)[
          PhysicalQuantityId.HeatIndex
        ]!,
        subtext: (result) => result.category,
        color: (result) => resolveZoneAppearance(
          heatIndexTokenForCategory(result.category),
        ).text,
      },
    ],
  },
  calculate: (context, visibleInputIds) =>
    calculatePerInput({
      context,
      visibleInputIds,
      mapRequest: heatIndexQuantityMapping.mapRequest,
      calculate: calculateHeatIndex,
    }),
});
