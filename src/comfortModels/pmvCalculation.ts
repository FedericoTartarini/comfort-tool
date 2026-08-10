import { CalculationSource, type ComfortStandard } from "../models/calculationMetadata";
import type {
  CompareInputMap,
  ModelChartSourceDto,
} from "../models/comfortDtos";
import { ComplianceStatus } from "../models/comfortModels";
import { FieldKey } from "../models/fieldKeys";
import { fieldMetaByKey } from "../models/inputFieldsMeta";
import {
  AirSpeedControlMode,
  OptionKey,
} from "../models/inputModes";
import type { InputId as InputIdType } from "../models/inputSlots";
import type { ModelCalculationContext } from "../models/modelCalculation";
import type { ComplianceFeedback } from "../models/modelCapabilities";
import { ThermalZone } from "../models/thermalZone";
import { createRequestAxisAdapter } from "../services/comfort/charts/dynamicAxisPayload";
import { requireThermalZone } from "../services/comfort/helpers";
import { createFieldRequestAdapter } from "../services/comfort/requestMapping";
import {
  buildResultSectionsFromRows,
  createEmptyResults,
  type ResultRowDefinition,
} from "../state/comfortTool/modelConfigs/builder";
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
const COLOR_COMPLIANT_GREEN = "#047857";
const COLOR_NON_COMPLIANT_RED = "#dc2626";

export const pmvNeutralZone = new ThermalZone({
  label: "Neutral",
  min: -0.5,
  max: 0.5,
  color: "#f2f2f2",
  textColor: "#475569",
});

export const pmvZonesList = [
  new ThermalZone({ label: "Cold", max: -2.5, color: "#0571b0", textColor: "#1d4ed8" }),
  new ThermalZone({ label: "Cool", min: -2.5, max: -1.5, color: "#4c78a8", textColor: "#2563eb" }),
  new ThermalZone({ label: "Slightly Cool", min: -1.5, max: -0.5, color: "#92c5de", textColor: "#0369a1" }),
  pmvNeutralZone,
  new ThermalZone({ label: "Slightly Warm", min: 0.5, max: 1.5, color: "#f4a582", textColor: "#ea580c" }),
  new ThermalZone({ label: "Warm", min: 1.5, max: 2.5, color: "#e15759", textColor: "#b91c1c" }),
  new ThermalZone({ label: "Hot", min: 2.5, color: "#cc79a7", textColor: "#701a75" }),
];

export interface ComfortPointDto {
  tdb: number;
  rh: number;
}

export interface PmvRequestDto {
  tdb: number;
  tr: number;
  vr: number;
  rh: number;
  met: number;
  clo: number;
  wme: number;
  occupantHasAirSpeedControl: boolean;
}

export interface ComfortZoneRequestDto extends PmvRequestDto {
  rhMin: number;
  rhMax: number;
  rhPoints: number;
}

export interface ComfortZoneResponseDto {
  coolEdge: ComfortPointDto[];
  warmEdge: ComfortPointDto[];
  source: CalculationSource;
}

export interface PmvResponseDto {
  pmv: number;
  ppd: number;
  vr: number;
  isCompliant: boolean;
  standard: ComfortStandard;
  source: CalculationSource;
}

export interface PmvChartSourceDto extends ModelChartSourceDto<ComfortZoneRequestDto> {
  comfortZonesByInput: CompareInputMap<ComfortZoneResponseDto>;
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
  payload: PmvRequestDto,
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
  payload: PmvRequestDto,
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
  payload: PmvRequestDto,
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
  return lowDelta * highDelta <= 0
    ? { low, high, lowDelta, highDelta }
    : null;
}

