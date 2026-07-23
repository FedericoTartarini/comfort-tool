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
import {
  createPmvComplianceBands,
  createPmvModelConfig,
  pmvChartableOutputs,
  type PmvStandardAdapter,
} from "./pmvShared";

const isoComplianceBands = createPmvComplianceBands();

export const pmvIsoAdapter: PmvStandardAdapter = {
  modelId: ComfortModel.PmvIso,
  calculationStandard: JsThermalComfortStandard.ISO,
  resultStandard: ComfortStandard.Iso7730PmvPpd,
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
      units: request.units,
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
    } as any,
  ),
  getOperativeTemperature: (request) => t_o(
    request.tdb,
    request.tr,
    request.vr,
    JsThermalComfortStandard.ISO,
  ),
};

export const pmvIsoModelConfig = createPmvModelConfig({
  adapter: pmvIsoAdapter,
  modes: [ChartMode.Compliance, ChartMode.Explore],
  chartableOutputs: pmvChartableOutputs,
  complianceSpec: {
    output: ModelOutputKey.Pmv,
    bands: isoComplianceBands,
  },
});
