/**
 * ISO 7730 Category B PMV/PPD declaration and standard-specific calculation strategy.
 */
import {
  check_standard_compliance,
  pmv_ppd,
  t_o,
} from "jsthermalcomfort";

import { ComfortStandard } from "../models/calculationMetadata";
import { ComfortModel, JsThermalComfortStandard } from "../models/comfortModels";
import { ChartMode, ModelOutputKey } from "../models/modelCapabilities";
import { UnitSystem } from "../models/units";
import {
  createPmvComplianceBands,
  createPmvModelConfig,
  getPmvComplianceFeedback,
  pmvChartableOutputs,
  type PmvModelDeclaration,
  type PmvStandardAdapter,
} from "./pmvShared";

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
  modes: [ChartMode.Compliance, ChartMode.Explore],
  chartableOutputs: pmvChartableOutputs,
  complianceSpec: {
    output: ModelOutputKey.Pmv,
    bands: isoComplianceBands,
    caption: "ISO 7730 Category B PMV compliance limits are locked for this chart.",
    getFeedback: getPmvComplianceFeedback,
  },
};

export const pmvIsoModelConfig = createPmvModelConfig(pmvIsoDeclaration);
