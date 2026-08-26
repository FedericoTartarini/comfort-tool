import { adaptive_en } from "jsthermalcomfort";
import { ComfortStandard } from "../../models/calculationMetadata";
import { ModelId, JsThermalComfortStandard } from "../../models/comfortModels";
import { ModelOutputKey } from "../../models/modelCapabilities";
import { InputPresetKey } from "../../services/comfort/controls/inputControlPresets";
import { ThermalZone } from "../../models/thermalZone";
import { ZoneToken } from "../../models/zoneTokens";
import { UnitSystem } from "../../models/units";
import { StandardId, WorkspaceId } from "../../models/workspaces";
import {
  createAdaptiveModelConfig,
  type AdaptiveBoundaryDefinition,
  type AdaptiveModelDeclaration,
} from "./adaptiveShared";
import {
  createAdaptiveComplianceBands,
  createAdaptiveComplianceCaption,
  createAdaptiveComplianceFeedbackGetter,
} from "./adaptiveCalculation";

export const adaptiveEnZonesList = [
  new ThermalZone({ label: "Too Cool", token: ZoneToken.TooCool }),
  new ThermalZone({ label: "Category III", token: ZoneToken.WideAcceptable }),
  new ThermalZone({ label: "Category II", token: ZoneToken.Acceptable }),
  new ThermalZone({ label: "Category I", token: ZoneToken.Preferred }),
  new ThermalZone({ label: "Too Warm", token: ZoneToken.TooWarm }),
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
  modelId: ModelId.AdaptiveEn,
  label: "Adaptive (EN 16798-1)",
  description:
    "EN 16798-1 Adaptive thermal comfort model for naturally ventilated buildings.",
  standardIds: [StandardId.En16798],
  resultStandard: ComfortStandard.En16798Adaptive,
  operativeTemperatureStandard: JsThermalComfortStandard.ISO,
  workspaceCapabilities: [WorkspaceId.Standard],
  exploreOutputs: [],
  modifiers: [],
  boundaryInstanceId: "adaptive-en-boundary",
  complianceProfile: {
    output: ModelOutputKey.OperativeTemperature,
    bands: createAdaptiveComplianceBands(adaptiveEnBoundaryDefinition),
    legendTitle: "Adaptive Zones",
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
  airSpeedPresetKey: InputPresetKey.AdaptiveEnAirSpeed,
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
