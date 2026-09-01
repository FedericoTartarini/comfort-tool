import { adaptive_en, t_o } from "jsthermalcomfort";
import { PhysicalQuantityId } from "../../catalog/quantities";
import { ComfortStandard } from "../../catalog/calculationMetadata";
import { ModelId, JsThermalComfortStandard } from "../../catalog/modelIds";
import { InputPresetKey } from "../../engines/comfort/controls/inputControlPresets";
import { ThermalZone } from "../../catalog/thermalZone";
import { ZoneToken } from "../../catalog/zoneTokens";
import { UnitSystem } from "../../catalog/units";
import { StandardId, SurfaceId } from "../../catalog/surfaces";
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
  levelsFromAdaptiveOffsets,
  libraryLevelsFromAdaptiveResult,
} from "./calculation";

export const adaptiveEnZonesList = [
  new ThermalZone({ label: ZoneToken.TooCool, token: ZoneToken.TooCool }),
  new ThermalZone({ label: "cat_iii", token: ZoneToken.WideAcceptable }),
  new ThermalZone({ label: "cat_ii", token: ZoneToken.Acceptable }),
  new ThermalZone({ label: "cat_i", token: ZoneToken.Preferred }),
  new ThermalZone({ label: ZoneToken.TooWarm, token: ZoneToken.TooWarm }),
];

const adaptiveEnLevels = levelsFromAdaptiveOffsets(adaptive_en.offsets);

function evaluateAdaptiveEnLibrary(
  request: AdaptiveRequest,
  options: { limitInputs: boolean },
): AdaptiveLibraryResult {
  const result = adaptive_en(
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
      JsThermalComfortStandard.ISO,
    ),
    levels: libraryLevelsFromAdaptiveResult(result, adaptiveEnLevels),
  };
}

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
  levels: adaptiveEnLevels,
  offsets: adaptive_en.offsets,
  evaluateLibrary: evaluateAdaptiveEnLibrary,
};

const getAdaptiveEnFeedback = createAdaptiveComplianceFeedbackGetter("cat_iii");

export const adaptiveEnDeclaration: AdaptiveModelDeclaration = {
  ...adaptiveEnBoundaryDefinition,
  library: adaptive_en,
  modelId: ModelId.AdaptiveEn,
  standardIds: [StandardId.En16798],
  resultStandard: ComfortStandard.En16798Adaptive,
  operativeTemperatureStandard: JsThermalComfortStandard.ISO,
  surfaceCapabilities: [SurfaceId.Standard],
  exploreOutputs: [],
  modifiers: [],
  complianceProfile: {
    output: PhysicalQuantityId.OperativeTemperature,
    bands: createAdaptiveComplianceBands(adaptiveEnBoundaryDefinition),
    legendTitle: "Adaptive Zones",
    caption: createAdaptiveComplianceCaption(
      adaptiveEnBoundaryDefinition,
      "cat_iii",
    ),
    getFeedback: getAdaptiveEnFeedback,
  },
  hoverLevelIds: adaptiveEnLevels.map(({ id }) => id),
  complianceLevelId: "cat_iii",
  // Chart x-axis. EN 16798 / library JSDoc use 10–30 °C; do not copy
  // adaptive_en.t_running_mean_limits (currently 33.5, same as ASHRAE).
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
};

export const adaptiveEnModelConfig = createAdaptiveModelConfig(
  adaptiveEnDeclaration,
);
