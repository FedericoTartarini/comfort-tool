import { cooling_effect, set_tmp } from "jsthermalcomfort";

import {
  CalculationSource,
  type ComfortStandard,
} from "../../models/calculationMetadata";
import type {
  CompareInputMap,
  ModelChartSource,
} from "../../models/chartSource";
import { ComplianceStatus } from "../../models/modelIds";
import {
  PhysicalQuantityId,
  getQuantityPresentationMeta,
  type ChartAxisQuantityId,
  type DerivedSlotQuantityState,
  getPhysicalQuantityMeta,
} from "../../models/quantities";
import { AirSpeedControlMode, OptionKey } from "../../models/inputModes";
import type { InputId as InputIdType } from "../../models/inputSlots";
import type { ModelCalculationContext } from "../../models/modelCalculation";
import type { ComplianceFeedback } from "../../models/modelCapabilities";
import type { TableRowSpec } from "../../models/tableTypes";
import type { ResultCellViewModel } from "../../models/output/resultSections";
import { ThermalZone } from "../../models/thermalZone";
import {
  UnitSystem,
  type UnitSystem as UnitSystemType,
} from "../../models/units";
import { resolveZoneAppearance, ZoneToken } from "../../models/zoneTokens";
import { createRequestAxisAdapter } from "../../services/comfort/charts/dynamicAxisPayload";
import { requireThermalZone } from "../../services/comfort/helpers";
import { getDerivedFromAuxiliary } from "../../services/comfort/quantityStateRouting";
import {
  createFieldRequestAdapter,
  calculatePerInputWithExtensions,
} from "../../services/comfort/requestMapping";
import {
  convertFieldValueFromSi,
  convertTemperatureDeltaFromSi,
  formatDisplayValue,
} from "../../services/units";
import type { PmvStandardAdapter } from "./pmvShared";

export const PMV_PSYCHROMETRIC_VIEW = {
  tdbRangeSi: { min: 10, max: 40 },
  tdbPoints: 121,
  humidityRatioRangeSi: { min: 0, max: 0.03 },
  rhCurves: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
} as const;

const ROOT_SCAN_POINTS = 101;
const ROOT_MAX_BISECTION_EVALUATIONS = 30;
const ROOT_TOLERANCE = 5e-4;

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
}

export interface PmvChartEvaluation {
  pmv: number;
  ppd: number;
  zone: ThermalZone;
}

type TemperatureBracket =
  | { exactTemperature: number }
  | { low: number; high: number; lowDelta: number; highDelta: number };

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

function evaluatePmvDeltaAtTemperature(
  adapter: PmvStandardAdapter,
  targetPmv: number,
  rh: number,
  payload: PmvRequest,
  temperature: number,
): number | null {
  const evaluation = tryEvaluatePmvForChart(adapter, {
    ...payload,
    tdb: temperature,
    rh,
  });
  return evaluation ? evaluation.pmv - targetPmv : null;
}

function createTemperatureBracket(
  low: number,
  lowDelta: number,
  high: number,
  highDelta: number,
): TemperatureBracket | null {
  if (Math.abs(lowDelta) <= ROOT_TOLERANCE) return { exactTemperature: low };
  if (Math.abs(highDelta) <= ROOT_TOLERANCE) return { exactTemperature: high };
  return lowDelta * highDelta <= 0 ? { low, high, lowDelta, highDelta } : null;
}

function findTemperatureBracket(
  adapter: PmvStandardAdapter,
  targetPmv: number,
  rh: number,
  payload: PmvRequest,
): TemperatureBracket | null {
  let previousTemperature: number | null = null;
  let previousDelta: number | null = null;
  const { min, max } = PMV_PSYCHROMETRIC_VIEW.tdbRangeSi;

  for (let index = 0; index < ROOT_SCAN_POINTS; index += 1) {
    const temperature = min + ((max - min) * index) / (ROOT_SCAN_POINTS - 1);
    const delta = evaluatePmvDeltaAtTemperature(
      adapter,
      targetPmv,
      rh,
      payload,
      temperature,
    );
    if (delta === null) {
      previousTemperature = null;
      previousDelta = null;
      continue;
    }
    if (Math.abs(delta) <= ROOT_TOLERANCE) {
      return { exactTemperature: temperature };
    }
    if (previousTemperature !== null && previousDelta !== null) {
      const bracket = createTemperatureBracket(
        previousTemperature,
        previousDelta,
        temperature,
        delta,
      );
      if (bracket) return bracket;
    }
    previousTemperature = temperature;
    previousDelta = delta;
  }
  return null;
}

function solveDryBulbForTargetPmv(
  adapter: PmvStandardAdapter,
  targetPmv: number,
  rh: number,
  payload: PmvRequest,
): number | null {
  const bracket = findTemperatureBracket(adapter, targetPmv, rh, payload);
  if (!bracket) return null;
  if ("exactTemperature" in bracket) return bracket.exactTemperature;

  let { low, high, lowDelta } = bracket;
  let closestTemperature =
    Math.abs(lowDelta) <= Math.abs(bracket.highDelta) ? low : high;
  let closestDelta = Math.min(Math.abs(lowDelta), Math.abs(bracket.highDelta));

  for (let index = 0; index < ROOT_MAX_BISECTION_EVALUATIONS; index += 1) {
    const midpoint = (low + high) / 2;
    const midpointDelta = evaluatePmvDeltaAtTemperature(
      adapter,
      targetPmv,
      rh,
      payload,
      midpoint,
    );
    if (midpointDelta === null) break;

    const absoluteDelta = Math.abs(midpointDelta);
    if (absoluteDelta < closestDelta) {
      closestTemperature = midpoint;
      closestDelta = absoluteDelta;
    }
    if (absoluteDelta <= ROOT_TOLERANCE) return midpoint;

    if (lowDelta * midpointDelta <= 0) {
      high = midpoint;
    } else {
      low = midpoint;
      lowDelta = midpointDelta;
    }
  }

  return closestDelta <= ROOT_TOLERANCE ? closestTemperature : null;
}

