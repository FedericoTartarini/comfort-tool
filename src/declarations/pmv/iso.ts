/**
 * ISO 7730 PMV/PPD declaration and standard-specific calculation strategy.
 */
import { PhysicalQuantityId } from "../../catalog/quantities";
import {
  check_standard_compliance,
  pmv_ppd_iso,
  t_o,
} from "jsthermalcomfort";

import { ComfortStandard } from "../../catalog/calculationMetadata";
import { ModelId, JsThermalComfortStandard } from "../../catalog/modelIds";
import { defaultPmvIsoOptions } from "../../catalog/inputModes";
import { UnitSystem } from "../../catalog/units";
import { StandardId, SurfaceId } from "../../catalog/surfaces";
import {
  createDynamicClothingModifier,
  measuredAirSpeedModifier,
  morningClothingEstimateModifier,
  solarGainModifier,
} from "../../engines/comfort/inputModifiers";
import {
  ISO_TSV_CAPTION,
  createPmvExploreOutputs,
  createPmvModelConfig,
  parsePmvIsoOptions,
  type PmvModelDeclaration,
  type PmvStandardAdapter,
} from "./shared";
import { getPmvComplianceFeedback } from "./calculation";
import {
  classifyIsoTsv,
  isoComfortIsolineTargets,
  isoTsvBands,
  isoTsvZonesList,
  isIsoNeutralPmv,
} from "./zones";

export const pmvIsoAdapter: PmvStandardAdapter = {
  modelId: ModelId.PmvIso,
  resultStandard: ComfortStandard.Iso7730PmvPpd,
  clothingStandard: JsThermalComfortStandard.ISO,
  // ISO 7730 applicability includes the upper boundary of 2 clo.
  clothingInsulationMaxSi: 2,
  supportsOccupantAirSpeedControl: false,
  calculate: (request) => pmv_ppd_iso(
    request.tdb,
    request.tr,
    request.vr,
    request.rh,
    request.met,
    request.clo,
    request.wme,
    {
      units: UnitSystem.SI,
      limit_inputs: false,
    },
  ),
  checkApplicability: (request) => check_standard_compliance(
    JsThermalComfortStandard.ISO,
    {
      tdb: request.tdb,
      tr: request.tr,
      v: request.vr,
      met: request.met,
      clo: request.clo,
    },
  ),
  getOperativeTemperature: (request) => t_o(
    request.tdb,
    request.tr,
    request.vr,
    JsThermalComfortStandard.ISO,
  ),
  classifyTsv: classifyIsoTsv,
  isAcceptablePmv: isIsoNeutralPmv,
  comfortIsolineTargets: isoComfortIsolineTargets,
  tsvZones: isoTsvZonesList,
};

export const pmvIsoDeclaration: PmvModelDeclaration = {
  library: pmv_ppd_iso,
  adapter: pmvIsoAdapter,
  standardIds: [StandardId.Iso7730],
  surfaceCapabilities: [SurfaceId.Standard, SurfaceId.Explore],
  exploreOutputs: createPmvExploreOutputs(isoTsvBands, "Thermal sensation"),
  modifiers: [
    measuredAirSpeedModifier,
    morningClothingEstimateModifier,
    createDynamicClothingModifier(JsThermalComfortStandard.ISO),
    solarGainModifier,
  ],
  complianceProfile: {
    output: PhysicalQuantityId.PredictedMeanVote,
    bands: isoTsvBands,
    legendTitle: "Thermal sensation",
    caption: ISO_TSV_CAPTION,
    getFeedback: getPmvComplianceFeedback,
  },
  defaultOptions: defaultPmvIsoOptions,
  parseOptions: parsePmvIsoOptions,
};

export const pmvIsoModelConfig = createPmvModelConfig(pmvIsoDeclaration);
