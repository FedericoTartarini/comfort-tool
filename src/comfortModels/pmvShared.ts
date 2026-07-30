import { p_sat, psy_ta_rh } from "jsthermalcomfort";
import { CalculationSource, type ComfortStandard } from "../models/calculationMetadata";
import { ChartId } from "../models/chartOptions";
import type {
  ComfortPointDto,
  CompareInputMap,
  PlotlyChartResponseDto,
  PlotTraceDto,
} from "../models/comfortDtos";
import {
  ComfortModel,
  ComplianceStatus,
} from "../models/comfortModels";
import { FieldKey } from "../models/fieldKeys";
import { fieldMetaByKey } from "../models/inputFieldsMeta";
import { InputControlId } from "../models/inputControls";
import {
  AirSpeedControlMode,
  AirSpeedInputMode,
  defaultPmvOptions,
  HumidityInputMode,
  OptionKey,
  TemperatureMode,
  type ModelOptionsRecord,
  type PmvModelOptions,
} from "../models/inputModes";
import type { InputId as InputIdType } from "../models/inputSlots";
import type { ModelCalculationContext } from "../models/modelCalculation";
import {
  bandsFromThermalZones,
  ChartMode,
  findNumericBandIndexForValue,
  ModelOutputKey,
  type Band,
  type ChartBuildContext,
  type ChartMode as ChartModeType,
  type ComplianceSpec,
  type ExploreFieldChartConfig,
  type ModelOutput,
  type NumericBand,
} from "../models/modelCapabilities";
import { ThermalZone } from "../models/thermalZone";
import type { UnitSystem as UnitSystemType } from "../models/units";
import { createFieldAxisScale } from "../services/comfort/charts/axis";
import { buildClosedBoundaryPolygon } from "../services/comfort/charts/boundaryRegionEngine";
import {
  buildGridFieldChart,
  createBandedGridStrategy,
  GridBandRenderStrategy,
  type FieldChartInputGroup,
  type GridFieldChartStrategy,
} from "../services/comfort/charts/chartEngine";
import {
  applyDynamicAxisCoordinates,
  type DynamicAxisPayloadAdapter,
} from "../services/comfort/charts/dynamicAxisPayload";
import {
  getBaselineInputEntry,
  shouldShowInputLegend,
} from "../services/comfort/charts/inputPoints";
import {
  buildComfortPolygonTrace,
  buildLineTrace,
} from "../services/comfort/charts/plotlyBuilders";
import type { ChartAxisScale, GridPointEvaluation } from "../services/comfort/charts/types";
import {
  buildZoneColorscale,
  buildZoneContourLayers,
} from "../services/comfort/charts/zoneGrid";
import {
  createAirSpeedControlBehavior,
  createControlBehavior,
  createHumidityControlBehavior,
  createTemperatureControlBehavior,
} from "../services/comfort/controls/controlBehaviors";
import { createSingleInputPatch } from "../services/comfort/controls/types";
import { roundValue } from "../services/comfort/helpers";
import {
  clothingTypicalEnsembles,
  metabolicActivityOptions,
} from "../services/comfort/referenceValues";
import {
  normalizePmvOptions,
  synchronizePmvInputState,
} from "../services/comfort/syncState";
import {
  convertFieldValueFromSi,
  convertHumidityRatioFromSi,
  convertHumidityRatioToSi,
  formatDisplayValue,
  getHumidityRatioDisplayMeta,
} from "../services/units";
import {
  buildResultSectionsFromRows,
  ComfortModelBuilder,
  createEmptyResults,
  isRecord,
  type ResultRowDefinition,
} from "../state/comfortTool/modelConfigs/builder";

const PSYCHROMETRIC_VIEW = {
  tdbRangeSi: { min: 10, max: 40 },
  tdbPoints: 121,
  humidityRatioRangeSi: { min: 0, max: 0.03 },
  rhCurves: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
} as const;
const ROOT_SCAN_POINTS = 101;
const ROOT_MAX_BISECTION_EVALUATIONS = 30;
const ROOT_TOLERANCE = 5e-4;
const STANDARD_ATM_PRESSURE_PA = 101325;
const WATER_VAPOR_MOLECULAR_WEIGHT_RATIO = 0.62198;
const CONTOUR_GRID_RESOLUTION = 50;
const PMV_DYNAMIC_AXIS_FIELDS = [
  FieldKey.DryBulbTemperature,
  FieldKey.MeanRadiantTemperature,
  FieldKey.OperativeTemperature,
  FieldKey.RelativeAirSpeed,
  FieldKey.RelativeHumidity,
  FieldKey.MetabolicRate,
  FieldKey.ClothingInsulation,
] as const;
const CHART_COLOR_WHITE = "#ffffff";
const CHART_COLOR_PLOT_BG = "#f8fafc";
const CHART_COLOR_GRIDLINE = "#e2e8f0";
const CHART_COLOR_BOUNDARY_LINE = "#333333";
const CHART_COLOR_RH_LINE = "#94a3b8";
const COLOR_COMPLIANT_GREEN = "#047857";
const COLOR_NON_COMPLIANT_RED = "#dc2626";

