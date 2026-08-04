import { psy_ta_rh } from "jsthermalcomfort";
import { CalculationSource, type ComfortStandard } from "../models/calculationMetadata";
import { ChartId } from "../models/chartOptions";
import type {
  ComfortPointDto,
  CompareInputMap,
  ModelChartSourceDto,
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
  defaultPmvOptions,
  HumidityInputMode,
  OptionKey,
  TemperatureMode,
  type PmvModelOptions,
} from "../models/inputModes";
import type { InputId as InputIdType } from "../models/inputSlots";
import type { ModelCalculationContext } from "../models/modelCalculation";
import type { ModifierId as ModifierIdType } from "../models/inputModifiers";
import {
  bandsFromThermalZones,
  findNumericBandIndexForValue,
  ModelOutputKey,
  type ChartBuildContext,
  type ChartMode as ChartModeType,
  type ComplianceFeedback,
  type ComplianceSpec,
  type FieldChartConfig,
  type ModelOutput,
  type NumericBand,
} from "../models/modelCapabilities";
import { ThermalZone } from "../models/thermalZone";
import type { UnitSystem as UnitSystemType } from "../models/units";
import { buildClosedBoundaryPolygon } from "../services/comfort/charts/boundaryRegionEngine";
import {
  buildFieldChart,
  createBandedGridStrategy,
  GridBandRenderStrategy,
  type FieldChartAxisSpec,
  type FieldChartInputGroup,
  type FieldChartRenderContext,
} from "../services/comfort/charts/chartEngine";
import {
  applyDynamicAxisCoordinates,
  type DynamicAxisPayloadAdapter,
} from "../services/comfort/charts/dynamicAxisPayload";
import {
  buildComfortPolygonTrace,
  buildLineTrace,
} from "../services/comfort/charts/plotlyBuilders";
import type { ChartAxisScale } from "../services/comfort/charts/types";
import {
  createAirSpeedControlBehavior,
  createControlBehavior,
  createHumidityControlBehavior,
  createTemperatureControlBehavior,
} from "../services/comfort/controls/controlBehaviors";
import { createSingleInputPatch } from "../services/comfort/controls/types";
import { calculateRelativeHumidityFromHumidityRatio } from "../services/comfort/derivations";
import {
  getBaselineInputEntry,
  requireThermalZone,
  roundValue,
} from "../services/comfort/helpers";
import {
  clothingTypicalEnsembles,
  metabolicActivityOptions,
} from "../services/comfort/referenceValues";
import {
  normalizePmvOptions,
  synchronizePmvInputState,
} from "../services/comfort/syncState";
import {
  convertHumidityRatioFromSi,
  convertHumidityRatioToSi,
  getHumidityRatioDisplayMeta,
} from "../services/units";
import {
  buildResultSectionsFromRows,
  ComfortModelBuilder,
  createEmptyResults,
  hasExactKeys,
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
const CHART_COLOR_RH_LINE = "#94a3b8";
const COLOR_COMPLIANT_GREEN = "#047857";
const COLOR_NON_COMPLIANT_RED = "#dc2626";

const pmvNeutralZone = new ThermalZone({
  label: "Neutral",
  min: -0.5,
  max: 0.5,
  color: "#f2f2f2",
  textColor: "#475569",
});

const pmvZonesList = [
  new ThermalZone({ label: "Cold", max: -2.5, color: "#0571b0", textColor: "#1d4ed8" }),
  new ThermalZone({ label: "Cool", min: -2.5, max: -1.5, color: "#4c78a8", textColor: "#2563eb" }),
  new ThermalZone({ label: "Slightly Cool", min: -1.5, max: -0.5, color: "#92c5de", textColor: "#0369a1" }),
  pmvNeutralZone,
  new ThermalZone({ label: "Slightly Warm", min: 0.5, max: 1.5, color: "#f4a582", textColor: "#ea580c" }),
  new ThermalZone({ label: "Warm", min: 1.5, max: 2.5, color: "#e15759", textColor: "#b91c1c" }),
  new ThermalZone({ label: "Hot", min: 2.5, color: "#cc79a7", textColor: "#701a75" }),
];

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

export interface PmvChartSourceDto extends ModelChartSourceDto<ComfortZoneRequestDto> {
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
  readonly supportedModifiers: readonly ModifierIdType[];
  readonly complianceSpec: ComplianceSpec<NumericBand, PmvResponseDto>;
}

type PmvFieldChartConfig = FieldChartConfig<NumericBand>;

interface PmvChartEvaluation {
  pmv: number;
  ppd: number;
  zone: ThermalZone;
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
    defaultBands: ppdExploreBands,
  },
];

