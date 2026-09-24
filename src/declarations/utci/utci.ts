import { t_o, utci } from "jsthermalcomfort";
import { PhysicalQuantityId, getPhysicalQuantityMeta, type QuantityState } from "../../catalog/quantities";
import { InputWidget } from "../../catalog/inputWidgets";
import { JsThermalComfortStandard, ModelId } from "../../catalog/modelIds";
import { bandsFromJsBins, displayClassifierLabel, intervalFromBins, requireMappedCategory, thermalZonesFromBands } from "../../catalog/classifierBins";
import { type ModelOutput } from "../../catalog/modelCapabilities";
import { type ThermalZone } from "../../catalog/thermalZone";
import { ZoneToken } from "../../catalog/zoneTokens";
import {
  defaultUtciOptions,
  OptionKey,
  TemperatureMode,
  type UtciModelOptions,
} from "../../catalog/inputModes";
import type { InputId as InputIdType } from "../../catalog/inputSlots";
import type { ModelCalculationContext } from "../../catalog/modelCalculation";
import { ChartType } from "../../catalog/chartTypes";
import { LIBRARY_INVOKE_DEFAULTS } from "../../engines/comfort/libraryInvoke";
import {
  createTemperatureModeOptionHandler,
} from "../../engines/comfort/controls/temperatureControl";
import {
  applyDynamicAxisCoordinates,
  createRequestAxisAdapter,
} from "../../engines/comfort/charts/dynamicAxisPayload";
import { INTERACTIVE_DYNAMIC_GRID_POINTS } from "../../engines/comfort/charts/types";
import {
  defineLibraryQuantityMapping,
} from "../../engines/comfort/requestMapping";
import {
  defineModel,
  hasExactKeys,
  inputQuantity,
  isRecord,
  resultQuantity,
} from "../../state/modelRegistry/builder";

// --- Calculation ---

export const UTCI_OUTPUT_LABEL = getPhysicalQuantityMeta(PhysicalQuantityId.UniversalThermalClimateIndex).label;
export const UTCI_MODEL_LABEL = UTCI_OUTPUT_LABEL;

export const UTCI_CHART_RANGE_SI = { min: -50, max: 55 } as const;

export const UTCI_TDB_LIMITS = { min: UTCI_CHART_RANGE_SI.min, max: 50 };
export const UTCI_TR_LIMITS = { min: -80, max: 120 };
export const UTCI_WIND_LIMITS = { min: 0, max: 17 };
export const UTCI_RH_LIMITS = { min: 0, max: 100 };
export const UTCI_OPERATIVE_LIMITS = { min: 10, max: 40 };

const UTCI_ZONE_UI: Readonly<Record<string, { legendText: string; token: ZoneToken }>> = {
  "extreme cold stress": { legendText: "Ext.<br>cold", token: ZoneToken.ExtremeCold },
  "very strong cold stress": { legendText: "V strong<br>cold", token: ZoneToken.VeryStrongCold },
  "strong cold stress": { legendText: "Strong<br>cold", token: ZoneToken.StrongCold },
  "moderate cold stress": { legendText: "Moderate<br>cold", token: ZoneToken.ModerateCold },
  "slight cold stress": { legendText: "Slight<br>cold", token: ZoneToken.SlightCold },
  "no thermal stress": { legendText: "No<br>stress", token: ZoneToken.NoStress },
  "moderate heat stress": { legendText: "Moderate<br>heat", token: ZoneToken.ModerateHeat },
  "strong heat stress": { legendText: "Strong<br>heat", token: ZoneToken.StrongHeat },
  "very strong heat stress": { legendText: "V strong<br>heat", token: ZoneToken.VeryStrongHeat },
  "extreme heat stress": { legendText: "Ext.<br>heat", token: ZoneToken.ExtremeHeat },
};

export const UTCI_LEGEND_TEXT: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(UTCI_ZONE_UI).map(([label, ui]) => [
    displayClassifierLabel(label),
    ui.legendText,
  ]),
);

const UTCI_ZONE_TOKENS: Readonly<Record<string, ZoneToken>> = Object.fromEntries(
  Object.entries(UTCI_ZONE_UI).map(([label, ui]) => [label, ui.token]),
);

const UTCI_ZONE_EXTRAS: Readonly<Record<string, { legendText: string; category: string }>> =
  Object.fromEntries(
    Object.entries(UTCI_ZONE_UI).map(([label, ui]) => [
      label,
      { legendText: ui.legendText, category: label },
    ]),
  );

const utciDefaultBands = bandsFromJsBins(utci.mapping.bins, UTCI_ZONE_TOKENS);

export const utciZonesList = thermalZonesFromBands(
  utciDefaultBands,
  UTCI_ZONE_TOKENS,
  UTCI_ZONE_EXTRAS,
);

