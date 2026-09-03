import { cooling_effect, pmv_ppd_ashrae, pmv_ppd_iso, set_tmp } from "jsthermalcomfort";
import { sampleIsoline } from "../../charts/psychrometric/isolines";
import {
  CalculationSource,
  type ComfortStandard,
} from "../../catalog/calculationMetadata";
import type {
  CompareInputMap,
  ModelChartSource,
} from "../../catalog/chartSource";
import { ComplianceStatus } from "../../catalog/modelIds";
import {
  PhysicalQuantityId,
} from "../../catalog/quantities";
import type { DerivedSlotQuantityState } from "../../engines/comfort/derivations/psychrometrics";
import { AirSpeedControlMode, OptionKey, TemperatureMode } from "../../catalog/inputModes";
import type { InputId as InputIdType } from "../../catalog/inputSlots";
import { InputId } from "../../catalog/inputSlots";
import type { ModelCalculationContext } from "../../catalog/modelCalculation";
import type { ComplianceFeedback } from "../../catalog/modelCapabilities";
import type { TableRowAuthoring } from "../../catalog/tableTypes";
import { ThermalZone } from "../../catalog/thermalZone";
import { UnitSystem } from "../../catalog/units";
import { resolveZoneAppearance, ZoneToken } from "../../catalog/zoneTokens";
import { createRequestAxisAdapter } from "../../engines/comfort/charts/dynamicAxisPayload";
import { getDerivedFromQuantities } from "../../engines/comfort/quantityStateRouting";
import {
  defineLibraryQuantityMapping,
} from "../../engines/comfort/requestMapping";
import { LIBRARY_INVOKE_DEFAULTS } from "../../engines/comfort/libraryInvoke";
import { formatDisplayValue } from "../../engines/units";
import type { PmvStandardAdapter } from "./shared";
import { pmvTsvAppearance } from "./zones";

import {
  DEFAULT_PSYCHROMETRIC_VIEW,
} from "../../charts/psychrometric/humidity";

export const PMV_PSYCHROMETRIC_VIEW = DEFAULT_PSYCHROMETRIC_VIEW;

/** Explore PPD 10% chart preset. Not a library classifier. */
const PPD_EXPLORE_THRESHOLD_PERCENT = 10;
/** Conventional |PMV| contour drawn for that Explore PPD preset. */
const PPD_EXPLORE_CONTOUR_ABS_PMV = pmv_ppd_ashrae.COMPLIANCE_LIMIT;

export interface ComfortPoint {
  tdb: number;
  rh: number;
}

export interface PmvRequest {
  tdb: number;
  tr: number;
  vr: number;
  rh: number;
  met: number;
  clo: number;
  wme: number;
  occupantHasAirSpeedControl: boolean;
}

export interface ComfortZoneRequest extends PmvRequest {
  rhMin: number;
  rhMax: number;
  rhPoints: number;
}

export interface ComfortZoneResponse {
  coolEdge: ComfortPoint[];
  warmEdge: ComfortPoint[];
  source: CalculationSource;
}

export interface PmvResponse {
  pmv: number;
  ppd: number;
  tsv: string;
  vr: number;
  set: number;
  ce: number;
  dynamicClothing: number;
  isCompliant: boolean;
  standard: ComfortStandard;
  source: CalculationSource;
}

export interface PmvChartSource extends ModelChartSource<ComfortZoneRequest> {
  comfortZonesByInput: CompareInputMap<ComfortZoneResponse>;
  derivedSlotsByInput?: CompareInputMap<DerivedSlotQuantityState>;
  /** When true, Psychrometric samples use tr = tdb (CBE psychtop / Operative). */
  psychrometricTrEqualsTdb: boolean;
}

export interface PmvChartEvaluation {
  pmv: number;
  ppd: number;
  tsv: string | null;
  zone: ThermalZone | null;
  acceptable: boolean;
}

