/**
 * ASHRAE 55 PMV/PPD model declaration and standard-specific calculation strategy.
 */
import {
  check_standard_compliance,
  pmv_ppd_ashrae,
  t_o,
} from "jsthermalcomfort";

import { ComfortStandard } from "../models/calculationMetadata";
import { ComfortModel, JsThermalComfortStandard } from "../models/comfortModels";
import { ChartMode, ModelOutputKey } from "../models/modelCapabilities";
import { ModifierId } from "../models/inputModifiers";
import { UnitSystem } from "../models/units";
import {
  createPmvComplianceBands,
  createPmvComplianceCaption,
  createPmvModelConfig,
  getPmvComplianceFeedback,
  pmvChartableOutputs,
  type PmvModelDeclaration,
  type PmvStandardAdapter,
} from "./pmvShared";

const ashraeComplianceBands = createPmvComplianceBands();

export const pmvAshraeAdapter: PmvStandardAdapter = {
  modelId: ComfortModel.PmvAshrae,
  resultStandard: ComfortStandard.Ashrae55PmvPpd,
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
  modes: [ChartMode.Compliance, ChartMode.Explore],
  chartableOutputs: pmvChartableOutputs,
  supportedModifiers: [
    ModifierId.MeasuredAirSpeed,
    ModifierId.MorningClothingEstimate,
    ModifierId.SolarGain,
  ],
  complianceSpec: {
    output: ModelOutputKey.Pmv,
    bands: ashraeComplianceBands,
    caption: createPmvComplianceCaption("ASHRAE 55", ashraeComplianceBands),
    getFeedback: getPmvComplianceFeedback,
  },
};

export const pmvAshraeModelConfig = createPmvModelConfig(pmvAshraeDeclaration);
