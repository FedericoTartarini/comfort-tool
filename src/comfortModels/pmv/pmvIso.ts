/**
 * ISO 7730 Category B PMV/PPD declaration and standard-specific calculation strategy.
 */
import {
  check_standard_compliance,
  pmv_ppd,
  t_o,
} from "jsthermalcomfort";

import { ComfortStandard } from "../../models/calculationMetadata";
import { ComfortModel, JsThermalComfortStandard } from "../../models/comfortModels";
import { defaultPmvIsoOptions } from "../../models/inputModes";
import { ModelOutputKey } from "../../models/modelCapabilities";
import { UnitSystem } from "../../models/units";
import { StandardId } from "../../models/workspaces";
import { ChartInstanceId } from "../../models/output/chartInstances";
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
  parsePmvIsoOptions,
  pmvExploreOutputs,
  type PmvModelDeclaration,
  type PmvStandardAdapter,
} from "./pmvShared";
import { getPmvComplianceFeedback } from "./pmvCalculation";

const isoComplianceBands = createPmvComplianceBands();

export const pmvIsoAdapter: PmvStandardAdapter = {
  modelId: ComfortModel.PmvIso,
  resultStandard: ComfortStandard.Iso7730PmvPpd,
  // ISO 7730 applicability includes the upper boundary of 2 clo.
  clothingInsulationMaxSi: 2,
  supportsOccupantAirSpeedControl: false,
  calculate: (request) => pmv_ppd(
    request.tdb,
    request.tr,
    request.vr,
    request.rh,
    request.met,
    request.clo,
    request.wme,
    JsThermalComfortStandard.ISO,
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
};

export const pmvIsoDeclaration: PmvModelDeclaration = {
  label: "PMV (ISO 7730 Category B)",
  description: "ISO 7730 Category B PMV/PPD with comfort zone overlays.",
  adapter: pmvIsoAdapter,
  standardIds: [StandardId.Iso7730],
  workspaceCapabilities: [WorkspaceCapability.Standard, WorkspaceCapability.Explore],
  exploreOutputs: pmvExploreOutputs,
  modifiers: [
    measuredAirSpeedModifier,
    morningClothingEstimateModifier,
    createDynamicClothingModifier(JsThermalComfortStandard.ISO),
    solarGainModifier,
  ],
  psychrometricInstanceId: ChartInstanceId.PmvIso.Psychrometric,
  dynamicInstanceId: ChartInstanceId.PmvIso.DynamicField,
  complianceProfile: {
    output: ModelOutputKey.Pmv,
    bands: isoComplianceBands,
    legendTitle: "PMV Zones",
    caption: createPmvComplianceCaption("ISO 7730 Category B", isoComplianceBands),
    getFeedback: getPmvComplianceFeedback,
  },
  defaultOptions: defaultPmvIsoOptions,
  parseOptions: parsePmvIsoOptions,
};

export const pmvIsoModelConfig = createPmvModelConfig(pmvIsoDeclaration);
