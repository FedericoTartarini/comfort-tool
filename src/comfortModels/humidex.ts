import { humidex } from "jsthermalcomfort";
import { CalculationSource } from "../models/calculationMetadata";
import { ComfortModel } from "../models/comfortModels";
import { ModelOutputKey } from "../models/modelCapabilities";
import { ThermalZone } from "../models/thermalZone";
import { requireThermalZone } from "../services/comfort/helpers";
import { buildPsychrometricIndexModelConfig } from "./presets/psychrometricIndexModel";

const MODEL_LABEL = "Humidex";
const MODEL_DESCRIPTION =
  "Canadian index used to describe how hot the weather feels to the average person, by combining the effects of heat and humidity.";
const TDB_LIMITS = { min: 20, max: 50 };

export const humidexZonesList = [
  new ThermalZone({ label: "Little/None", max: 30, color: "#e2e8f0", textColor: "#475569" }),
  new ThermalZone({ label: "Noticeable", min: 30, max: 35, color: "#fef08a", textColor: "#854d0e" }),
  new ThermalZone({ label: "Evident", min: 35, max: 40, color: "#fde047", textColor: "#a16207" }),
  new ThermalZone({ label: "Intense", min: 40, max: 45, color: "#facc15", textColor: "#a16207" }),
  new ThermalZone({ label: "Dangerous", min: 45, max: 54, color: "#f97316", textColor: "#ea580c" }),
  new ThermalZone({ label: "Stroke Probable", min: 54, color: "#dc2626", textColor: "#b91c1c" }),
];

export interface HumidexRequestDto {
  tdb: number;
  rh: number;
}

export interface HumidexResponseDto {
  humidex: number;
  humidexDiscomfort: string;
  source: CalculationSource;
}

export function calculateHumidex(payload: HumidexRequestDto): HumidexResponseDto {
  const value = humidex(payload.tdb, payload.rh, { round: true }).humidex;
  const humidexDiscomfort = requireThermalZone(
    humidexZonesList,
    value,
    MODEL_LABEL,
  ).label;

  return {
    humidex: value,
    humidexDiscomfort,
    source: CalculationSource.JsThermalComfort,
  };
}

export const humidexModelConfig = buildPsychrometricIndexModelConfig<HumidexResponseDto>({
  comfortModel: ComfortModel.Humidex,
  label: MODEL_LABEL,
  description: MODEL_DESCRIPTION,
  outputKey: ModelOutputKey.Humidex,
  zones: humidexZonesList,
  tdbLimits: TDB_LIMITS,
  fixedChartInstanceId: "humidex-ranges",
  dynamicChartInstanceId: "humidex-dynamic-field",
  fixedChartTitle: `${MODEL_LABEL} Discomfort`,
  dynamicTitle: `${MODEL_LABEL} Dynamic Chart`,
  calculate: calculateHumidex,
  getOutputValue: (result) => result.humidex,
  getResultSubtext: (result) => result.humidexDiscomfort,
});
