import { t_o, utci } from "jsthermalcomfort";
import { CalculationSource } from "../../models/calculationMetadata";
import { JsThermalComfortStandard } from "../../models/comfortModels";
import { PhysicalQuantityId, getPhysicalQuantityMeta } from "../../models/physicalQuantities";
import {
  bandsFromThermalZones,
  ModelOutputKey,
  type ModelOutput,
} from "../../models/modelCapabilities";
import { ThermalZone } from "../../models/thermalZone";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../models/units";
import {
  createRequestAxisAdapter,
} from "../../services/comfort/charts/dynamicAxisPayload";
import {
  requireThermalZone,
} from "../../services/comfort/helpers";
import {
  createFieldRequestAdapter,
} from "../../services/comfort/requestMapping";
import {
  convertModelOutputFromSi,
  formatDisplayValue,
  getModelOutputDisplayMeta,
} from "../../services/units";
import type { ResultRowDefinition } from "../../state/comfortTool/modelConfigs/builder";

export const UTCI_MODEL_LABEL = "UTCI";

export const UTCI_CHART_RANGE_SI = { min: -50, max: 55 } as const;

export const UTCI_TDB_LIMITS = { min: UTCI_CHART_RANGE_SI.min, max: 50 };
export const UTCI_TR_LIMITS = { min: -80, max: 120 };

export const utciZonesList = [
  new ThermalZone({ category: "extreme cold stress", label: "Extreme Cold Stress", legendText: "Ext.<br>cold", max: -40, color: "#0f172a", textColor: "#64748b" }),
  new ThermalZone({ category: "very strong cold stress", label: "Very Strong Cold Stress", legendText: "V strong<br>cold", min: -40, max: -27, color: "#1d4ed8", textColor: "#2563eb" }),
  new ThermalZone({ category: "strong cold stress", label: "Strong Cold Stress", legendText: "Strong<br>cold", min: -27, max: -13, color: "#2563eb", textColor: "#3b82f6" }),
  new ThermalZone({ category: "moderate cold stress", label: "Moderate Cold Stress", legendText: "Moderate<br>cold", min: -13, max: 0, color: "#3b82f6", textColor: "#60a5fa" }),
  new ThermalZone({ category: "slight cold stress", label: "Slight Cold Stress", legendText: "Slight<br>cold", min: 0, max: 9, color: "#7dd3fc", textColor: "#0284c7" }),
  new ThermalZone({ category: "no thermal stress", label: "No Thermal Stress", legendText: "No<br>stress", min: 9, max: 26, color: "#34d399", textColor: "#059669" }),
  new ThermalZone({ category: "moderate heat stress", label: "Moderate Heat Stress", legendText: "Moderate<br>heat", min: 26, max: 32, color: "#fbbf24", textColor: "#d97706" }),
  new ThermalZone({ category: "strong heat stress", label: "Strong Heat Stress", legendText: "Strong<br>heat", min: 32, max: 38, color: "#fb923c", textColor: "#ea580c" }),
  new ThermalZone({ category: "very strong heat stress", label: "Very Strong Heat Stress", legendText: "V strong<br>heat", min: 38, max: 46, color: "#f97316", textColor: "#c2410c" }),
  new ThermalZone({ category: "extreme heat stress", label: "Extreme Heat Stress", legendText: "Ext.<br>heat", min: 46, color: "#dc2626", textColor: "#b91c1c" }),
];

export const utciOutput: ModelOutput = {
  key: ModelOutputKey.Utci,
  label: UTCI_MODEL_LABEL,
  defaultBands: bandsFromThermalZones(utciZonesList),
};

export interface UtciRequestDto {
  tdb: number;
  tr: number;
  v: number;
  rh: number;
}

export interface UtciResponseDto {
  utci: number;
  stressCategory: string;
  source: CalculationSource;
}

export function getUtciZoneMeta(value: number): ThermalZone {
  return requireThermalZone(utciZonesList, value, UTCI_MODEL_LABEL);
}

function evaluateUtciSi(payload: UtciRequestDto): number {
  return utci(
    payload.tdb,
    payload.tr,
    payload.v,
    payload.rh,
    UnitSystem.SI,
    false,
    false,
  ).utci;
}

export function calculateUtci(payload: UtciRequestDto): UtciResponseDto {
  const value = evaluateUtciSi(payload);
  const zone = getUtciZoneMeta(value);
  if (!zone.category) {
    throw new Error(`UTCI zone has no stress category: ${zone.label}`);
  }

  return {
    utci: value,
    stressCategory: zone.category,
    source: CalculationSource.JsThermalComfort,
  };
}

/** Returns null only for a model-domain point that cannot be plotted. */
export function tryEvaluateUtciForChart(payload: UtciRequestDto): number | null {
  const value = evaluateUtciSi(payload);
  return Number.isFinite(value) ? value : null;
}

export const utciRequestAdapter = createFieldRequestAdapter<UtciRequestDto>({
  tdb: PhysicalQuantityId.DryBulbTemperature,
  tr: PhysicalQuantityId.MeanRadiantTemperature,
  v: PhysicalQuantityId.WindSpeed,
  rh: PhysicalQuantityId.RelativeHumidity,
});

export const utciAxisAdapter = createRequestAxisAdapter({
  fieldAdapter: utciRequestAdapter,
  aliases: {
    [PhysicalQuantityId.RelativeAirSpeed]: PhysicalQuantityId.WindSpeed,
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
    range: {
      min: getPhysicalQuantityMeta(PhysicalQuantityId.OperativeTemperature).minSi,
      max: getPhysicalQuantityMeta(PhysicalQuantityId.OperativeTemperature).maxSi,
    },
  },
});

export function buildUtciResultRows(
  unitSystem: UnitSystemType,
): ResultRowDefinition<UtciResponseDto>[] {
  const outputMeta = getModelOutputDisplayMeta(ModelOutputKey.Utci, unitSystem);
  return [
    {
      title: UTCI_MODEL_LABEL,
      formatter: (result) => {
        const value = convertModelOutputFromSi(ModelOutputKey.Utci, result.utci, unitSystem);
        return {
          text: `${formatDisplayValue(value, outputMeta.decimals)} ${outputMeta.displayUnits}`,
          color: "",
        };
      },
    },
    {
      title: "Stress Category",
      formatter: (result) => {
        const zone = getUtciZoneMeta(result.utci);
        return { text: zone.label, color: zone.textColor };
      },
    },
  ];
}