function pmvZoneFromTsv(
  adapter: PmvStandardAdapter,
  tsv: string,
): ThermalZone {
  const zone = adapter.tsvZones.find((item) => item.label === tsv);
  if (!zone) {
    throw new Error(`Unknown ${adapter.resultStandard} TSV category: ${tsv}.`);
  }
  return zone;
}

export function getPmvZoneMeta(
  adapter: PmvStandardAdapter,
  pmv: number,
): ThermalZone {
  return pmvZoneFromTsv(adapter, adapter.classifyTsv(pmv));
}

function tryPmvZoneFromLibraryTsv(
  adapter: PmvStandardAdapter,
  tsv: string | number,
): { tsv: string; zone: ThermalZone } | null {
  if (typeof tsv !== "string" || tsv.length === 0) {
    return null;
  }
  return { tsv, zone: pmvZoneFromTsv(adapter, tsv) };
}

function libraryPmvIsAcceptable(
  adapter: PmvStandardAdapter,
  result: {
    pmv: number;
    compliance?: boolean | number;
  },
): boolean {
  if (typeof result.compliance === "boolean") {
    return result.compliance;
  }
  return adapter.isAcceptablePmv(result.pmv);
}

export function evaluatePmvCondition(
  adapter: PmvStandardAdapter,
  payload: PmvRequest,
): PmvChartEvaluation {
  const result = adapter.calculate(payload);
  if (!Number.isFinite(result.pmv) || !Number.isFinite(result.ppd)) {
    throw new Error("PMV evaluation returned a non-finite result.");
  }
  const classified = tryPmvZoneFromLibraryTsv(adapter, result.tsv);
  return {
    pmv: result.pmv,
    ppd: result.ppd,
    tsv: classified?.tsv ?? null,
    zone: classified?.zone ?? null,
    acceptable: libraryPmvIsAcceptable(adapter, result),
  };
}

function isKnownPmvDomainFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return [
    "Root is not bracketed",
    "Could not achieve required tolerance",
    "Max iterations exceeded",
  ].some((message) => error.message.includes(message));
}

/** Returns null only for known library-domain failures at chart sample points. */
export function tryEvaluatePmvForChart(
  adapter: PmvStandardAdapter,
  payload: PmvRequest,
): PmvChartEvaluation | null {
  try {
    return evaluatePmvCondition(adapter, payload);
  } catch (error) {
    if (isKnownPmvDomainFailure(error)) return null;
    throw error;
  }
}

/**
 * Inverts ISO 7730 / ASHRAE PPD(PMV) for |PMV|. PPD 5% is the formula
 * minimum at PMV = 0.
 */
export function invertPpdToAbsPmv(ppd: number): number {
  if (ppd <= 5) return 0;
  if (ppd >= 100) return Number.POSITIVE_INFINITY;
  const ratio = (100 - ppd) / 95;
  if (ratio <= 0) return Number.POSITIVE_INFINITY;
  const logRatio = Math.log(ratio);
  const a = 0.03353;
  const b = 0.2179;
  const discriminant = b * b - 4 * a * logRatio;
  if (discriminant < 0) return 0;
  const pmvSquared = (-b + Math.sqrt(discriminant)) / (2 * a);
  return pmvSquared <= 0 ? 0 : Math.sqrt(pmvSquared);
}

export function ppdThresholdToAbsPmv(ppd: number): number {
  if (ppd === PPD_EXPLORE_THRESHOLD_PERCENT) return PPD_EXPLORE_CONTOUR_ABS_PMV;
  return invertPpdToAbsPmv(ppd);
}

export function psychrometricPmvRequest(
  payload: PmvRequest,
  tdb: number,
  rh: number,
  trEqualsTdb: boolean,
): PmvRequest {
  return trEqualsTdb
    ? { ...payload, tdb, tr: tdb, rh }
    : { ...payload, tdb, rh };
}