export const pmvZonesList = [
  new ThermalZone({ label: "Cold", max: -2.5, color: "#0571b0", textColor: "#1d4ed8" }),
  new ThermalZone({ label: "Cool", min: -2.5, max: -1.5, color: "#4c78a8", textColor: "#2563eb" }),
  new ThermalZone({ label: "Slightly Cool", min: -1.5, max: -0.5, color: "#92c5de", textColor: "#0369a1" }),
  new ThermalZone({ label: "Neutral", min: -0.5, max: 0.5, color: "#f2f2f2", textColor: "#475569" }),
  new ThermalZone({ label: "Slightly Warm", min: 0.5, max: 1.5, color: "#f4a582", textColor: "#ea580c" }),
  new ThermalZone({ label: "Warm", min: 1.5, max: 2.5, color: "#e15759", textColor: "#b91c1c" }),
  new ThermalZone({ label: "Hot", min: 2.5, color: "#cc79a7", textColor: "#701a75" }),
];

const PMV_NEUTRAL_ZONE = pmvZonesList[3];
const PMV_COLORSCALE = buildZoneColorscale(pmvZonesList);
const PMV_CONTOURS = {
  start: -2.5,
  end: 2.5,
  size: 1,
  type: "levels",
  coloring: "fill",
  showlines: true,
  smoothing: 1,
  line: { width: 1, color: CHART_COLOR_BOUNDARY_LINE },
};

export type PmvModelId = typeof ComfortModel.PmvAshrae | typeof ComfortModel.PmvIso;

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

export interface PmvChartSourceDto {
  inputs: CompareInputMap<ComfortZoneRequestDto>;
  comfortZonesByInput: CompareInputMap<ComfortZoneResponseDto>;
}

export interface PmvStandardAdapter {
  readonly modelId: PmvModelId;
  readonly resultStandard: ComfortStandard;
  readonly clothingInsulationMaxSi: number;
  readonly supportsOccupantAirSpeedControl: boolean;
  readonly calculate: (request: PmvRequestDto) => { pmv: number; ppd: number };
  readonly checkApplicability: (request: PmvRequestDto) => readonly string[];
  readonly getOperativeTemperature: (request: PmvRequestDto) => number;
}

export interface PmvModelDeclaration {
  readonly label: string;
  readonly description: string;
  readonly adapter: PmvStandardAdapter;
  readonly modes: readonly ChartModeType[];
  readonly chartableOutputs: readonly ModelOutput[];
  readonly complianceSpec: ComplianceSpec;
}

interface PmvChartEvaluation {
  pmv: number;
  ppd: number;
  zoneLabel: string;
}

type TemperatureBracket =
  | { exactTemperature: number }
  | { low: number; high: number; lowDelta: number; highDelta: number };

const ppdExploreBands: readonly NumericBand[] = [
  {
    min: -Infinity,
    max: 10,
    label: "Acceptable dissatisfaction (< 10%)",
    color: "#86efac",
  },
  {
    min: 10,
    max: Infinity,
    label: "Elevated dissatisfaction (≥ 10%)",
    color: "#fca5a5",
  },
];

export const pmvChartableOutputs: readonly ModelOutput[] = [
  {
    key: ModelOutputKey.Pmv,
    label: "PMV",
    legendTitle: "PMV Zones",
    defaultBands: bandsFromThermalZones(pmvZonesList),
  },
  {
    key: ModelOutputKey.Ppd,
    label: "PPD (%)",
    legendTitle: "PPD Bands",
    unit: "%",
    defaultBands: ppdExploreBands,
  },
];

export function createPmvComplianceBands(): readonly Band[] {
  return [
    {
      min: -Infinity,
      max: PMV_NEUTRAL_ZONE.min,
      label: "Outside acceptable PMV range",
      color: "#fecaca",
    },
    {
      min: PMV_NEUTRAL_ZONE.min,
      max: PMV_NEUTRAL_ZONE.max,
      label: "Acceptable PMV range",
      color: "#86efac",
    },
    {
      min: PMV_NEUTRAL_ZONE.max,
      max: Infinity,
      label: "Outside acceptable PMV range",
      color: "#fecaca",
    },
  ];
}

export function getPmvZoneMeta(pmv: number): ThermalZone {
  if (!Number.isFinite(pmv)) return PMV_NEUTRAL_ZONE;
  return pmvZonesList.find((zone) => zone.contains(pmv)) ?? PMV_NEUTRAL_ZONE;
}

