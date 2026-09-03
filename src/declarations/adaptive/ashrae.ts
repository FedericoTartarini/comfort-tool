import { adaptive_ashrae, t_o } from "jsthermalcomfort";
import { PhysicalQuantityId } from "../../catalog/quantities";
import { ComfortStandard } from "../../catalog/calculationMetadata";
import { ModelId, JsThermalComfortStandard } from "../../catalog/modelIds";
import { InputPresetKey } from "../../engines/comfort/controls/inputControlPresets";
import { ThermalZone } from "../../catalog/thermalZone";
import { ZoneToken } from "../../catalog/zoneTokens";
import { UnitSystem } from "../../catalog/units";
import { StandardId } from "../../catalog/surfaces";
import { intervalFromOffsets } from "../../catalog/classifierBins";
import {
  createAdaptiveModelConfig,
  type AdaptiveBoundaryDefinition,
  type AdaptiveLibraryResult,
  type AdaptiveModelDeclaration,
  type AdaptiveRequest,
} from "./shared";
import {
  createAdaptiveComplianceBands,
  createAdaptiveComplianceCaption,
  createAdaptiveComplianceFeedbackGetter,
  adaptiveLevelDisplayLabel,
  levelsFromAdaptiveOffsets,
  libraryLevelsFromAdaptiveResult,
} from "./calculation";

export const adaptiveAshraeZonesList = [
  new ThermalZone({ label: ZoneToken.TooCool, token: ZoneToken.TooCool }),
  new ThermalZone({ label: adaptiveLevelDisplayLabel("80"), token: ZoneToken.Acceptable }),
  new ThermalZone({ label: adaptiveLevelDisplayLabel("90"), token: ZoneToken.Preferred }),
  new ThermalZone({ label: ZoneToken.TooWarm, token: ZoneToken.TooWarm }),
];

const adaptiveAshraeLevels = levelsFromAdaptiveOffsets(adaptive_ashrae.offsets);

function evaluateAdaptiveAshraeLibrary(
  request: AdaptiveRequest,
  options: { limitInputs: boolean },
): AdaptiveLibraryResult {
  const result = adaptive_ashrae(
    request.tdb,
    request.tr,
    request.t_running_mean,
    request.v,
    UnitSystem.SI,
    options.limitInputs,
    false,
  );
  return {
    tCmf: result.tmp_cmf,
    operativeTemperature: t_o(
      request.tdb,
      request.tr,
      request.v,
      JsThermalComfortStandard.ASHRAE,
    ),
    levels: libraryLevelsFromAdaptiveResult(result, adaptiveAshraeLevels),
  };
}

const adaptiveAshraeBoundaryDefinition: AdaptiveBoundaryDefinition = {
  bandSequence: [
    adaptiveAshraeZonesList[0],
    adaptiveAshraeZonesList[1],
    adaptiveAshraeZonesList[2],
    adaptiveAshraeZonesList[1],
    adaptiveAshraeZonesList[3],
  ],
  levels: adaptiveAshraeLevels,
  offsets: adaptive_ashrae.offsets,
  evaluateLibrary: evaluateAdaptiveAshraeLibrary,
};

const getAdaptiveAshraeFeedback = createAdaptiveComplianceFeedbackGetter("80");

export const adaptiveAshraeDeclaration: AdaptiveModelDeclaration = {
  ...adaptiveAshraeBoundaryDefinition,
  library: adaptive_ashrae,
  modelId: ModelId.AdaptiveAshrae,
  standardIds: [StandardId.Ashrae55],
  resultStandard: ComfortStandard.Ashrae55Adaptive,
  operativeTemperatureStandard: JsThermalComfortStandard.ASHRAE,
  exploreMode: false,
  intervals: [
    intervalFromOffsets(
      PhysicalQuantityId.OperativeTemperature,
      adaptive_ashrae.offsets,
      [
        { id: "80", token: ZoneToken.Acceptable },
        { id: "90", token: ZoneToken.Preferred },
      ],
    ),
  ],
  exploreOutputs: [],
  complianceProfile: {
    output: PhysicalQuantityId.OperativeTemperature,
    bands: createAdaptiveComplianceBands(adaptiveAshraeBoundaryDefinition),
    legendTitle: "Adaptive Zones",
    caption: createAdaptiveComplianceCaption(
      adaptiveAshraeBoundaryDefinition,
      "80",
    ),
    getFeedback: getAdaptiveAshraeFeedback,
  },
  hoverLevelIds: ["90", "80"],
  complianceLevelId: "80",
  outdoorTemperatureRangeSi: adaptive_ashrae.t_running_mean_limits,
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
};

export const adaptiveAshraeModelConfig = createAdaptiveModelConfig(
  adaptiveAshraeDeclaration,
);