export const utciOutput: ModelOutput = {
  key: PhysicalQuantityId.UniversalThermalClimateIndex,
  label: UTCI_OUTPUT_LABEL,
  defaultBands: utciDefaultBands,
};

export interface UtciRequest {
  tdb: number;
  tr: number;
  v: number;
  rh: number;
}

export function getUtciZoneMeta(value: number): ThermalZone {
  if (!Number.isFinite(value)) {
    throw new Error(`${UTCI_OUTPUT_LABEL} produced a non-finite thermal-zone value: ${value}.`);
  }
  const category = requireMappedCategory(utci.mapping(value), "UTCI");
  const zone = utciZonesList.find((candidate) => candidate.category === category);
  if (!zone) {
    throw new Error(`${UTCI_OUTPUT_LABEL} value ${value} does not match any declared thermal zone.`);
  }
  return zone;
}

export function calculateUtci(
  payload: UtciRequest,
  limitInputs = true,
): QuantityState {
  const result = utci(
    payload.tdb,
    payload.tr,
    payload.v,
    payload.rh,
    LIBRARY_INVOKE_DEFAULTS.units,
    limitInputs,
    LIBRARY_INVOKE_DEFAULTS.round,
  );
  if (!Number.isFinite(result.utci)) {
    throw new Error(`${UTCI_OUTPUT_LABEL} produced a non-finite value: ${result.utci}.`);
  }
  return {
    [PhysicalQuantityId.UniversalThermalClimateIndex]: result.utci,
  };
}

/** Returns null only for a model-domain point that cannot be plotted. */
export function tryEvaluateUtciForChart(payload: UtciRequest): number | null {
  const result = utci(
    payload.tdb,
    payload.tr,
    payload.v,
    payload.rh,
    LIBRARY_INVOKE_DEFAULTS.units,
    false,
    LIBRARY_INVOKE_DEFAULTS.round,
  );
  return Number.isFinite(result.utci) ? result.utci : null;
}

export const utciQuantityMapping = defineLibraryQuantityMapping<UtciRequest>({
  tdb: PhysicalQuantityId.DryBulbTemperature,
  tr: PhysicalQuantityId.MeanRadiantTemperature,
  v: PhysicalQuantityId.WindSpeed,
  rh: PhysicalQuantityId.RelativeHumidity,
  utci: PhysicalQuantityId.UniversalThermalClimateIndex,
});

export const utciAxisAdapter = createRequestAxisAdapter({
  quantityMapping: utciQuantityMapping,
  aliases: { [PhysicalQuantityId.RelativeAirSpeed]: PhysicalQuantityId.WindSpeed },
  axisRanges: {
    [PhysicalQuantityId.DryBulbTemperature]: UTCI_TDB_LIMITS,
    [PhysicalQuantityId.MeanRadiantTemperature]: UTCI_TR_LIMITS,
    [PhysicalQuantityId.WindSpeed]: UTCI_WIND_LIMITS,
    [PhysicalQuantityId.RelativeHumidity]: UTCI_RH_LIMITS,
    [PhysicalQuantityId.RelativeAirSpeed]: UTCI_WIND_LIMITS,
  },
  temperatureComponentRanges: {
    [PhysicalQuantityId.DryBulbTemperature]: UTCI_TDB_LIMITS,
    [PhysicalQuantityId.MeanRadiantTemperature]: UTCI_TR_LIMITS,
  },
  operativeTemperature: {
    get: (request) => t_o(
      request.tdb,
      request.tr,
      request.v,
      JsThermalComfortStandard.ISO,
    ),
    set: (request, valueSi) => {
      request.tdb = valueSi;
      request.tr = valueSi;
    },
    range: UTCI_OPERATIVE_LIMITS,
  },
});

// --- Identity and inputs ---

const UTCI_DYNAMIC_AXIS_FIELDS = [
  PhysicalQuantityId.DryBulbTemperature,
  PhysicalQuantityId.MeanRadiantTemperature,
  PhysicalQuantityId.OperativeTemperature,
  PhysicalQuantityId.WindSpeed,
  PhysicalQuantityId.RelativeHumidity,
] as const;

function parseUtciOptions(value: unknown): UtciModelOptions | null {
  if (!isRecord(value) || !hasExactKeys(value, [OptionKey.TemperatureMode])) {
    return null;
  }
  const mode = value[OptionKey.TemperatureMode];
  if (mode === TemperatureMode.Air || mode === TemperatureMode.Operative) {
    return { [OptionKey.TemperatureMode]: mode };
  }
  return null;
}

function toRequestFromSi(
  si: QuantityState,
  context: ModelCalculationContext,
): UtciRequest {
  const tdb = si[PhysicalQuantityId.DryBulbTemperature]!;
  const tr = context.options[OptionKey.TemperatureMode] === TemperatureMode.Operative
    ? tdb
    : si[PhysicalQuantityId.MeanRadiantTemperature]!;
  return {
    tdb,
    tr,
    v: si[PhysicalQuantityId.WindSpeed]!,
    rh: si[PhysicalQuantityId.RelativeHumidity]!,
  };
}

