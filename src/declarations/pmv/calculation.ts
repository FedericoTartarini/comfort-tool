import { cooling_effect, set_tmp } from "jsthermalcomfort";
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
  type DerivedSlotQuantityState,
  getPhysicalQuantityMeta,
} from "../../catalog/quantities";
import { AirSpeedControlMode, OptionKey, TemperatureMode } from "../../catalog/inputModes";
import type { InputId as InputIdType } from "../../catalog/inputSlots";
import type { ModelCalculationContext } from "../../catalog/modelCalculation";
import type { ComplianceFeedback } from "../../catalog/modelCapabilities";
import type { TableRowAuthoring } from "../../catalog/tableTypes";
import { ThermalZone } from "../../catalog/thermalZone";
import { UnitSystem } from "../../catalog/units";
import { resolveZoneAppearance, ZoneToken } from "../../catalog/zoneTokens";
import { createRequestAxisAdapter } from "../../engines/comfort/charts/dynamicAxisPayload";
import { requireThermalZone } from "../../engines/comfort/helpers";
import { getDerivedFromAuxiliary } from "../../engines/comfort/quantityStateRouting";
import {
  createFieldRequestAdapter,
  calculatePerInputWithExtensions,
} from "../../engines/comfort/requestMapping";
import { formatDisplayValue } from "../../engines/units";
import type { PmvStandardAdapter } from "./shared";

export const PMV_PSYCHROMETRIC_VIEW = {
  tdbRangeSi: { min: 10, max: 40 },
  tdbPoints: 121,
  humidityRatioRangeSi: { min: 0, max: 0.03 },
  rhCurves: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
} as const;

const DEFAULT_PPD_COMFORT_THRESHOLD = 10;

export const pmvNeutralZone = new ThermalZone({
  label: "Neutral",
  min: -0.5,
  max: 0.5,
  token: ZoneToken.Neutral,
});

export const pmvZonesList = [
  new ThermalZone({
    label: "Cold",
    max: -2.5,
    token: ZoneToken.Cold,
  }),
  new ThermalZone({
    label: "Cool",
    min: -2.5,
    max: -1.5,
    token: ZoneToken.Cool,
  }),
  new ThermalZone({
    label: "Slightly Cool",
    min: -1.5,
    max: -0.5,
    token: ZoneToken.SlightlyCool,
  }),
  pmvNeutralZone,
  new ThermalZone({
    label: "Slightly Warm",
    min: 0.5,
    max: 1.5,
    token: ZoneToken.SlightlyWarm,
  }),
  new ThermalZone({
    label: "Warm",
    min: 1.5,
    max: 2.5,
    token: ZoneToken.Warm,
  }),
  new ThermalZone({
    label: "Hot",
    min: 2.5,
    token: ZoneToken.Hot,
  }),
];

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
  vr: number;
  set: number;
  coolingEffect: number;
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
  zone: ThermalZone;
}

export function getPmvZoneMeta(pmv: number): ThermalZone {
  return requireThermalZone(pmvZonesList, pmv, "PMV");
}

