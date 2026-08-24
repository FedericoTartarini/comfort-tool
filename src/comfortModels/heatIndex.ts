import { heat_index } from "jsthermalcomfort";
import { CalculationSource } from "../models/calculationMetadata";
import { ComfortModel } from "../models/comfortModels";
import { ModelOutputKey } from "../models/modelCapabilities";
import { ThermalZone } from "../models/thermalZone";
import { UnitSystem } from "../models/units";
import { requireThermalZone } from "../services/comfort/helpers";
import { buildPsychrometricIndexModelConfig } from "./presets/psychrometricIndexModel";

const MODEL_LABEL = "Heat Index";
const MODEL_DESCRIPTION =
  "Combines air temperature and relative humidity to determine the human-perceived equivalent temperature.";
const TDB_LIMITS = { min: 20, max: 50 };

export const heatIndexZonesList = [
  new ThermalZone({ label: "Safe", max: 27, color: "#e2e8f0", textColor: "#475569" }),
  new ThermalZone({ label: "Caution", min: 27, max: 32, color: "#fef08a", textColor: "#854d0e" }),
  new ThermalZone({ label: "Extreme Caution", min: 32, max: 39, color: "#fde047", textColor: "#a16207" }),
  new ThermalZone({ label: "Danger", min: 39, max: 51, color: "#f97316", textColor: "#ea580c" }),
  new ThermalZone({ label: "Extreme Danger", min: 51, color: "#dc2626", textColor: "#b91c1c" }),
];

const heatIndexCautionZone: ThermalZone = (() => {
  const zone = heatIndexZonesList.find(({ label }) => label === "Caution");
  if (!zone) throw new Error("Heat Index requires a Caution zone.");
  return zone;
})();

export interface HeatIndexRequestDto {
  tdb: number;
  rh: number;
}

export interface HeatIndexResponseDto {
  hi: number;
  category: string;
  source: CalculationSource;
}

export function calculateHeatIndex(payload: HeatIndexRequestDto): HeatIndexResponseDto {
  const result = heat_index(payload.tdb, payload.rh, {
    units: UnitSystem.SI,
    round: true,
  });
  const hi = Number.isFinite(result.hi)
    ? result.hi
    : payload.tdb < heatIndexCautionZone.min
      ? payload.tdb
      : result.hi;
  const category = requireThermalZone(heatIndexZonesList, hi, MODEL_LABEL).label;

  return { hi, category, source: CalculationSource.JsThermalComfort };
}

export const heatIndexModelConfig = buildPsychrometricIndexModelConfig<HeatIndexResponseDto>({
  comfortModel: ComfortModel.HeatIndex,
  label: MODEL_LABEL,
  description: MODEL_DESCRIPTION,
  outputKey: ModelOutputKey.HeatIndex,
  zones: heatIndexZonesList,
  tdbLimits: TDB_LIMITS,
  fixedChartInstanceId: "heat-index-ranges",
  dynamicChartInstanceId: "heat-index-dynamic-field",
  fixedChartTitle: `${MODEL_LABEL} Ranges`,
  dynamicTitle: `${MODEL_LABEL} Dynamic Chart`,
  calculate: calculateHeatIndex,
  getOutputValue: (result) => result.hi,
  getResultSubtext: (result) => result.category,
});