function findTemperatureBracket(
  adapter: PmvStandardAdapter,
  targetPmv: number,
  rh: number,
  payload: PmvRequestDto,
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
  payload: PmvRequestDto,
): number | null {
  const bracket = findTemperatureBracket(adapter, targetPmv, rh, payload);
  if (!bracket) return null;
  if ("exactTemperature" in bracket) return bracket.exactTemperature;

  let { low, high, lowDelta } = bracket;
  let closestTemperature = Math.abs(lowDelta) <= Math.abs(bracket.highDelta)
    ? low
    : high;
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
  payload: ComfortZoneRequestDto,
): ComfortZoneResponseDto {
  const rhMinimum = Math.min(payload.rhMin, payload.rhMax);
  const rhMaximum = Math.max(payload.rhMin, payload.rhMax);
  const rhValues = payload.rhPoints === 1
    ? [rhMinimum]
    : Array.from({ length: payload.rhPoints }, (_, index) =>
        rhMinimum
        + ((rhMaximum - rhMinimum) * index) / (payload.rhPoints - 1));
  const coolEdge: ComfortPointDto[] = [];
  const warmEdge: ComfortPointDto[] = [];

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

export const pmvRequestAdapter = createFieldRequestAdapter<PmvRequestDto>({
  tdb: FieldKey.DryBulbTemperature,
  tr: FieldKey.MeanRadiantTemperature,
  vr: FieldKey.RelativeAirSpeed,
  rh: FieldKey.RelativeHumidity,
  met: FieldKey.MetabolicRate,
  clo: FieldKey.ClothingInsulation,
  wme: FieldKey.ExternalWork,
});

export function createPmvRequestAxisAdapter(adapter: PmvStandardAdapter) {
  return createRequestAxisAdapter({
    fieldAdapter: pmvRequestAdapter,
    aliases: {
      [FieldKey.WindSpeed]: FieldKey.RelativeAirSpeed,
    },
    axisRanges: {
      [FieldKey.ClothingInsulation]: {
        min: fieldMetaByKey[FieldKey.ClothingInsulation].minValue,
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
        min: fieldMetaByKey[FieldKey.OperativeTemperature].minValue,
        max: fieldMetaByKey[FieldKey.OperativeTemperature].maxValue,
      },
    },
  });
}

export function toPmvRequest(
  context: ModelCalculationContext,
  inputId: InputIdType,
  adapter: PmvStandardAdapter,
): PmvRequestDto {
  const requestFields = pmvRequestAdapter.mapRequest(context, inputId);
  return {
    ...requestFields,
    occupantHasAirSpeedControl:
      adapter.supportsOccupantAirSpeedControl
      && context.options[OptionKey.AirSpeedControlMode]
        === AirSpeedControlMode.WithLocalControl,
  };
}

export function getPmvComplianceFeedback(
  result: PmvResponseDto,
): ComplianceFeedback {
  return {
    text: result.isCompliant
      ? ComplianceStatus.Compliant
      : ComplianceStatus.OutOfRange,
    passes: result.isCompliant,
  };
}

export function buildPmvResultSections(
  results: Record<InputIdType, PmvResponseDto | null>,
  visibleInputIds: InputIdType[],
) {
  const rows: ResultRowDefinition<PmvResponseDto>[] = [
    {
      title: "Compliance",
      formatter: (result) => {
        const feedback = getPmvComplianceFeedback(result);
        return {
          text: feedback.text,
          color: feedback.passes
          ? COLOR_COMPLIANT_GREEN
          : COLOR_NON_COMPLIANT_RED,
        };
      },
    },
    {
      title: "PMV",
      formatter: (result) => ({ text: result.pmv.toFixed(2), color: "" }),
    },
    {
      title: "Zone",
      formatter: (result) => {
        const zone = getPmvZoneMeta(result.pmv);
        return { text: zone.label, color: zone.textColor };
      },
    },
    {
      title: "PPD",
      formatter: (result) => ({ text: `${result.ppd.toFixed(1)}%`, color: "" }),
    },
    {
      title: "Acceptability",
      formatter: (result) => ({
        text: `${(100 - result.ppd).toFixed(1)}%`,
        color: "",
      }),
    },
  ];
  return buildResultSectionsFromRows(rows, results, visibleInputIds);
}


export function calculatePmvModel(
  context: ModelCalculationContext,
  visibleInputIds: InputIdType[],
  adapter: PmvStandardAdapter,
) {
  const resultsByInput = createEmptyResults<PmvResponseDto>();
  const inputs: CompareInputMap<ComfortZoneRequestDto> = {};
  const comfortZonesByInput: CompareInputMap<ComfortZoneResponseDto> = {};

  for (const inputId of visibleInputIds) {
    const request = toPmvRequest(context, inputId, adapter);
    const comfortZoneRequest: ComfortZoneRequestDto = {
      ...request,
      rhMin: 0,
      rhMax: 100,
      rhPoints: 31,
    };
    const result = evaluatePmvCondition(adapter, request);
    const complianceWarnings = adapter.checkApplicability(request);
    inputs[inputId] = comfortZoneRequest;
    comfortZonesByInput[inputId] = calculateComfortZone(
      adapter,
      comfortZoneRequest,
    );
    resultsByInput[inputId] = {
      pmv: result.pmv,
      ppd: result.ppd,
      vr: request.vr,
      isCompliant: complianceWarnings.length === 0
        && result.zone === pmvNeutralZone,
      standard: adapter.resultStandard,
      source: CalculationSource.JsThermalComfort,
    };
  }

  return {
    resultsByInput,
    chartSource: { inputs, comfortZonesByInput },
  };
}
