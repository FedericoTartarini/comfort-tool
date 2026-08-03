import { adaptive_en } from "jsthermalcomfort";
import { ComfortStandard } from "../models/calculationMetadata";
import { ComfortModel, JsThermalComfortStandard } from "../models/comfortModels";
import type { PresetInputOption } from "../models/inputControls";
import { ChartMode, ModelOutputKey } from "../models/modelCapabilities";
import { ThermalZone } from "../models/thermalZone";
import { UnitSystem } from "../models/units";
import {
  createAdaptiveComplianceBands,
  createAdaptiveComplianceCaption,
  createAdaptiveComplianceFeedbackGetter,
  createAdaptiveModelConfig,
  type AdaptiveBoundaryDefinition,
  type AdaptiveModelDeclaration,
} from "./adaptiveShared";

export const adaptiveEnZonesList = [
  new ThermalZone({ label: "Too Cool", color: "#3b82f6", textColor: "#2563eb" }),
  new ThermalZone({ label: "Category III", color: "#fde047", textColor: "#047857" }),
  new ThermalZone({ label: "Category II", color: "#86efac", textColor: "#047857" }),
  new ThermalZone({ label: "Category I", color: "#22c55e", textColor: "#047857" }),
  new ThermalZone({ label: "Too Warm", color: "#ef4444", textColor: "#b91c1c" }),
];

const airSpeedPresets: PresetInputOption[] = [
  { id: "0.1", value: 0.1, label: "lower than 0.6 m/s (118 fpm)" },
  { id: "0.6", value: 0.6, label: "0.6 m/s (118 fpm)" },
  { id: "0.9", value: 0.9, label: "0.9 m/s (177 fpm)" },
  { id: "1.2", value: 1.2, label: "1.2 m/s (236 fpm)" },
];

const adaptiveEnBoundaryDefinition: AdaptiveBoundaryDefinition = {
  bandSequence: [
    adaptiveEnZonesList[0],
    adaptiveEnZonesList[1],
    adaptiveEnZonesList[2],
    adaptiveEnZonesList[3],
    adaptiveEnZonesList[2],
    adaptiveEnZonesList[1],
    adaptiveEnZonesList[4],
  ],
  levels: [
    {
      id: "category-i",
      label: adaptiveEnZonesList[3].label,
      coolOffset: -3,
      warmOffset: 2,
    },
    {
      id: "category-ii",
      label: adaptiveEnZonesList[2].label,
      coolOffset: -4,
      warmOffset: 3,
    },
    {
      id: "category-iii",
      label: adaptiveEnZonesList[1].label,
      coolOffset: -5,
      warmOffset: 4,
    },
  ],
  coefficients: { slope: 0.33, intercept: 18.8 },
};

const getAdaptiveEnFeedback = createAdaptiveComplianceFeedbackGetter("category-iii");

export const adaptiveEnDeclaration: AdaptiveModelDeclaration = {
  ...adaptiveEnBoundaryDefinition,
  modelId: ComfortModel.AdaptiveEn,
  label: "Adaptive (EN 16798-1)",
  description:
    "EN 16798-1 Adaptive thermal comfort model for naturally ventilated buildings.",
  resultStandard: ComfortStandard.En16798Adaptive,
  operativeTemperatureStandard: JsThermalComfortStandard.ISO,
  zones: adaptiveEnZonesList,
  modes: [ChartMode.Compliance],
  chartableOutputs: [],
  complianceSpec: {
    output: ModelOutputKey.OperativeTemperature,
    bands: createAdaptiveComplianceBands(adaptiveEnBoundaryDefinition),
    caption: createAdaptiveComplianceCaption(
      "Shading shows EN 16798-1 Categories I–III",
      adaptiveEnBoundaryDefinition,
      "category-iii",
    ),
    getFeedback: getAdaptiveEnFeedback,
  },
  hoverLevelIds: ["category-i", "category-ii", "category-iii"],
  complianceLevelId: "category-iii",
  outdoorTemperatureRangeSi: { min: 10, max: 30 },
  outdoorTemperatureLabel: "Running mean outdoor temperature",
  airSpeedPresets,
  colorByStatus: {
    [adaptiveEnZonesList[0].label]: adaptiveEnZonesList[0].textColor,
    [adaptiveEnZonesList[1].label]: adaptiveEnZonesList[1].textColor,
    [adaptiveEnZonesList[2].label]: adaptiveEnZonesList[2].textColor,
    [adaptiveEnZonesList[3].label]: adaptiveEnZonesList[3].textColor,
    [adaptiveEnZonesList[4].label]: adaptiveEnZonesList[4].textColor,
    "N/A": "",
  },
  complianceColors: {
    compliant: adaptiveEnZonesList[2].textColor,
    nonCompliant: adaptiveEnZonesList[4].textColor,
  },
  evaluateApplicability: (request) => adaptive_en(
    request.tdb,
    request.tr,
    request.trm,
    request.v,
    UnitSystem.SI,
    true,
    false,
  ).tmp_cmf,
};

export const adaptiveEnModelConfig = createAdaptiveModelConfig(
  adaptiveEnDeclaration,
);
