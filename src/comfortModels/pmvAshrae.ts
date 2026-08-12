/**
 * ASHRAE 55 PMV/PPD model declaration and standard-specific calculation strategy.
 */
import {
  check_standard_compliance,
  pmv_ppd_ashrae,
  t_o,
} from "jsthermalcomfort";

import { ComfortStandard } from "../models/calculationMetadata";
import { ChartId } from "../models/chartOptions";
import { ComfortModel, JsThermalComfortStandard } from "../models/comfortModels";
import { defaultPmvAshraeOptions } from "../models/inputModes";
import { ChartMode, ModelOutputKey } from "../models/modelCapabilities";
import { UnitSystem } from "../models/units";
import { StandardId } from "../models/workspaces";
import {
  createDynamicClothingModifier,
  measuredAirSpeedModifier,
  morningClothingEstimateModifier,
  solarGainModifier,
} from "../services/comfort/inputModifiers";
import {
  createPmvComplianceBands,
  createPmvComplianceCaption,
  createPmvModelConfig,
  parsePmvAshraeOptions,
  pmvChartableOutputs,
  type PmvModelDeclaration,
  type PmvStandardAdapter,
} from "./pmvShared";
import { getPmvComplianceFeedback } from "./pmvCalculation";

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
  standardIds: [StandardId.Ashrae55],
  modes: [ChartMode.Compliance, ChartMode.Explore],
  chartableOutputs: pmvChartableOutputs,
  modifiers: [
    measuredAirSpeedModifier,
    morningClothingEstimateModifier,
    createDynamicClothingModifier(JsThermalComfortStandard.ASHRAE),
    solarGainModifier,
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
    bands: ashraeComplianceBands,
    legendTitle: "PMV Zones",
    caption: createPmvComplianceCaption("ASHRAE 55", ashraeComplianceBands),
    getFeedback: getPmvComplianceFeedback,
  },
  defaultOptions: defaultPmvAshraeOptions,
  parseOptions: parsePmvAshraeOptions,
};

export const pmvAshraeModelConfig = createPmvModelConfig(pmvAshraeDeclaration);