export function evaluatePsychrometricPmv(
  adapter: PmvStandardAdapter,
  payload: PmvRequest,
  tdb: number,
  rh: number,
  trEqualsTdb: boolean,
): number | null {
  const evaluation = tryEvaluatePmvForChart(
    adapter,
    psychrometricPmvRequest(payload, tdb, rh, trEqualsTdb),
  );
  return evaluation ? evaluation.pmv : null;
}

export function calculateComfortZone(
  adapter: PmvStandardAdapter,
  payload: ComfortZoneRequest,
  trEqualsTdb = false,
): ComfortZoneResponse {
  const rhMinimum = Math.min(payload.rhMin, payload.rhMax);
  const rhMaximum = Math.max(payload.rhMin, payload.rhMax);
  const rhValues =
    payload.rhPoints === 1
      ? [rhMinimum]
      : Array.from(
          { length: payload.rhPoints },
          (_, index) =>
            rhMinimum +
            ((rhMaximum - rhMinimum) * index) / (payload.rhPoints - 1),
        );
  const evaluate = (tdb: number, rh: number) => (
    evaluatePsychrometricPmv(adapter, payload, tdb, rh, trEqualsTdb)
  );
  const coolByRh = new Map(
    sampleIsoline(
      evaluate,
      adapter.comfortIsolineTargets[0],
      rhValues,
      PMV_PSYCHROMETRIC_VIEW.tdbRangeSi,
    ).map((point) => [point.rh, point]),
  );
  const warmByRh = new Map(
    sampleIsoline(
      evaluate,
      adapter.comfortIsolineTargets[1],
      rhValues,
      PMV_PSYCHROMETRIC_VIEW.tdbRangeSi,
    ).map((point) => [point.rh, point]),
  );
  const coolEdge: ComfortPoint[] = [];
  const warmEdge: ComfortPoint[] = [];
  rhValues.forEach((relativeHumidity) => {
    const cool = coolByRh.get(relativeHumidity);
    const warm = warmByRh.get(relativeHumidity);
    if (!cool || !warm) return;
    coolEdge.push(cool);
    warmEdge.push(warm);
  });

  return {
    coolEdge,
    warmEdge,
    source: CalculationSource.FrontendGenerated,
  };
}

export const pmvQuantityMapping = defineLibraryQuantityMapping<PmvRequest>({
  tdb: PhysicalQuantityId.DryBulbTemperature,
  tr: PhysicalQuantityId.MeanRadiantTemperature,
  vr: PhysicalQuantityId.RelativeAirSpeed,
  rh: PhysicalQuantityId.RelativeHumidity,
  met: PhysicalQuantityId.MetabolicRate,
  clo: PhysicalQuantityId.ClothingInsulation,
  wme: PhysicalQuantityId.ExternalWork,
  pmv: PhysicalQuantityId.PredictedMeanVote,
  ppd: PhysicalQuantityId.PredictedPercentageOfDissatisfied,
  set: PhysicalQuantityId.StandardEffectiveTemperature,
  ce: PhysicalQuantityId.CoolingEffect,
});

export const pmvIndoorTemperatureRangeSi = { min: 10, max: 40 };
export const pmvAirSpeedRangeSi = { min: 0, max: 2 };
export const pmvRelativeHumidityRangeSi = { min: 0, max: 100 };
export const pmvMetabolicRateRangeSi = { min: 1, max: 4 };
export const pmvClothingInsulationMinSi = 0;