export function createPmvComplianceBands(): readonly NumericBand[] {
  return [
    {
      min: -Infinity,
      max: pmvNeutralZone.min,
      label: "Outside acceptable PMV range",
      color: "#fecaca",
    },
    {
      min: pmvNeutralZone.min,
      max: pmvNeutralZone.max,
      label: "Acceptable PMV range",
      color: "#86efac",
    },
    {
      min: pmvNeutralZone.max,
      max: Infinity,
      label: "Outside acceptable PMV range",
      color: "#fecaca",
    },
  ];
}

function formatPmvBoundary(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`PMV compliance boundaries must be finite; received ${value}.`);
  }
  if (value < 0) return `−${Math.abs(value)}`;
  return value > 0 ? `+${value}` : "0";
}

export function createPmvComplianceCaption(
  standardLabel: string,
  bands: readonly NumericBand[],
): string {
  const neutralBand = bands.find(({ min, max }) => (
    Number.isFinite(min) && Number.isFinite(max)
  ));
  if (!neutralBand) {
    throw new Error(`${standardLabel} requires a finite Neutral compliance band.`);
  }
  return `Green shading = ${standardLabel} compliant PMV (${formatPmvBoundary(neutralBand.min)} ≤ PMV < ${formatPmvBoundary(neutralBand.max)}); red = outside the limit.`;
}

