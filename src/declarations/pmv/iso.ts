/**
 * ISO 7730 Category B PMV/PPD declaration and standard-specific calculation strategy.
 */
import { PhysicalQuantityId } from "../../catalog/quantities";
import {
  check_standard_compliance,
  pmv_ppd,
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
  createPmvComplianceBands,
  createPmvComplianceCaption,
  createPmvModelConfig,
  parsePmvIsoOptions,
  pmvExploreOutputs,
  type PmvModelDeclaration,
  type PmvStandardAdapter,
} from "./shared";
import { getPmvComplianceFeedback } from "./calculation";

const isoComplianceBands = createPmvComplianceBands();

export const pmvIsoAdapter: PmvStandardAdapter = {
  modelId: ModelId.PmvIso,
  resultStandard: ComfortStandard.Iso7730PmvPpd,
  clothingStandard: JsThermalComfortStandard.ISO,
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
  surfaceCapabilities: [SurfaceId.Standard, SurfaceId.Explore],
  exploreOutputs: pmvExploreOutputs,
  modifiers: [
    measuredAirSpeedModifier,
    morningClothingEstimateModifier,
    createDynamicClothingModifier(JsThermalComfortStandard.ISO),
    solarGainModifier,
  ],
  psychrometricChartId: "pmv-iso-psychrometric",
  dynamicChartId: "pmv-iso-dynamic-field",
  heatLossChartId: "pmv-iso-heat-loss",
  setChartId: "pmv-iso-set",
  complianceProfile: {
    output: PhysicalQuantityId.Pmv,
    bands: isoComplianceBands,
    legendTitle: "PMV Zones",
    caption: createPmvComplianceCaption("ISO 7730 Category B", isoComplianceBands),
    getFeedback: getPmvComplianceFeedback,
  },
  defaultOptions: defaultPmvIsoOptions,
  parseOptions: parsePmvIsoOptions,
};

export const pmvIsoModelConfig = createPmvModelConfig(pmvIsoDeclaration);