export function createPmvRequestAxisAdapter(adapter: PmvStandardAdapter) {
  return createRequestAxisAdapter({
    quantityMapping: pmvQuantityMapping,
    aliases: { [PhysicalQuantityId.WindSpeed]: PhysicalQuantityId.RelativeAirSpeed },
    axisRanges: {
      [PhysicalQuantityId.DryBulbTemperature]: pmvIndoorTemperatureRangeSi,
      [PhysicalQuantityId.MeanRadiantTemperature]: pmvIndoorTemperatureRangeSi,
      [PhysicalQuantityId.RelativeAirSpeed]: pmvAirSpeedRangeSi,
      [PhysicalQuantityId.WindSpeed]: pmvAirSpeedRangeSi,
      [PhysicalQuantityId.RelativeHumidity]: pmvRelativeHumidityRangeSi,
      [PhysicalQuantityId.MetabolicRate]: pmvMetabolicRateRangeSi,
      [PhysicalQuantityId.ClothingInsulation]: {
        min: pmvClothingInsulationMinSi,
        max: adapter.clothingInsulationMaxSi,
      },
    },
    operativeTemperature: {
      get: adapter.getOperativeTemperature,
      set: (request, valueSi) => {
        request.tdb = valueSi;
        request.tr = valueSi;
      },
      range: pmvIndoorTemperatureRangeSi,
    },
  });
}

export function toPmvRequest(
  context: ModelCalculationContext,
  inputId: InputIdType,
  adapter: PmvStandardAdapter,
): PmvRequest {
  const requestFields = pmvQuantityMapping.mapRequest(context, inputId);
  return {
    ...requestFields,
    occupantHasAirSpeedControl:
      adapter.supportsOccupantAirSpeedControl &&
      context.options[OptionKey.AirSpeedControlMode] ===
        AirSpeedControlMode.WithLocalControl,
  };
}

export function invokePmvAshraeLibrary(request: PmvRequest) {
  return pmv_ppd_ashrae(
    request.tdb,
    request.tr,
    request.vr,
    request.rh,
    request.met,
    request.clo,
    request.wme,
    {
      units: LIBRARY_INVOKE_DEFAULTS.units,
      limit_inputs: LIBRARY_INVOKE_DEFAULTS.limit_inputs,
      airspeed_control: request.occupantHasAirSpeedControl,
    },
  );
}

export function invokePmvIsoLibrary(request: PmvRequest) {
  return pmv_ppd_iso(
    request.tdb,
    request.tr,
    request.vr,
    request.rh,
    request.met,
    request.clo,
    request.wme,
    {
      units: LIBRARY_INVOKE_DEFAULTS.units,
      limit_inputs: LIBRARY_INVOKE_DEFAULTS.limit_inputs,
    },
  );
}

export function evaluatePmvSlot(
  adapter: PmvStandardAdapter,
  context: ModelCalculationContext,
  inputId: InputIdType,
): PmvResponse {
  const request = toPmvRequest(context, inputId, adapter);
  const result = evaluatePmvCondition(adapter, request);
  const complianceWarnings = adapter.checkApplicability(request);
  return {
    pmv: result.pmv,
    ppd: result.ppd,
    tsv: result.tsv ?? "Unclassified",
    ...derivePmvAnalysisOutputs(request),
    isCompliant:
      complianceWarnings.length === 0 && result.acceptable,
    standard: adapter.resultStandard,
    source: CalculationSource.JsThermalComfort,
  };
}

export function toPmvChartRequest(request: PmvRequest): ComfortZoneRequest {
  return {
    ...request,
    rhMin: 0,
    rhMax: 100,
    rhPoints: 31,
  };
}

export function buildPmvChartSource(
  adapter: PmvStandardAdapter,
  context: ModelCalculationContext,
  visibleInputIds: readonly InputIdType[],
): PmvChartSource {
  const chartSource: PmvChartSource = {
    inputs: {},
    comfortZonesByInput: {},
    derivedSlotsByInput: {},
    psychrometricTrEqualsTdb:
      context.options[OptionKey.TemperatureMode] === TemperatureMode.Operative,
  };
  for (const inputId of visibleInputIds) {
    const chartRequest = toPmvChartRequest(
      toPmvRequest(context, inputId, adapter),
    );
    chartSource.inputs[inputId] = chartRequest;
    chartSource.comfortZonesByInput[inputId] = calculateComfortZone(
      adapter,
      chartRequest,
      chartSource.psychrometricTrEqualsTdb,
    );
    chartSource.derivedSlotsByInput = {
      ...chartSource.derivedSlotsByInput,
      [inputId]: getDerivedFromQuantities(
        context.effectiveQuantitiesByInput[inputId],
      ),
    };
  }
  return chartSource;
}

