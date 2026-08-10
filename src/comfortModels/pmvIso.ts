/**
 * ISO 7730 Category B PMV/PPD declaration and standard-specific calculation strategy.
 */
import {
  check_standard_compliance,
  pmv_ppd,
  t_o,
} from "jsthermalcomfort";

import { ComfortStandard } from "../models/calculationMetadata";
import { ChartId } from "../models/chartOptions";
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
  pmvZonesList,
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
  zones: pmvZonesList,
  supportedModifiers: [
    ModifierId.MeasuredAirSpeed,
    ModifierId.MorningClothingEstimate,
    ModifierId.SolarGain,
  ],
  charts: {
    defaultId: ChartId.PmvDynamic,
    entries: [
      {
        id: ChartId.Psychrometric,
        name: "Psychrometric",
        emptyMessage: "No psychrometric chart yet.",
        allowsAxisSelection: false,
        locksYAxis: false,
        showsZoneToggle: true,
        showsLegend: true,
      },
      {
        id: ChartId.PmvDynamic,
        name: "Dynamic",
        emptyMessage: "No dynamic chart yet.",
        allowsAxisSelection: true,
        locksYAxis: false,
        showsZoneToggle: false,
        showsLegend: true,
      },
    ],
  },
  complianceSpec: {
    output: ModelOutputKey.Pmv,
    bands: isoComplianceBands,
    legendTitle: "PMV Zones",
    caption: createPmvComplianceCaption("ISO 7730 Category B", isoComplianceBands),
    getFeedback: getPmvComplianceFeedback,
  },
};

export const pmvIsoModelConfig = createPmvModelConfig(pmvIsoDeclaration);