function getPmvZoneMeta(pmv: number): ThermalZone {
  return requireThermalZone(pmvZonesList, pmv, "PMV");
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
function tryEvaluatePmvForChart(
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

function calculateComfortZone(
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
const humidityInputModeValues = new Set<string>(Object.values(HumidityInputMode));
const pmvOptionKeys = Object.keys(defaultPmvOptions);

function parsePmvOptions(value: unknown): PmvModelOptions | null {
  if (!isRecord(value) || !hasExactKeys(value, pmvOptionKeys)) return null;

  const temperatureMode = value[OptionKey.TemperatureMode];
  const airSpeedControlMode = value[OptionKey.AirSpeedControlMode];
  const humidityInputMode = value[OptionKey.HumidityInputMode];
  if (typeof temperatureMode !== "string" || !temperatureModeValues.has(temperatureMode)) {
    return null;
  }
  if (
    typeof airSpeedControlMode !== "string"
    || !airSpeedControlModeValues.has(airSpeedControlMode)
  ) {
    return null;
  }
  if (typeof humidityInputMode !== "string" || !humidityInputModeValues.has(humidityInputMode)) {
    return null;
  }

  return {
    [OptionKey.TemperatureMode]: temperatureMode as TemperatureMode,
    [OptionKey.AirSpeedControlMode]: airSpeedControlMode as AirSpeedControlMode,
    [OptionKey.HumidityInputMode]: humidityInputMode as HumidityInputMode,
  };
}

function toPmvRequest(
  context: ModelCalculationContext,
  inputId: InputIdType,
  adapter: PmvStandardAdapter,
): PmvRequestDto {
  const inputs = context.inputsByInput[inputId];
  const options = parsePmvOptions(
    context.modelOptionsByModel[adapter.modelId],
  );
  if (!options) {
    throw new Error(`Invalid options state for ${adapter.modelId}.`);
  }
  return {
    tdb: Number(inputs[FieldKey.DryBulbTemperature]),
    tr: Number(inputs[FieldKey.MeanRadiantTemperature]),
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

function buildPmvResultSections(
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

function buildComfortZonePolygon(
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
  getClassification = (evaluation) => evaluation.zone.label,
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
      const result = resultsByInput[inputId];
      const evaluation = result
        ? {
            pmv: result.pmv,
            ppd: result.ppd,
            zone: getPmvZoneMeta(result.pmv),
          }
        : tryEvaluatePmvForChart(adapter, payload);
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

function evaluatePsychrometricPoint(
  adapter: PmvStandardAdapter,
  baseline: PmvRequestDto,
  tdb: number,
  humidityRatio: number,
): PmvChartEvaluation | null {
  const unboundedRh = calculateRelativeHumidityFromHumidityRatio(tdb, humidityRatio);
  if (unboundedRh > 100) return null;

  const rh = Math.max(0, unboundedRh);
  return tryEvaluatePmvForChart(adapter, { ...baseline, tdb, rh });
}

function buildRelativeHumidityCurves(
  adapter: PmvStandardAdapter,
  baseline: PmvRequestDto,
  config: PmvFieldChartConfig,
  unitSystem: UnitSystemType,
  temperatureAxis: ChartAxisScale,
  humidityRatioAxis: ChartAxisScale,
): PlotTraceDto[] {
  const isPmvOutput = config.zOutput === ModelOutputKey.Pmv;
  const classificationLabel = isPmvOutput ? "Zone" : "Band";
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
        evaluation
          ? isPmvOutput
            ? [evaluation.pmv, evaluation.ppd]
            : [evaluation.ppd, evaluation.pmv]
          : [NaN, NaN],
      );
      const valueSi = evaluation
        ? getPmvOutputValue(config.zOutput, evaluation)
        : undefined;
      const bandIndex = valueSi === undefined
        ? undefined
        : findNumericBandIndexForValue(config.bands, valueSi);
      text.push(
        bandIndex === undefined ? "Unclassified" : config.bands[bandIndex].label,
      );
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
        classification: { label: classificationLabel, value: "%{text}" },
        pmv: isPmvOutput
          ? "%{customdata[0]:.2f}"
          : "%{customdata[1]:.2f}",
        ppd: isPmvOutput
          ? "%{customdata[1]:.1f}%"
          : "%{customdata[0]:.1f}%",
      }),
      text,
      hoverMetadata,
    })];
  });
}

type PmvInputOverlayBuilder = NonNullable<FieldChartInputGroup<
  ComfortZoneRequestDto,
  PmvResponseDto
>["buildOverlayTraces"]>;

interface PmvFieldChartDescriptor {
  config: PmvFieldChartConfig;
  title: string;
  xAxis: FieldChartAxisSpec;
  yAxis: FieldChartAxisSpec;
  coordinateDecimals: number;
  opacity?: number;
  evaluatePoint: (xSi: number, ySi: number) => PmvChartEvaluation | null;
  getInputXSi: (payload: ComfortZoneRequestDto) => number;
  getInputYSi: (payload: ComfortZoneRequestDto) => number;
  chartOverlays?: (context: FieldChartRenderContext) => PlotTraceDto[];
  getInputOverlayBuilder?: (
    xAxis: ChartAxisScale,
    yAxis: ChartAxisScale,
  ) => PmvInputOverlayBuilder;
  margin: Record<string, number>;
}