export function calculateComfortZone(
  adapter: PmvStandardAdapter,
  payload: ComfortZoneRequest,
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
  const coolEdge: ComfortPoint[] = [];
  const warmEdge: ComfortPoint[] = [];

  for (const relativeHumidity of rhValues) {
    const coolTemperature = solveDryBulbForTargetPmv(
      adapter,
      pmvNeutralZone.min,
      relativeHumidity,
      payload,
    );
    const warmTemperature = solveDryBulbForTargetPmv(
      adapter,
      pmvNeutralZone.max,
      relativeHumidity,
      payload,
    );
    if (coolTemperature === null || warmTemperature === null) continue;
    coolEdge.push({ tdb: coolTemperature, rh: relativeHumidity });
    warmEdge.push({ tdb: warmTemperature, rh: relativeHumidity });
  }

  return {
    coolEdge,
    warmEdge,
    source: CalculationSource.FrontendGenerated,
  };
}

export const pmvRequestAdapter = createFieldRequestAdapter<PmvRequest>({
  tdb: PhysicalQuantityId.DryBulbTemperature,
  tr: PhysicalQuantityId.MeanRadiantTemperature,
  vr: PhysicalQuantityId.RelativeAirSpeed,
  rh: PhysicalQuantityId.RelativeHumidity,
  met: PhysicalQuantityId.MetabolicRate,
  clo: PhysicalQuantityId.ClothingInsulation,
  wme: PhysicalQuantityId.ExternalWork,
});

export function createPmvRequestAxisAdapter(adapter: PmvStandardAdapter) {
  return createRequestAxisAdapter({
    fieldAdapter: pmvRequestAdapter,
    aliases: {
      [PhysicalQuantityId.WindSpeed]: PhysicalQuantityId.RelativeAirSpeed,
    },
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
      range: {
        min: getPhysicalQuantityMeta(PhysicalQuantityId.OperativeTemperature)
          .minSi,
        max: getPhysicalQuantityMeta(PhysicalQuantityId.OperativeTemperature)
          .maxSi,
      },
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

const DYNAMIC_CLOTHING_DECIMALS = 2;
const COOLING_EFFECT_DECIMALS = 2;

function requireFiniteOutput(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} evaluation returned a non-finite result.`);
  }
  return value;
}

function formatQuantityCell(
  quantityId: ChartAxisQuantityId,
  valueSi: number,
  unitSystem: UnitSystemType,
  decimals?: number,
): ResultCellViewModel {
  const meta = getQuantityPresentationMeta(quantityId, unitSystem);
  const value = convertFieldValueFromSi(quantityId, valueSi, unitSystem);
  return {
    text: `${formatDisplayValue(value, decimals ?? meta.decimals)} ${meta.displayUnits}`,
    color: "",
  };
}

function formatCoolingEffectCell(
  valueSi: number,
  unitSystem: UnitSystemType,
): ResultCellViewModel {
  const units = getQuantityPresentationMeta(
    PhysicalQuantityId.DryBulbTemperature,
    unitSystem,
  ).displayUnits;
  const value =
    unitSystem === UnitSystem.IP
      ? convertTemperatureDeltaFromSi(valueSi)
      : valueSi;
  return {
    text: `${formatDisplayValue(value, COOLING_EFFECT_DECIMALS)} ${units}`,
    color: "",
  };
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

export function buildPmvResultRows(): TableRowSpec<PmvResponse>[] {
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
    {
      id: "pmv",
      label: "PMV",
      format: (result) => ({ text: result.pmv.toFixed(2), color: "" }),
    },
    {
      id: "zone",
      label: "Zone",
      format: (result) => {
        const zone = getPmvZoneMeta(result.pmv);
        return { text: zone.label, color: zone.textColor };
      },
    },
    {
      id: "ppd",
      label: "PPD",
      format: (result) => ({ text: `${result.ppd.toFixed(1)}%`, color: "" }),
    },
    {
      id: "acceptability",
      label: "Acceptability",
      format: (result) => ({
        text: `${(100 - result.ppd).toFixed(1)}%`,
        color: "",
      }),
    },
    {
      id: "set",
      label: "SET",
      format: (result, unitSystem) =>
        formatQuantityCell(
          PhysicalQuantityId.DryBulbTemperature,
          result.set,
          unitSystem,
        ),
    },
    {
      id: "cooling-effect",
      label: "Cooling effect",
      format: (result, unitSystem) =>
        formatCoolingEffectCell(result.coolingEffect, unitSystem),
    },
    {
      id: "relative-air-speed",
      label: "Relative air speed",
      format: (result, unitSystem) =>
        formatQuantityCell(
          PhysicalQuantityId.RelativeAirSpeed,
          result.vr,
          unitSystem,
        ),
    },
    {
      id: "dynamic-clothing",
      label: "Dynamic clothing",
      format: (result) =>
        formatQuantityCell(
          PhysicalQuantityId.ClothingInsulation,
          result.dynamicClothing,
          UnitSystem.SI,
          DYNAMIC_CLOTHING_DECIMALS,
        ),
    },
  ];
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
    }),
    afterCalculate: ({ inputId, chartRequest, chartSource }) => {
      chartSource.comfortZonesByInput[inputId] = calculateComfortZone(
        adapter,
        chartRequest,
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