function evaluatePmvCondition(
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
    zoneLabel: getPmvZoneMeta(result.pmv).label,
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
  const { min, max } = PSYCHROMETRIC_VIEW.tdbRangeSi;

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

export function solveDryBulbForTargetPmv(
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
      PMV_NEUTRAL_ZONE.min,
      relativeHumidity,
      payload,
    );
    const warmTemperature = solveDryBulbForTargetPmv(
      adapter,
      PMV_NEUTRAL_ZONE.max,
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

const clothingPresetOptions = clothingTypicalEnsembles.map((ensemble) => ({
  id: ensemble.id,
  label: ensemble.label,
  value: ensemble.clo,
}));
const metabolicPresetOptions = metabolicActivityOptions.map((activity) => ({
  id: activity.id,
  label: activity.label,
  value: activity.met,
}));
const temperatureModeValues = new Set<string>(Object.values(TemperatureMode));
const airSpeedControlModeValues = new Set<string>(Object.values(AirSpeedControlMode));
const airSpeedInputModeValues = new Set<string>(Object.values(AirSpeedInputMode));
const humidityInputModeValues = new Set<string>(Object.values(HumidityInputMode));

function normalizePmvOptionsSnapshot(value: unknown): PmvModelOptions | null {
  if (!isRecord(value)) return { ...defaultPmvOptions };

  const temperatureMode = value[OptionKey.TemperatureMode];
  const airSpeedControlMode = value[OptionKey.AirSpeedControlMode];
  const airSpeedInputMode = value[OptionKey.AirSpeedInputMode];
  const humidityInputMode = value[OptionKey.HumidityInputMode];
  if (temperatureMode !== undefined && !temperatureModeValues.has(String(temperatureMode))) {
    return null;
  }
  if (airSpeedControlMode !== undefined && !airSpeedControlModeValues.has(String(airSpeedControlMode))) {
    return null;
  }
  if (airSpeedInputMode !== undefined && !airSpeedInputModeValues.has(String(airSpeedInputMode))) {
    return null;
  }
  if (humidityInputMode !== undefined && !humidityInputModeValues.has(String(humidityInputMode))) {
    return null;
  }

  return {
    ...defaultPmvOptions,
    ...(temperatureMode === undefined
      ? {}
      : { [OptionKey.TemperatureMode]: temperatureMode as TemperatureMode }),
    ...(airSpeedControlMode === undefined
      ? {}
      : { [OptionKey.AirSpeedControlMode]: airSpeedControlMode as AirSpeedControlMode }),
    ...(airSpeedInputMode === undefined
      ? {}
      : { [OptionKey.AirSpeedInputMode]: airSpeedInputMode as AirSpeedInputMode }),
    ...(humidityInputMode === undefined
      ? {}
      : { [OptionKey.HumidityInputMode]: humidityInputMode as HumidityInputMode }),
  };
}

function toPmvRequest(
  context: ModelCalculationContext,
  inputId: InputIdType,
  adapter: PmvStandardAdapter,
): PmvRequestDto {
  const inputs = context.inputsByInput[inputId];
  const options = normalizePmvOptionsSnapshot(
    context.modelOptionsByModel[adapter.modelId],
  ) ?? defaultPmvOptions;
  const tdb = Number(inputs[FieldKey.DryBulbTemperature]);

  return {
    tdb,
    tr: options[OptionKey.TemperatureMode] === TemperatureMode.Operative
      ? tdb
      : Number(inputs[FieldKey.MeanRadiantTemperature]),
    vr: Number(inputs[FieldKey.RelativeAirSpeed]),
    rh: Number(inputs[FieldKey.RelativeHumidity]),
    met: Number(inputs[FieldKey.MetabolicRate]),
    clo: Number(inputs[FieldKey.ClothingInsulation]),
    wme: Number(inputs[FieldKey.ExternalWork]),
    occupantHasAirSpeedControl:
      adapter.supportsOccupantAirSpeedControl
      && options[OptionKey.AirSpeedControlMode]
        === AirSpeedControlMode.WithLocalControl,
  };
}

function toComfortZoneRequest(
  context: ModelCalculationContext,
  inputId: InputIdType,
  adapter: PmvStandardAdapter,
): ComfortZoneRequestDto {
  return {
    ...toPmvRequest(context, inputId, adapter),
    rhMin: 0,
    rhMax: 100,
    rhPoints: 31,
  };
}

function buildPmvResultSections(
  results: Record<InputIdType, PmvResponseDto | null>,
  visibleInputIds: InputIdType[],
  unitSystem: UnitSystemType,
  options: ModelOptionsRecord,
) {
  const normalizedOptions = normalizePmvOptions(options);
  const measuredAirSpeedRows: ResultRowDefinition<PmvResponseDto>[] =
    normalizedOptions[OptionKey.AirSpeedInputMode] === AirSpeedInputMode.Measured
      ? [{
          title: fieldMetaByKey[FieldKey.RelativeAirSpeed].label,
          formatter: (result) => {
            const meta = fieldMetaByKey[FieldKey.RelativeAirSpeed];
            const value = convertFieldValueFromSi(
              FieldKey.RelativeAirSpeed,
              result.vr,
              unitSystem,
            );
            return {
              text: `${formatDisplayValue(value, meta.decimals)} ${meta.displayUnits[unitSystem]}`,
              color: "",
            };
          },
        }]
      : [];
  const rows: ResultRowDefinition<PmvResponseDto>[] = [
    {
      title: "Compliance",
      formatter: (result) => ({
        text: result.isCompliant
          ? ComplianceStatus.Compliant
          : ComplianceStatus.OutOfRange,
        color: result.isCompliant
          ? COLOR_COMPLIANT_GREEN
          : COLOR_NON_COMPLIANT_RED,
      }),
    },
    ...measuredAirSpeedRows,
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

interface PmvHoverAxis {
  label: string;
  units: string;
  decimals: number;
}

interface PmvHoverSpec {
  xAxis: PmvHoverAxis;
  yAxis: PmvHoverAxis;
  classification: { label: string; value: string | null };
  pmv: string | null;
  ppd: string | null;
  inputLabel: string | null;
}

function buildPmvHoverTemplate({
  xAxis,
  yAxis,
  classification,
  pmv,
  ppd,
  inputLabel,
}: PmvHoverSpec): string {
  return [
    inputLabel,
    `${xAxis.label}: %{x:.${xAxis.decimals}f} ${xAxis.units}`,
    `${yAxis.label}: %{y:.${yAxis.decimals}f} ${yAxis.units}`,
    classification.value === null
      ? null
      : `<b>${classification.label}: ${classification.value}</b>`,
    pmv === null ? null : `PMV: ${pmv}`,
    ppd === null ? null : `PPD: ${ppd}`,
  ].filter((part): part is string => part !== null).join("<br>")
    + "<extra></extra>";
}

function axisHoverSpec(axis: ChartAxisScale, decimals = axis.decimals ?? 2): PmvHoverAxis {
  return { label: axis.label, units: axis.units, decimals };
}

function getPmvOutputValue(
  outputKey: ModelOutputKey,
  evaluation: PmvChartEvaluation,
): number {
  if (outputKey === ModelOutputKey.Pmv) return evaluation.pmv;
  if (outputKey === ModelOutputKey.Ppd) return evaluation.ppd;
  throw new Error(`Unsupported PMV chart output: ${outputKey}`);
}

function smoothComfortZoneXValues(xValues: number[]): number[] {
  if (xValues.length < 3) return xValues;
  return xValues.map((value, index) =>
    index === 0 || index === xValues.length - 1
      ? value
      : Math.round(
          ((xValues[index - 1] + (value * 2) + xValues[index + 1]) / 4)
            * 1000,
        ) / 1000);
}

export function buildComfortZonePolygon(
  coolEdge: ComfortPointDto[],
  warmEdge: ComfortPointDto[],
  getX: (point: ComfortPointDto) => number,
  getY: (point: ComfortPointDto) => number,
): { polygonX: number[]; polygonY: number[] } {
  return buildClosedBoundaryPolygon({
    lowerX: smoothComfortZoneXValues(coolEdge.map(getX)),
    lowerY: coolEdge.map(getY),
    upperX: smoothComfortZoneXValues(warmEdge.map(getX)),
    upperY: warmEdge.map(getY),
  });
}

function getPmvAxisRangeSi(
  adapter: PmvStandardAdapter,
  field: FieldKey,
): { min: number; max: number } | undefined {
  return field === FieldKey.ClothingInsulation
    ? {
        min: fieldMetaByKey[field].minValue,
        max: adapter.clothingInsulationMaxSi,
      }
    : undefined;
}

function setPmvAxisValue(
  payload: PmvRequestDto,
  field: FieldKey,
  valueSi: number,
): void {
  switch (field) {
    case FieldKey.DryBulbTemperature:
      payload.tdb = valueSi;
      return;
    case FieldKey.MeanRadiantTemperature:
      payload.tr = valueSi;
      return;
    case FieldKey.OperativeTemperature:
      payload.tdb = valueSi;
      payload.tr = valueSi;
      return;
    case FieldKey.WindSpeed:
    case FieldKey.RelativeAirSpeed:
      payload.vr = valueSi;
      return;
    case FieldKey.RelativeHumidity:
      payload.rh = valueSi;
      return;
    case FieldKey.MetabolicRate:
      payload.met = valueSi;
      return;
    case FieldKey.ClothingInsulation:
      payload.clo = valueSi;
      return;
    case FieldKey.ExternalWork:
      payload.wme = valueSi;
      return;
    default:
      throw new Error(`Unsupported PMV chart field: ${field}`);
  }
}

function getPmvAxisValue(
  adapter: PmvStandardAdapter,
  payload: PmvRequestDto,
  field: FieldKey,
): number {
  switch (field) {
    case FieldKey.DryBulbTemperature:
      return payload.tdb;
    case FieldKey.MeanRadiantTemperature:
      return payload.tr;
    case FieldKey.WindSpeed:
    case FieldKey.RelativeAirSpeed:
      return payload.vr;
    case FieldKey.RelativeHumidity:
      return payload.rh;
    case FieldKey.MetabolicRate:
      return payload.met;
    case FieldKey.ClothingInsulation:
      return payload.clo;
    case FieldKey.ExternalWork:
      return payload.wme;
    case FieldKey.OperativeTemperature:
      return adapter.getOperativeTemperature(payload);
    default:
      throw new Error(`Unsupported PMV chart field: ${field}`);
  }
}

function resolvePmvEvaluation(
  adapter: PmvStandardAdapter,
  inputId: InputIdType,
  payload: PmvRequestDto,
  resultsByInput: Partial<Record<InputIdType, PmvResponseDto | null>>,
): PmvChartEvaluation | null {
  const result = resultsByInput[inputId];
  return result
    ? {
        pmv: result.pmv,
        ppd: result.ppd,
        zoneLabel: getPmvZoneMeta(result.pmv).label,
      }
    : tryEvaluatePmvForChart(adapter, payload);
}

interface PmvInputGroupOptions {
  adapter: PmvStandardAdapter;
  inputsMap: CompareInputMap<ComfortZoneRequestDto>;
  resultsByInput: Partial<Record<InputIdType, PmvResponseDto | null>>;
  xAxis: ChartAxisScale;
  yAxis: ChartAxisScale;
  getXSi: (payload: ComfortZoneRequestDto) => number;
  getYSi: (payload: ComfortZoneRequestDto) => number;
  coordinateDecimals: number;
  classificationLabel?: string;
  getClassification?: (evaluation: PmvChartEvaluation) => string;
  buildOverlayTraces?: FieldChartInputGroup<
    ComfortZoneRequestDto,
    PmvResponseDto
  >["buildOverlayTraces"];
}

function createPmvInputGroup({
  adapter,
  inputsMap,
  resultsByInput,
  xAxis,
  yAxis,
  getXSi,
  getYSi,
  coordinateDecimals,
  classificationLabel = "Zone",
  getClassification = (evaluation) => evaluation.zoneLabel,
  buildOverlayTraces,
}: PmvInputGroupOptions): FieldChartInputGroup<
  ComfortZoneRequestDto,
  PmvResponseDto
> {
  return {
    inputsMap,
    resultsByInput,
    getXSi,
    getYSi,
    formatXDisplay: roundValue,
    formatYDisplay: roundValue,
    buildOverlayTraces,
    getHovertemplate: ({ inputId, inputLabel, payload }) => {
      const evaluation = resolvePmvEvaluation(
        adapter,
        inputId,
        payload,
        resultsByInput,
      );
      return buildPmvHoverTemplate({
        inputLabel,
        xAxis: axisHoverSpec(xAxis, 1),
        yAxis: axisHoverSpec(yAxis, coordinateDecimals),
        classification: {
          label: classificationLabel,
          value: evaluation ? getClassification(evaluation) : null,
        },
        pmv: evaluation ? evaluation.pmv.toFixed(2) : null,
        ppd: evaluation ? `${evaluation.ppd.toFixed(1)}%` : null,
      });
    },
  };
}

function getPsychrometricGridPoint(
  adapter: PmvStandardAdapter,
  baseline: PmvRequestDto,
  tdb: number,
  humidityRatio: number,
): GridPointEvaluation | null {
  const vaporPressure = (
    humidityRatio * STANDARD_ATM_PRESSURE_PA
  ) / (WATER_VAPOR_MOLECULAR_WEIGHT_RATIO + humidityRatio);
  const saturationPressure = p_sat(tdb);
  if (vaporPressure > saturationPressure) return null;

  const rh = Math.min(100, Math.max(0, (vaporPressure / saturationPressure) * 100));
  const evaluation = tryEvaluatePmvForChart(adapter, { ...baseline, tdb, rh });
  return evaluation
    ? {
        z: evaluation.pmv,
        text: evaluation.zoneLabel,
        hoverMetadata: [evaluation.ppd],
      }
    : null;
}

function buildRelativeHumidityCurves(
  adapter: PmvStandardAdapter,
  baseline: PmvRequestDto,
  unitSystem: UnitSystemType,
  temperatureAxis: ChartAxisScale,
  humidityRatioAxis: ChartAxisScale,
): PlotTraceDto[] {
  const temperatures = Array.from(
    { length: PSYCHROMETRIC_VIEW.tdbPoints },
    (_, index) => PSYCHROMETRIC_VIEW.tdbRangeSi.min
      + (
        (PSYCHROMETRIC_VIEW.tdbRangeSi.max - PSYCHROMETRIC_VIEW.tdbRangeSi.min)
        * index
      ) / (PSYCHROMETRIC_VIEW.tdbPoints - 1),
  );

  return PSYCHROMETRIC_VIEW.rhCurves.flatMap((relativeHumidity) => {
    const x: number[] = [];
    const y: number[] = [];
    const hoverMetadata: unknown[][] = [];
    const text: string[] = [];
    for (const temperature of temperatures) {
      const humidityRatioSi = psy_ta_rh(temperature, relativeHumidity).hr;
      if (
        humidityRatioSi < PSYCHROMETRIC_VIEW.humidityRatioRangeSi.min
        || humidityRatioSi > PSYCHROMETRIC_VIEW.humidityRatioRangeSi.max
      ) {
        continue;
      }
      x.push(roundValue(temperatureAxis.toDisplay(temperature)));
      y.push(roundValue(humidityRatioAxis.toDisplay(humidityRatioSi)));
      const evaluation = tryEvaluatePmvForChart(adapter, {
        ...baseline,
        tdb: temperature,
        rh: relativeHumidity,
      });
      hoverMetadata.push(
        evaluation ? [evaluation.ppd, evaluation.pmv.toFixed(2)] : [NaN, "NaN"],
      );
      text.push(evaluation?.zoneLabel ?? "");
    }
    if (x.length === 0) return [];
    return [buildLineTrace({
      name: `RH ${relativeHumidity}%`,
      x,
      y,
      color: CHART_COLOR_RH_LINE,
      hovertemplate: buildPmvHoverTemplate({
        inputLabel: null,
        xAxis: axisHoverSpec(temperatureAxis, 1),
        yAxis: axisHoverSpec(humidityRatioAxis),
        classification: { label: "Zone", value: "%{text}" },
        pmv: "%{customdata[1]}",
        ppd: "%{customdata[0]:.1f}%",
      }),
      text,
      hoverMetadata,
    })];
  });
}

export function buildComparePsychrometricChart(
  declaration: PmvModelDeclaration,
  source: PmvChartSourceDto,
  resultsByInput: Partial<Record<InputIdType, PmvResponseDto | null>>,
  context: ChartBuildContext,
): PlotlyChartResponseDto {
  const { adapter } = declaration;
  const { unitSystem } = context;
  const baseline = getBaselineInputEntry(source.inputs, context.baselineInputId);
  const humidityRatioMeta = getHumidityRatioDisplayMeta(unitSystem);
  const temperatureAxis = createFieldAxisScale({
    field: FieldKey.DryBulbTemperature,
    unitSystem,
    rangeSi: PSYCHROMETRIC_VIEW.tdbRangeSi,
    points: CONTOUR_GRID_RESOLUTION,
  });
  const humidityRatioAxis = createFieldAxisScale({
    field: FieldKey.HumidityRatio,
    unitSystem,
    rangeSi: PSYCHROMETRIC_VIEW.humidityRatioRangeSi,
    points: CONTOUR_GRID_RESOLUTION,
    units: humidityRatioMeta.displayUnits,
    decimals: humidityRatioMeta.decimals,
    toDisplay: (value) => convertHumidityRatioFromSi(value, unitSystem),
    toSi: (value) => convertHumidityRatioToSi(value, unitSystem),
  });
  const grid: GridFieldChartStrategy = {
    evaluatePoint: (tdb, humidityRatio) => getPsychrometricGridPoint(
      adapter,
      baseline.payload,
      tdb,
      humidityRatio,
    ),
    layers: buildZoneContourLayers({
      name: `${declaration.label} Zones`,
      colorscale: PMV_COLORSCALE,
      contours: PMV_CONTOURS,
      zmin: -3.5,
      zmax: 3.5,
      hovertemplate: buildPmvHoverTemplate({
        inputLabel: null,
        xAxis: axisHoverSpec(temperatureAxis, 1),
        yAxis: axisHoverSpec(humidityRatioAxis),
        classification: { label: "Zone", value: "%{text}" },
        pmv: "%{z:.2f}",
        ppd: "%{customdata[0]:.1f}%",
      }),
      opacity: 0.8,
      isBackgroundZone: true,
    }),
  };
  const rhCurveTraces = buildRelativeHumidityCurves(
    adapter,
    baseline.payload,
    unitSystem,
    temperatureAxis,
    humidityRatioAxis,
  );
  const inputGroup = createPmvInputGroup({
    adapter,
    inputsMap: source.inputs,
    resultsByInput,
    xAxis: temperatureAxis,
    yAxis: humidityRatioAxis,
    getXSi: (payload) => payload.tdb,
    getYSi: (payload) => psy_ta_rh(payload.tdb, payload.rh).hr,
    coordinateDecimals: humidityRatioMeta.decimals,
    buildOverlayTraces: ({ inputId }) => {
      const comfortZone = source.comfortZonesByInput[inputId];
      if (!comfortZone) {
        throw new Error(`Missing PMV comfort zone for ${inputId}.`);
      }
      const { polygonX, polygonY } = buildComfortZonePolygon(
        comfortZone.coolEdge,
        comfortZone.warmEdge,
        (point) => roundValue(temperatureAxis.toDisplay(point.tdb)),
        (point) => roundValue(
          humidityRatioAxis.toDisplay(psy_ta_rh(point.tdb, point.rh).hr),
        ),
      );
      return polygonX.length === 0
        ? []
        : [buildComfortPolygonTrace({
            inputId,
            nameSuffix: "comfort zone",
            polygonX,
            polygonY,
            hovertemplate: "",
            hoverinfo: "skip",
            isComfortZone: true,
          })];
    },
  });

  return buildGridFieldChart({
    xAxis: temperatureAxis,
    yAxis: humidityRatioAxis,
    grid,
    beforeInputTraces: rhCurveTraces,
    inputGroups: [inputGroup],
    layout: {
      title: `${declaration.label} Psychrometric Chart`,
      paperBgColor: CHART_COLOR_WHITE,
      plotBgColor: CHART_COLOR_PLOT_BG,
      showLegend: shouldShowInputLegend(source.inputs),
      margin: { l: 56, r: 24, t: 48, b: 80 },
      gridColor: CHART_COLOR_GRIDLINE,
      legend: { orientation: "h", x: 0, y: 1.1 },
      height: 480,
    },
    source: CalculationSource.FrontendGenerated,
  });
}

function assertPmvExploreConfig(
  context: ChartBuildContext,
): ExploreFieldChartConfig {
  const config = context.fieldChartConfig;
  if (config?.mode !== ChartMode.Explore) {
    throw new Error("PMV Explore chart requires an Explore FieldChartConfig.");
  }
  if (
    config.xField === config.yField
    || !PMV_DYNAMIC_AXIS_FIELDS.includes(
      config.xField as typeof PMV_DYNAMIC_AXIS_FIELDS[number],
    )
    || !PMV_DYNAMIC_AXIS_FIELDS.includes(
      config.yField as typeof PMV_DYNAMIC_AXIS_FIELDS[number],
    )
  ) {
    throw new Error(
      `Unsupported PMV dynamic axis pair: ${config.xField} / ${config.yField}.`,
    );
  }
  return config;
}

export function buildPmvDynamicChart(
  declaration: PmvModelDeclaration,
  source: PmvChartSourceDto,
  resultsByInput: Partial<Record<InputIdType, PmvResponseDto | null>>,
  context: ChartBuildContext,
): PlotlyChartResponseDto {
  const config = assertPmvExploreConfig(context);
  const { adapter } = declaration;
  const { unitSystem } = context;
  const baseline = getBaselineInputEntry(source.inputs, context.baselineInputId);

  const output = declaration.chartableOutputs.find(({ key }) => key === config.zOutput);
  if (!output) throw new Error(`Unsupported PMV chart output: ${config.zOutput}`);
  const xAxis = createFieldAxisScale({
    field: config.xField,
    unitSystem,
    rangeSi: getPmvAxisRangeSi(adapter, config.xField),
    points: CONTOUR_GRID_RESOLUTION,
  });
  const yAxis = createFieldAxisScale({
    field: config.yField,
    unitSystem,
    rangeSi: getPmvAxisRangeSi(adapter, config.yField),
    points: CONTOUR_GRID_RESOLUTION,
  });
  const isPmvOutput = config.zOutput === ModelOutputKey.Pmv;
  const classificationLabel = isPmvOutput ? "Zone" : "Band";
  const axisAdapter: DynamicAxisPayloadAdapter<PmvRequestDto> = {
    setAxisValue: setPmvAxisValue,
    getAxisValue: (request, field) => getPmvAxisValue(adapter, request, field),
    getOperativeTemperature: adapter.getOperativeTemperature,
    getTemperatureComponentRange: (field) => getPmvAxisRangeSi(adapter, field)
      ?? {
        min: fieldMetaByKey[field].minValue,
        max: fieldMetaByKey[field].maxValue,
      },
  };
  const gridHoverTemplate = buildPmvHoverTemplate({
    inputLabel: null,
    xAxis: axisHoverSpec(xAxis),
    yAxis: axisHoverSpec(yAxis),
    classification: { label: classificationLabel, value: "%{text}" },
    pmv: isPmvOutput ? "%{customdata[0]:.2f}" : "%{customdata[1]:.2f}",
    ppd: isPmvOutput ? "%{customdata[1]:.1f}%" : "%{customdata[0]:.1f}%",
  });
  const inputGroup = createPmvInputGroup({
    adapter,
    inputsMap: source.inputs,
    resultsByInput,
    xAxis,
    yAxis,
    getXSi: (payload) => getPmvAxisValue(adapter, payload, config.xField),
    getYSi: (payload) => getPmvAxisValue(adapter, payload, config.yField),
    coordinateDecimals: 2,
    classificationLabel,
    getClassification: (evaluation) => {
      const value = getPmvOutputValue(config.zOutput, evaluation);
      const bandIndex = findNumericBandIndexForValue(config.bands, value);
      return bandIndex === undefined ? "Unclassified" : config.bands[bandIndex].label;
    },
  });

  return buildGridFieldChart({
    xAxis,
    yAxis,
    grid: createBandedGridStrategy({
      config,
      output,
      unitSystem,
      renderStrategy: GridBandRenderStrategy.ConstraintContours,
      bandLabel: classificationLabel,
      hoverTemplate: gridHoverTemplate,
      xAxis,
      yAxis,
      evaluateOutput: (xSi, ySi) => {
        const request = { ...baseline.payload };
        const hasValidCoordinates = applyDynamicAxisCoordinates(
          request,
          { field: config.xField, valueSi: xSi },
          { field: config.yField, valueSi: ySi },
          axisAdapter,
        );
        if (!hasValidCoordinates) return null;
        const evaluation = tryEvaluatePmvForChart(adapter, request);
        if (!evaluation) return null;
        return {
          valueSi: getPmvOutputValue(config.zOutput, evaluation),
          additionalHoverMetadata: [
            isPmvOutput ? evaluation.ppd : evaluation.pmv,
          ],
        };
      },
    }),
    inputGroups: [inputGroup],
    layout: {
      title: `${declaration.label} Dynamic Chart — ${output.label}`,
      paperBgColor: CHART_COLOR_WHITE,
      plotBgColor: CHART_COLOR_PLOT_BG,
      showLegend: shouldShowInputLegend(source.inputs),
      margin: { l: 64, r: 24, t: 48, b: 64 },
      gridColor: CHART_COLOR_GRIDLINE,
      legend: { orientation: "h", x: 0, y: 1.1 },
      height: 480,
    },
    source: CalculationSource.FrontendGenerated,
  });
}

export function createPmvModelConfig(declaration: PmvModelDeclaration) {
  const { adapter } = declaration;
  const builder = new ComfortModelBuilder<PmvResponseDto, PmvChartSourceDto>(
    adapter.modelId,
  );
  const temperatureBehavior = createTemperatureControlBehavior(
    InputControlId.Temperature,
  );
  const humidityBehavior = createHumidityControlBehavior(InputControlId.Humidity);
  const airSpeedBehavior = createAirSpeedControlBehavior(InputControlId.AirSpeed, {
    supportsOccupantAirSpeedControl: adapter.supportsOccupantAirSpeedControl,
  });

  builder
    .setLabel(declaration.label)
    .setDescription(declaration.description)
    .setModes(declaration.modes)
    .setChartableOutputs(declaration.chartableOutputs)
    .setComplianceSpec(declaration.complianceSpec)
    .addControl({
      id: InputControlId.Temperature,
      behavior: temperatureBehavior,
    })
    .addControl({
      id: InputControlId.RadiantTemperature,
      behavior: createControlBehavior({
        controlId: InputControlId.RadiantTemperature,
        fieldKey: FieldKey.MeanRadiantTemperature,
        hidden: (context) =>
          normalizePmvOptions(context.options)[OptionKey.TemperatureMode]
            === TemperatureMode.Operative,
      }),
    })
    .addControl({ id: InputControlId.AirSpeed, behavior: airSpeedBehavior })
    .addControl({ id: InputControlId.Humidity, behavior: humidityBehavior })
    .addControl({
      id: InputControlId.MetabolicRate,
      behavior: createControlBehavior({
        controlId: InputControlId.MetabolicRate,
        fieldKey: FieldKey.MetabolicRate,
        presetOptions: metabolicPresetOptions,
        applyInput: (context, inputId, nextValue) => {
          if (nextValue === null) return null;
          const nextInputState = {
            ...context.inputsByInput[inputId],
            [FieldKey.MetabolicRate]: nextValue,
          };
          const synchronized = synchronizePmvInputState(
            nextInputState,
            context.options,
            context.derivedByInput[inputId],
          );
          return createSingleInputPatch(inputId, synchronized.inputState);
        },
      }),
    })
    .addControl({
      id: InputControlId.ClothingInsulation,
      behavior: createControlBehavior({
        controlId: InputControlId.ClothingInsulation,
        fieldKey: FieldKey.ClothingInsulation,
        presetOptions: clothingPresetOptions,
        presetDecimals: 2,
        showClothingBuilder: true,
        maxValue: adapter.clothingInsulationMaxSi,
      }),
    })
    .addOptionHandler(OptionKey.TemperatureMode, (context, nextValue) =>
      temperatureBehavior.applyOptionChange?.(
        context,
        OptionKey.TemperatureMode,
        nextValue,
      ) ?? null)
    .addOptionHandler(OptionKey.AirSpeedInputMode, (context, nextValue) =>
      airSpeedBehavior.applyOptionChange?.(
        context,
        OptionKey.AirSpeedInputMode,
        nextValue,
      ) ?? null)
    .addOptionHandler(OptionKey.HumidityInputMode, (context, nextValue) =>
      humidityBehavior.applyOptionChange?.(
        context,
        OptionKey.HumidityInputMode,
        nextValue,
      ) ?? null)
    .setDefaultChart(ChartId.Psychrometric, [
      ChartId.Psychrometric,
      ChartId.PmvDynamic,
    ])
    .setDefaultOptions({ ...defaultPmvOptions })
    .setOptionNormalizer(normalizePmvOptionsSnapshot)
    .setDynamicAxisFields([...PMV_DYNAMIC_AXIS_FIELDS])
    .setDefaultDynamicAxes({
      xAxis: FieldKey.DryBulbTemperature,
      yAxis: FieldKey.RelativeHumidity,
    })
    .setCalculator((context, visibleInputIds) => {
      const resultsByInput = createEmptyResults<PmvResponseDto>();
      const inputs: CompareInputMap<ComfortZoneRequestDto> = {};
      const comfortZonesByInput: CompareInputMap<ComfortZoneResponseDto> = {};

      for (const inputId of visibleInputIds) {
        const request = toPmvRequest(context, inputId, adapter);
        const comfortZoneRequest = toComfortZoneRequest(context, inputId, adapter);
        const result = adapter.calculate(request);
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
            && PMV_NEUTRAL_ZONE.contains(result.pmv),
          standard: adapter.resultStandard,
          source: CalculationSource.JsThermalComfort,
        };
      }

      return {
        resultsByInput,
        chartSource: { inputs, comfortZonesByInput },
      };
    })
    .setResultBuilder(buildPmvResultSections)
    .setChartBuilder((chartId, chartSource, resultsByInput, context) => {
      if (!chartSource) return null;
      if (chartId === ChartId.Psychrometric) {
        return buildComparePsychrometricChart(
          declaration,
          chartSource,
          resultsByInput,
          context,
        );
      }
      if (
        chartId === ChartId.PmvDynamic
        && context.fieldChartConfig?.mode === ChartMode.Explore
      ) {
        return buildPmvDynamicChart(
          declaration,
          chartSource,
          resultsByInput,
          context,
        );
      }
      return null;
    })
    .setZones(pmvZonesList)
    .setLegendChartIds([ChartId.Psychrometric, ChartId.PmvDynamic])
    .setLegendTitle("PMV Zones")
    .setLockYAxisChartIds([]);

  if (adapter.supportsOccupantAirSpeedControl) {
    builder.addOptionHandler(OptionKey.AirSpeedControlMode, (context, nextValue) =>
      airSpeedBehavior.applyOptionChange?.(
        context,
        OptionKey.AirSpeedControlMode,
        nextValue,
      ) ?? null);
  }

  return builder.build();
}
