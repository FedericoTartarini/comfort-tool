/**
 * ASHRAE 55 PMV/PPD model declaration and standard-specific calculation strategy.
 */
import { PhysicalQuantityId } from "../../catalog/quantities";
import {
  check_standard_compliance,
  pmv_ppd_ashrae,
  t_o,
} from "jsthermalcomfort";

import { ComfortStandard } from "../../catalog/calculationMetadata";
import { ModelId, JsThermalComfortStandard } from "../../catalog/modelIds";
import { defaultPmvAshraeOptions } from "../../catalog/inputModes";
import { StandardId } from "../../catalog/surfaces";
import { ZoneToken } from "../../catalog/zoneTokens";
import { intervalFromBins, intervalFromBounds } from "../../catalog/classifierBins";
import {
  createDynamicClothingModifier,
  measuredAirSpeedModifier,
  morningClothingEstimateModifier,
  solarGainModifier,
} from "../../engines/comfort/inputModifiers";
import {
  createAshraePmvComplianceCaption,
  createPmvExploreOutputs,
  createPmvModelConfig,
  parsePmvAshraeOptions,
  type PmvModelDeclaration,
  type PmvStandardAdapter,
} from "./shared";
import { getPmvComplianceFeedback, invokePmvAshraeLibrary } from "./calculation";
import {
  ashraeComfortIsolineTargets,
  ashraeComplianceBands,
  ashraeTsvZonesList,
  classifyAshraeTsv,
  isAshraeAcceptablePmv,
  PMV_TSV_TOKEN_ROWS,
} from "./zones";

export const pmvAshraeAdapter: PmvStandardAdapter = {
  modelId: ModelId.PmvAshrae,
  resultStandard: ComfortStandard.Ashrae55PmvPpd,
  clothingStandard: JsThermalComfortStandard.ASHRAE,
  clothingInsulationMaxSi: 1.5,
  supportsOccupantAirSpeedControl: true,
  calculate: invokePmvAshraeLibrary,
  checkApplicability: (request) => check_standard_compliance(
    JsThermalComfortStandard.ASHRAE,
    {
      tdb: request.tdb,
      tr: request.tr,
      v: request.vr,
      met: request.met,
      clo: request.clo,
      airspeed_control: request.occupantHasAirSpeedControl,
    },
  ),
  getOperativeTemperature: (request) => t_o(
    request.tdb,
    request.tr,
    request.vr,
    JsThermalComfortStandard.ASHRAE,
  ),
  classifyTsv: classifyAshraeTsv,
  isAcceptablePmv: isAshraeAcceptablePmv,
  comfortIsolineTargets: ashraeComfortIsolineTargets,
  tsvZones: ashraeTsvZonesList,
};

export const pmvAshraeDeclaration: PmvModelDeclaration = {
  library: pmv_ppd_ashrae,
  adapter: pmvAshraeAdapter,
  standardIds: [StandardId.Ashrae55],
  exploreMode: true,
  intervals: [
    intervalFromBins(
      PhysicalQuantityId.PredictedMeanVote,
      pmv_ppd_ashrae.tsv.bins,
      PMV_TSV_TOKEN_ROWS,
    ),
    intervalFromBounds(
      PhysicalQuantityId.PredictedMeanVote,
      pmv_ppd_ashrae.compliance.bounds,
      { label: ZoneToken.Acceptable, token: ZoneToken.Acceptable },
      { label: ZoneToken.FailFill, token: ZoneToken.FailFill },
    ),
  ],
  exploreOutputs: createPmvExploreOutputs(
    ashraeComplianceBands,
    "PMV acceptability",
  ),
  modifiers: [
    measuredAirSpeedModifier,
    morningClothingEstimateModifier,
    createDynamicClothingModifier(JsThermalComfortStandard.ASHRAE),
    solarGainModifier,
  ],
  complianceProfile: {
    output: PhysicalQuantityId.PredictedMeanVote,
    bands: ashraeComplianceBands,
    legendTitle: "PMV acceptability",
    caption: createAshraePmvComplianceCaption(ashraeComfortIsolineTargets),
    getFeedback: (result) => getPmvComplianceFeedback(
      result,
      isAshraeAcceptablePmv,
    ),
  },
  defaultOptions: defaultPmvAshraeOptions,
  parseOptions: parsePmvAshraeOptions,
};

export const pmvAshraeModelConfig = createPmvModelConfig(pmvAshraeDeclaration);