export function evaluatePmvCondition(
  adapter: PmvStandardAdapter,
  payload: PmvRequest,
): PmvChartEvaluation {
  const result = adapter.calculate(payload);
  if (!Number.isFinite(result.pmv) || !Number.isFinite(result.ppd)) {
    throw new Error("PMV evaluation returned a non-finite result.");
  }
  return {
    pmv: result.pmv,
    ppd: result.ppd,
    zone: getPmvZoneMeta(result.pmv),
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
  if (ppd === DEFAULT_PPD_COMFORT_THRESHOLD) return pmvNeutralZone.max;
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
      pmvNeutralZone.min,
      rhValues,
      PMV_PSYCHROMETRIC_VIEW.tdbRangeSi,
    ).map((point) => [point.rh, point]),
  );
  const warmByRh = new Map(
    sampleIsoline(
      evaluate,
      pmvNeutralZone.max,
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

export const pmvRequestAdapter = createFieldRequestAdapter<PmvRequest>({ tdb: PhysicalQuantityId.DryBulbTemperature, tr: PhysicalQuantityId.MeanRadiantTemperature, vr: PhysicalQuantityId.RelativeAirSpeed, rh: PhysicalQuantityId.RelativeHumidity, met: PhysicalQuantityId.MetabolicRate, clo: PhysicalQuantityId.ClothingInsulation, wme: PhysicalQuantityId.ExternalWork });

export function createPmvRequestAxisAdapter(adapter: PmvStandardAdapter) {
  return createRequestAxisAdapter({
    fieldAdapter: pmvRequestAdapter,
    aliases: { [PhysicalQuantityId.WindSpeed]: PhysicalQuantityId.RelativeAirSpeed },
    axisRanges: {
      [PhysicalQuantityId.ClothingInsulation]: {
        min: getPhysicalQuantityMeta(PhysicalQuantityId.ClothingInsulation)
          .minSi,
        max: adapter.clothingInsulationMaxSi,
      },
    },
    operativeTemperature: {
      get: adapter.getOperativeTemperature,
      set: (request, valueSi) => {
        request.tdb = valueSi;
        request.tr = valueSi;
      },
      range: { min: getPhysicalQuantityMeta(PhysicalQuantityId.OperativeTemperature)
          .minSi, max: getPhysicalQuantityMeta(PhysicalQuantityId.OperativeTemperature)
          .maxSi },
    },
  });
}

export function toPmvRequest(
  context: ModelCalculationContext,
  inputId: InputIdType,
  adapter: PmvStandardAdapter,
): PmvRequest {
  const requestFields = pmvRequestAdapter.mapRequest(context, inputId);
  return {
    ...requestFields,
    occupantHasAirSpeedControl:
      adapter.supportsOccupantAirSpeedControl &&
      context.options[OptionKey.AirSpeedControlMode] ===
        AirSpeedControlMode.WithLocalControl,
  };
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
    PhysicalQuantityId.Pmv,
    {
      id: "zone",
      label: "Zone",
      format: (result) => {
        const zone = getPmvZoneMeta(result.pmv);
        return { text: zone.label, color: zone.textColor };
      },
    },
    PhysicalQuantityId.Ppd,
    {
      id: "acceptability",
      label: "Acceptability",
      format: (result) => ({
        text: `${formatDisplayValue(100 - result.ppd)}%`,
      }),
    },
    PhysicalQuantityId.Set,
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
): Pick<PmvResponse, "set" | "coolingEffect" | "vr" | "dynamicClothing"> {
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
  const coolingEffect = requireFiniteOutput(
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
    coolingEffect,
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
  return calculatePerInputWithExtensions({
    context,
    visibleInputIds,
    mapRequest: (calculationContext, inputId) =>
      toPmvRequest(calculationContext, inputId, adapter),
    mapChartRequest: (request) => ({
      ...request,
      rhMin: 0,
      rhMax: 100,
      rhPoints: 31,
    }),
    calculate: (request) => {
      const result = evaluatePmvCondition(adapter, request);
      const complianceWarnings = adapter.checkApplicability(request);
      return {
        pmv: result.pmv,
        ppd: result.ppd,
        ...derivePmvAnalysisOutputs(request),
        isCompliant:
          complianceWarnings.length === 0 && result.zone === pmvNeutralZone,
        standard: adapter.resultStandard,
        source: CalculationSource.JsThermalComfort,
      };
    },
    createChartSource: (): PmvChartSource => ({
      inputs: {},
      comfortZonesByInput: {},
      derivedSlotsByInput: {},
      psychrometricTrEqualsTdb:
        context.options[OptionKey.TemperatureMode] === TemperatureMode.Operative,
    }),
    afterCalculate: ({ inputId, chartRequest, chartSource }) => {
      chartSource.comfortZonesByInput[inputId] = calculateComfortZone(
        adapter,
        chartRequest,
        chartSource.psychrometricTrEqualsTdb,
      );
      if (!chartSource.derivedSlotsByInput) {
        chartSource.derivedSlotsByInput = {};
      }
      chartSource.derivedSlotsByInput[inputId] = getDerivedFromAuxiliary(
        context.auxiliaryQuantitiesByInput[inputId],
      );
    },
  });
}