function buildPmvFieldChart(
  declaration: PmvModelDeclaration,
  source: PmvChartSourceDto,
  resultsByInput: Partial<Record<InputIdType, PmvResponseDto | null>>,
  context: ChartBuildContext<NumericBand>,
  descriptor: PmvFieldChartDescriptor,
): PlotlyChartResponseDto {
  const { adapter } = declaration;
  const { config } = descriptor;
  const output = declaration.chartableOutputs.find(({ key }) => key === config.zOutput);
  if (!output) {
    throw new Error(
      `${declaration.label} does not declare chart output ${config.zOutput}.`,
    );
  }
  const isPmvOutput = config.zOutput === ModelOutputKey.Pmv;
  const classificationLabel = isPmvOutput ? "Zone" : "Band";
  const getClassification = (evaluation: PmvChartEvaluation): string => {
    const valueSi = getPmvOutputValue(config.zOutput, evaluation);
    const bandIndex = findNumericBandIndexForValue(config.bands, valueSi);
    return bandIndex === undefined ? "Unclassified" : config.bands[bandIndex].label;
  };

  return buildFieldChart({
    unitSystem: context.unitSystem,
    xAxis: descriptor.xAxis,
    yAxis: descriptor.yAxis,
    strategy: createBandedGridStrategy({
      config,
      output,
      renderStrategy: GridBandRenderStrategy.ConstraintContours,
      bandLabel: classificationLabel,
      hoverTemplate: ({ xAxis, yAxis }) => buildPmvHoverTemplate({
        inputLabel: null,
        xAxis: axisHoverSpec(xAxis),
        yAxis: axisHoverSpec(yAxis),
        classification: { label: classificationLabel, value: "%{text}" },
        pmv: isPmvOutput ? "%{customdata[0]:.2f}" : "%{customdata[1]:.2f}",
        ppd: isPmvOutput ? "%{customdata[1]:.1f}%" : "%{customdata[0]:.1f}%",
      }),
      opacity: descriptor.opacity,
      evaluateOutput: (xSi, ySi) => {
        const evaluation = descriptor.evaluatePoint(xSi, ySi);
        return evaluation
          ? {
              valueSi: getPmvOutputValue(config.zOutput, evaluation),
              additionalHoverMetadata: [
                isPmvOutput ? evaluation.ppd : evaluation.pmv,
              ],
            }
          : null;
      },
    }),
    chartOverlays: descriptor.chartOverlays,
    inputGroups: ({ xAxis, yAxis }) => [createPmvInputGroup({
      adapter,
      inputsMap: source.inputs,
      resultsByInput,
      xAxis,
      yAxis,
      getXSi: descriptor.getInputXSi,
      getYSi: descriptor.getInputYSi,
      coordinateDecimals: descriptor.coordinateDecimals,
      classificationLabel,
      getClassification,
      buildOverlayTraces: descriptor.getInputOverlayBuilder?.(xAxis, yAxis),
    })],
    layout: {
      title: `${descriptor.title} — ${output.label}`,
      margin: descriptor.margin,
      legend: { orientation: "h", x: 0, y: 1.1 },
    },
    source: CalculationSource.FrontendGenerated,
  });
}