export function getPmvComplianceFeedback(
  result: PmvResponse,
): ComplianceFeedback {
  return {
    text: result.isCompliant
      ? ComplianceStatus.Compliant
      : ComplianceStatus.OutOfRange,
    passes: result.isCompliant,
  };
}

function requireFiniteOutput(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} evaluation returned a non-finite result.`);
  }
  return value;
}

export function buildPmvResultRows(): TableRowAuthoring<PmvResponse>[] {
  return [
    {
      id: "compliance",
      label: "Compliance",
      format: (result) => {
        const feedback = getPmvComplianceFeedback(result);
        return {
          text: feedback.text,
          color: feedback.passes
            ? resolveZoneAppearance(ZoneToken.PassFill).text
            : resolveZoneAppearance(ZoneToken.ExtremeDanger).fill,
        };
      },
    },
    PhysicalQuantityId.PredictedMeanVote,
    {
      id: "zone",
      label: "Zone",
      format: (result) => ({
        text: result.tsv,
        color: pmvTsvAppearance(result.tsv).text,
      }),
    },
    PhysicalQuantityId.PredictedPercentageOfDissatisfied,
    {
      id: "acceptability",
      label: "Acceptability",
      format: (result) => ({
        text: `${formatDisplayValue(100 - result.ppd)}%`,
      }),
    },
    PhysicalQuantityId.StandardEffectiveTemperature,
    PhysicalQuantityId.CoolingEffect,
    {
      quantity: PhysicalQuantityId.RelativeAirSpeed,
      id: "relative-air-speed",
      label: "Relative air speed",
      value: (result) => result.vr,
    },
    {
      quantity: PhysicalQuantityId.ClothingInsulation,
      id: "dynamic-clothing",
      label: "Dynamic clothing",
      value: (result) => result.dynamicClothing,
    },
  ];
}

export function derivePmvAnalysisOutputs(
  request: PmvRequest,
): Pick<PmvResponse, "set" | "ce" | "vr" | "dynamicClothing"> {
  const set = requireFiniteOutput(
    set_tmp(
      request.tdb,
      request.tr,
      request.vr,
      request.rh,
      request.met,
      request.clo,
      request.wme,
      undefined,
      undefined,
      "sitting",
      UnitSystem.SI,
      false,
    ).set,
    "SET",
  );
  const ce = requireFiniteOutput(
    cooling_effect(
      request.tdb,
      request.tr,
      request.vr,
      request.rh,
      request.met,
      request.clo,
      request.wme,
      UnitSystem.SI,
    ).ce,
    "Cooling effect",
  );
  return {
    set,
    ce,
    vr: request.vr,
    // Clothing actually used in PMV/SET/CE. Do not re-apply clo_dynamic:
    // the Dynamic Clothing modifier already wrote that value onto request.clo.
    dynamicClothing: requireFiniteOutput(request.clo, "Dynamic clothing"),
  };
}

export function calculatePmvModel(
  context: ModelCalculationContext,
  visibleInputIds: InputIdType[],
  adapter: PmvStandardAdapter,
) {
  const resultsByInput: Record<InputIdType, PmvResponse | null> = {
    [InputId.Input1]: null,
    [InputId.Input2]: null,
    [InputId.Input3]: null,
  };
  for (const inputId of visibleInputIds) {
    resultsByInput[inputId] = evaluatePmvSlot(adapter, context, inputId);
  }
  return {
    resultsByInput,
    chartSource: buildPmvChartSource(adapter, context, visibleInputIds),
  };
}
