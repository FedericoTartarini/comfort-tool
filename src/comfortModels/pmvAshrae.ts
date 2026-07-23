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
import {
  createPmvComplianceBands,
  createPmvModelConfig,
  pmvChartableOutputs,
  type PmvStandardAdapter,
} from "./pmvShared";

const ashraeComplianceBands = createPmvComplianceBands();

export const pmvAshraeAdapter: PmvStandardAdapter = {
  modelId: ComfortModel.PmvAshrae,
  calculationStandard: JsThermalComfortStandard.ASHRAE,
  resultStandard: ComfortStandard.Ashrae55PmvPpd,
  calculate: (request) => pmv_ppd_ashrae(
    request.tdb,
    request.tr,
    request.vr,
    request.rh,
    request.met,
    request.clo,
    request.wme,
    {
      units: request.units,
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
    } as any,
  ),
  getOperativeTemperature: (request) => t_o(
    request.tdb,
    request.tr,
    request.vr,
    JsThermalComfortStandard.ASHRAE,
  ),
};

export const pmvAshraeModelConfig = createPmvModelConfig({
  adapter: pmvAshraeAdapter,
  modes: [ChartMode.Compliance, ChartMode.Explore],
  chartableOutputs: pmvChartableOutputs,
  complianceSpec: {
    output: ModelOutputKey.Pmv,
    bands: ashraeComplianceBands,
  },
});
