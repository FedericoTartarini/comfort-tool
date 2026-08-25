import { adaptive_ashrae } from "jsthermalcomfort";
import { ComfortStandard } from "../../models/calculationMetadata";
import { ComfortModel, JsThermalComfortStandard } from "../../models/comfortModels";
import { ModelOutputKey } from "../../models/modelCapabilities";
import { InputPresetKey } from "../../services/comfort/controls/inputControlPresets";
import { ThermalZone } from "../../models/thermalZone";
import { ZoneToken } from "../../models/zoneTokens";
import { UnitSystem } from "../../models/units";
import { StandardId } from "../../models/workspaces";
import { WorkspaceCapability } from "../../models/output/workspaceCapabilities";
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

export const adaptiveAshraeZonesList = [
  new ThermalZone({ label: "Too Cool", token: ZoneToken.TooCool }),
  new ThermalZone({ label: "80% Acceptability", token: ZoneToken.Acceptable }),
  new ThermalZone({ label: "90% Acceptability", token: ZoneToken.Preferred }),
  new ThermalZone({ label: "Too Warm", token: ZoneToken.TooWarm }),
];

const adaptiveAshraeBoundaryDefinition: AdaptiveBoundaryDefinition = {
  bandSequence: [
    adaptiveAshraeZonesList[0],
    adaptiveAshraeZonesList[1],
    adaptiveAshraeZonesList[2],
    adaptiveAshraeZonesList[1],
    adaptiveAshraeZonesList[3],
  ],
  levels: [
    {
      id: "acceptability-80",
      label: adaptiveAshraeZonesList[1].label,
      coolOffset: -3.5,
      warmOffset: 3.5,
    },
    {
      id: "acceptability-90",
      label: adaptiveAshraeZonesList[2].label,
      coolOffset: -2.5,
      warmOffset: 2.5,
    },
  ],
  coefficients: { slope: 0.31, intercept: 17.8 },
};

const getAdaptiveAshraeFeedback = createAdaptiveComplianceFeedbackGetter(
  "acceptability-80",
);

export const adaptiveAshraeDeclaration: AdaptiveModelDeclaration = {
  ...adaptiveAshraeBoundaryDefinition,
  modelId: ComfortModel.AdaptiveAshrae,
  label: "Adaptive (ASHRAE-55)",
  description:
    "ASHRAE 55 Adaptive thermal comfort model for naturally ventilated buildings.",
  standardIds: [StandardId.Ashrae55],
  resultStandard: ComfortStandard.Ashrae55Adaptive,
  operativeTemperatureStandard: JsThermalComfortStandard.ASHRAE,
  workspaceCapabilities: [WorkspaceCapability.Standard],
  exploreOutputs: [],
  modifiers: [],
  boundaryInstanceId: "adaptive-ashrae-boundary",
  complianceProfile: {
    output: ModelOutputKey.OperativeTemperature,
    bands: createAdaptiveComplianceBands(adaptiveAshraeBoundaryDefinition),
    legendTitle: "Adaptive Zones",
    caption: createAdaptiveComplianceCaption(
      "Green shading shows the ASHRAE 55 80% and 90% acceptability regions",
      adaptiveAshraeBoundaryDefinition,
      "acceptability-80",
    ),
    getFeedback: getAdaptiveAshraeFeedback,
  },
  hoverLevelIds: ["acceptability-90", "acceptability-80"],
  complianceLevelId: "acceptability-80",
  outdoorTemperatureRangeSi: { min: 10, max: 33.5 },
  outdoorTemperatureLabel: "Prevailing mean outdoor temperature",
  airSpeedPresetKey: InputPresetKey.AdaptiveAshraeAirSpeed,
  colorByStatus: {
    [adaptiveAshraeZonesList[0].label]: adaptiveAshraeZonesList[0].textColor,
    [adaptiveAshraeZonesList[1].label]: adaptiveAshraeZonesList[1].textColor,
    [adaptiveAshraeZonesList[2].label]: adaptiveAshraeZonesList[2].textColor,
    [adaptiveAshraeZonesList[3].label]: adaptiveAshraeZonesList[3].textColor,
    "N/A": "",
  },
  complianceColors: {
    compliant: adaptiveAshraeZonesList[2].textColor,
    nonCompliant: adaptiveAshraeZonesList[3].textColor,
  },
  evaluateApplicability: (request) => adaptive_ashrae(
    request.tdb,
    request.tr,
    request.trm,
    request.v,
    UnitSystem.SI,
    true,
    false,
  ).tmp_cmf,
};

export const adaptiveAshraeModelConfig = createAdaptiveModelConfig(
  adaptiveAshraeDeclaration,
);