function createPsychrometricComfortZoneOverlayBuilder(
  source: PmvChartSourceDto,
  xAxis: ChartAxisScale,
  yAxis: ChartAxisScale,
): PmvInputOverlayBuilder {
  return ({ inputId }) => {
    const comfortZone = source.comfortZonesByInput[inputId];
    if (!comfortZone) {
      throw new Error(`Missing PMV comfort zone for ${inputId}.`);
    }
    const { polygonX, polygonY } = buildComfortZonePolygon(
      comfortZone.coolEdge,
      comfortZone.warmEdge,
      (point) => roundValue(xAxis.toDisplay(point.tdb)),
      (point) => roundValue(yAxis.toDisplay(psy_ta_rh(point.tdb, point.rh).hr)),
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
  };
}

function buildComparePsychrometricChart(
  declaration: PmvModelDeclaration,
  source: PmvChartSourceDto,
  resultsByInput: Partial<Record<InputIdType, PmvResponseDto | null>>,
  context: ChartBuildContext<NumericBand>,
): PlotlyChartResponseDto {
  const { adapter } = declaration;
  const { unitSystem } = context;
  const baseline = getBaselineInputEntry(source.inputs, context.baselineInputId);
  const humidityRatioMeta = getHumidityRatioDisplayMeta(unitSystem);
  const config: PmvFieldChartConfig = {
    ...context.fieldChartConfig,
    xField: FieldKey.DryBulbTemperature,
    yField: FieldKey.HumidityRatio,
  };

  return buildPmvFieldChart(declaration, source, resultsByInput, context, {
    config,
    title: `${declaration.label} Psychrometric Chart`,
    xAxis: {
      field: config.xField,
      rangeSi: PSYCHROMETRIC_VIEW.tdbRangeSi,
      points: CONTOUR_GRID_RESOLUTION,
    },
    yAxis: {
      field: config.yField,
      rangeSi: PSYCHROMETRIC_VIEW.humidityRatioRangeSi,
      points: CONTOUR_GRID_RESOLUTION,
      units: humidityRatioMeta.displayUnits,
      decimals: humidityRatioMeta.decimals,
      toDisplay: convertHumidityRatioFromSi,
      toSi: convertHumidityRatioToSi,
    },
    coordinateDecimals: humidityRatioMeta.decimals,
    opacity: 0.8,
    evaluatePoint: (tdb, humidityRatio) => evaluatePsychrometricPoint(
      adapter,
      baseline.payload,
      tdb,
      humidityRatio,
    ),
    getInputXSi: (payload) => payload.tdb,
    getInputYSi: (payload) => psy_ta_rh(payload.tdb, payload.rh).hr,
    chartOverlays: ({ xAxis, yAxis }) => buildRelativeHumidityCurves(
      adapter,
      baseline.payload,
      config,
      unitSystem,
      xAxis,
      yAxis,
    ),
    getInputOverlayBuilder: (xAxis, yAxis) => (
      createPsychrometricComfortZoneOverlayBuilder(source, xAxis, yAxis)
    ),
    margin: { l: 56, r: 24, t: 48, b: 80 },
  });
}

function buildPmvDynamicChart(
  declaration: PmvModelDeclaration,
  source: PmvChartSourceDto,
  resultsByInput: Partial<Record<InputIdType, PmvResponseDto | null>>,
  context: ChartBuildContext<NumericBand>,
): PlotlyChartResponseDto {
  const { adapter } = declaration;
  const config = context.fieldChartConfig;
  const baseline = getBaselineInputEntry(source.inputs, context.baselineInputId);
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

  return buildPmvFieldChart(declaration, source, resultsByInput, context, {
    config,
    title: `${declaration.label} Dynamic Chart`,
    xAxis: {
      field: config.xField,
      rangeSi: getPmvAxisRangeSi(adapter, config.xField),
      points: CONTOUR_GRID_RESOLUTION,
    },
    yAxis: {
      field: config.yField,
      rangeSi: getPmvAxisRangeSi(adapter, config.yField),
      points: CONTOUR_GRID_RESOLUTION,
    },
    coordinateDecimals: 2,
    evaluatePoint: (xSi, ySi) => {
      const request = { ...baseline.payload };
      const hasValidCoordinates = applyDynamicAxisCoordinates(
        request,
        { field: config.xField, valueSi: xSi },
        { field: config.yField, valueSi: ySi },
        axisAdapter,
      );
      return hasValidCoordinates ? tryEvaluatePmvForChart(adapter, request) : null;
    },
    getInputXSi: (payload) => getPmvAxisValue(adapter, payload, config.xField),
    getInputYSi: (payload) => getPmvAxisValue(adapter, payload, config.yField),
    margin: { l: 64, r: 24, t: 48, b: 64 },
  });
}

export function createPmvModelConfig(declaration: PmvModelDeclaration) {
  const { adapter } = declaration;
  const builder = new ComfortModelBuilder<
    PmvResponseDto,
    PmvChartSourceDto,
    NumericBand
  >(
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
    .setModifiers(declaration.supportedModifiers)
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
    .addOptionHandler(OptionKey.HumidityInputMode, (context, nextValue) =>
      humidityBehavior.applyOptionChange?.(
        context,
        OptionKey.HumidityInputMode,
        nextValue,
      ) ?? null)
    .setDefaultChart(ChartId.PmvDynamic, [
      ChartId.Psychrometric,
      ChartId.PmvDynamic,
    ])
    .setDefaultOptions({ ...defaultPmvOptions })
    .setOptionParser(parsePmvOptions)
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
      if (chartId === ChartId.PmvDynamic) {
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
