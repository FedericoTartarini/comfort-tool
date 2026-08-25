/**
 * ASHRAE 55 PMV/PPD model declaration and standard-specific calculation strategy.
 */
import {
  check_standard_compliance,
  pmv_ppd_ashrae,
  t_o,
} from "jsthermalcomfort";

import { ComfortStandard } from "../../models/calculationMetadata";
import { ComfortModel, JsThermalComfortStandard } from "../../models/comfortModels";
import { defaultPmvAshraeOptions } from "../../models/inputModes";
import { ModelOutputKey } from "../../models/modelCapabilities";
import { UnitSystem } from "../../models/units";
import { StandardId } from "../../models/workspaces";
import { WorkspaceCapability } from "../../models/output/workspaceCapabilities";
import {
  createDynamicClothingModifier,
  measuredAirSpeedModifier,
  morningClothingEstimateModifier,
  solarGainModifier,
} from "../../services/comfort/inputModifiers";
import {
  createPmvComplianceBands,
  createPmvComplianceCaption,
  createPmvModelConfig,
  parsePmvAshraeOptions,
  pmvExploreOutputs,
  type PmvModelDeclaration,
  type PmvStandardAdapter,
} from "./pmvShared";
import { getPmvComplianceFeedback } from "./pmvCalculation";

const ashraeComplianceBands = createPmvComplianceBands();

export const pmvAshraeAdapter: PmvStandardAdapter = {
  modelId: ComfortModel.PmvAshrae,
  resultStandard: ComfortStandard.Ashrae55PmvPpd,
  clothingStandard: JsThermalComfortStandard.ASHRAE,
  clothingInsulationMaxSi: 1.5,
  supportsOccupantAirSpeedControl: true,
  calculate: (request) => pmv_ppd_ashrae(
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
      airspeed_control: request.occupantHasAirSpeedControl,
    },
  ),
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
};

export const pmvAshraeDeclaration: PmvModelDeclaration = {
  label: "PMV (ASHRAE-55)",
  description: "ASHRAE 55 PMV/PPD with comfort zone overlays.",
  adapter: pmvAshraeAdapter,
  standardIds: [StandardId.Ashrae55],
  workspaceCapabilities: [WorkspaceCapability.Standard, WorkspaceCapability.Explore],
  exploreOutputs: pmvExploreOutputs,
  modifiers: [
    measuredAirSpeedModifier,
    morningClothingEstimateModifier,
    createDynamicClothingModifier(JsThermalComfortStandard.ASHRAE),
    solarGainModifier,
  ],
  psychrometricInstanceId: "pmv-ashrae-psychrometric",
  dynamicInstanceId: "pmv-ashrae-dynamic-field",
  complianceProfile: {
    output: ModelOutputKey.Pmv,
    bands: ashraeComplianceBands,
    legendTitle: "PMV Zones",
    caption: createPmvComplianceCaption("ASHRAE 55", ashraeComplianceBands),
    getFeedback: getPmvComplianceFeedback,
  },
  defaultOptions: defaultPmvAshraeOptions,
  parseOptions: parsePmvAshraeOptions,
};

export const pmvAshraeModelConfig = createPmvModelConfig(pmvAshraeDeclaration);