function toRequest(
  context: ModelCalculationContext,
  inputId: InputIdType,
): UtciRequest {
  const request = utciQuantityMapping.mapRequest(context, inputId);
  if (context.options[OptionKey.TemperatureMode] === TemperatureMode.Operative) {
    request.tr = request.tdb;
  }
  return request;
}

export const utciModelConfig = defineModel(utci, {
  id: ModelId.Utci,
  standardIds: [],
  exploreMode: true,
  inputs: [
    inputQuantity("tdb", PhysicalQuantityId.DryBulbTemperature, {
      widget: InputWidget.OperativeTemperature,
      minValue: UTCI_TDB_LIMITS.min,
      maxValue: UTCI_TDB_LIMITS.max,
    }),
    inputQuantity("tr", PhysicalQuantityId.MeanRadiantTemperature, {
      minValue: UTCI_TR_LIMITS.min,
      maxValue: UTCI_TR_LIMITS.max,
    }),
    inputQuantity("v", PhysicalQuantityId.WindSpeed, {
      widget: InputWidget.Numeric,
      minValue: UTCI_WIND_LIMITS.min,
      maxValue: UTCI_WIND_LIMITS.max,
    }),
    inputQuantity("rh", PhysicalQuantityId.RelativeHumidity, {
      minValue: UTCI_RH_LIMITS.min,
      maxValue: UTCI_RH_LIMITS.max,
    }),
  ],
  response: {
    values: [
      resultQuantity("utci", PhysicalQuantityId.UniversalThermalClimateIndex),
    ],
    intervals: [
      intervalFromBins(
        PhysicalQuantityId.UniversalThermalClimateIndex,
        utci.mapping.bins,
        Object.entries(UTCI_ZONE_UI).map(([label, ui]) => ({
          label,
          token: ui.token,
          legendText: ui.legendText,
        })),
      ),
    ],
  },
  tables: {
    results: [
      {
        quantity: PhysicalQuantityId.UniversalThermalClimateIndex,
        label: UTCI_MODEL_LABEL,
      },
    ],
  },
  charts: [
    {
      type: ChartType.Utci,
      titlePrefix: null,
      spec: {
        getOutputValue: (result) => result[
          PhysicalQuantityId.UniversalThermalClimateIndex
        ]!,
        xRangeSi: { min: UTCI_CHART_RANGE_SI.min, max: UTCI_CHART_RANGE_SI.max },
        xLabel: UTCI_MODEL_LABEL,
        legendTextByLabel: UTCI_LEGEND_TEXT,
        hoverCategoryTitle: "Stress Category",
        margin: { l: 56, r: 24, t: 48, b: 80 },
      },
    },
    {
      type: ChartType.Dynamic,
      spec: {
        axes: {
          x: PhysicalQuantityId.DryBulbTemperature,
          y: PhysicalQuantityId.RelativeHumidity,
        },
        axisFields: [...UTCI_DYNAMIC_AXIS_FIELDS],
        evaluate: (payload) => calculateUtci(payload as UtciRequest, false),
        tryEvaluatePayload: tryEvaluateUtciForChart,
        getOutputValue: (result) => result[
          PhysicalQuantityId.UniversalThermalClimateIndex
        ]!,
        requestAdapter: utciAxisAdapter,
        chartAxisAdapter: utciAxisAdapter,
        applyChartCoordinates: (payload, xField, xSi, yField, ySi) => (
          applyDynamicAxisCoordinates(
            payload,
            { field: xField, valueSi: xSi },
            { field: yField, valueSi: ySi },
            utciAxisAdapter,
          )
        ),
        gridPoints: INTERACTIVE_DYNAMIC_GRID_POINTS,
        axisRanges: {
          [PhysicalQuantityId.OperativeTemperature]: UTCI_OPERATIVE_LIMITS,
        },
        dynamicViewLayout: {
          margin: { l: 64, r: 24, t: 48, b: 64 },
          showGrid: false,
          zeroLine: false,
          legend: { orientation: "h", x: 0, y: 1.1 },
        },
      },
    },
  ],
  features: {
    optionHandlers: [
      {
        key: OptionKey.TemperatureMode,
        handler: createTemperatureModeOptionHandler(),
      },
    ],
    exploreOutputs: [utciOutput],
    defaultOptions: { ...defaultUtciOptions },
    parseOptions: parseUtciOptions,
  },
  pipeline: {
    invoke: (si, context) => calculateUtci(toRequestFromSi(si, context), true),
    mapChartInput: (_si, context, inputId) => toRequest(context, inputId),
  },
});
