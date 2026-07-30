import { t_o } from "jsthermalcomfort";
import { CalculationSource, type ComfortStandard } from "../models/calculationMetadata";
import { ChartId } from "../models/chartOptions";
import type {
  CompareInputMap,
  PlotlyChartResponseDto,
  PlotTraceDto,
} from "../models/comfortDtos";
import {
  ComfortModel,
  ComplianceStatus,
  type JsThermalComfortStandard,
} from "../models/comfortModels";
import { FieldKey, type FieldKey as FieldKeyType } from "../models/fieldKeys";
import { fieldMetaByKey } from "../models/inputFieldsMeta";
import { InputControlId, type PresetInputOption } from "../models/inputControls";
import { defaultAdaptiveOptions, OptionKey, TemperatureMode } from "../models/inputModes";
import type { InputId as InputIdType } from "../models/inputSlots";
import type { ModelCalculationContext } from "../models/modelCalculation";
import {
  type Band,
  type ChartBuildContext,
  type ChartMode as ChartModeType,
  type ComplianceSpec,
  type ModelOutput,
} from "../models/modelCapabilities";
import { ThermalZone } from "../models/thermalZone";
import type { UnitSystem as UnitSystemType } from "../models/units";
import { createFieldAxisScale } from "../services/comfort/charts/axis";
import {
  buildBoundaryRegionTraces,
  buildClosedBoundaryPolygonTrace,
  buildFilledBoundaryRegionTrace,
  buildTooltipGridTrace,
} from "../services/comfort/charts/boundaryRegionEngine";
import {
  buildFieldChart,
  buildGridFieldChart,
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
import { buildComfortPolygonTrace } from "../services/comfort/charts/plotlyBuilders";
import type { ChartAxisScale, ChartLayoutSpec } from "../services/comfort/charts/types";
import { buildZoneColorscale, buildZoneContourLayers } from "../services/comfort/charts/zoneGrid";
import {
  buildDefaultPresentation,
  createControlBehavior,
  createTemperatureControlBehavior,
} from "../services/comfort/controls/controlBehaviors";
import { isFiniteNumber, roundValue } from "../services/comfort/helpers";
import { convertFieldValueFromSi } from "../services/units";
import {
  buildResultSectionsFromRows,
  ComfortModelBuilder,
  createEmptyResults,
  isRecord,
  type ResultRowDefinition,
} from "../state/comfortTool/modelConfigs/builder";

const FIXED_OPERATIVE_RANGE_SI = { min: 10, max: 40 };
const FIXED_BOUNDARY_POINTS = 500;
const DYNAMIC_GRID_POINTS = 50;
const DYNAMIC_BOUNDARY_POINTS = 240;
const TOOLTIP_GRID_POINTS = 40;
const COOLING_EFFECT_SPEED_BREAKPOINTS = [0.6, 0.9, 1.2];
const CHART_COLORS = {
  paper: "#ffffff",
  plot: "#f8fafc",
  grid: "#e2e8f0",
  line: "#334155",
} as const;
const ADAPTIVE_CONTOURS = {
  coloring: "fill",
  showlines: true,
  type: "levels",
  start: 1.5,
  size: 1,
  smoothing: 1.3,
  line: { width: 1, color: "#333333" },
};
const TRANSPARENT_COLORSCALE: [number, string][] = [
  [0, "rgba(0,0,0,0)"],
  [1, "rgba(0,0,0,0)"],
];
const ADAPTIVE_DYNAMIC_AXIS_FIELDS = [
  FieldKey.DryBulbTemperature,
  FieldKey.MeanRadiantTemperature,
  FieldKey.OperativeTemperature,
  FieldKey.RelativeAirSpeed,
  FieldKey.PrevailingMeanOutdoorTemperature,
] as const;

export interface AdaptiveRequestDto {
  tdb: number;
  tr: number;
  trm: number;
  v: number;
}

export interface AdaptiveLevelDefinition {
  id: string;
  label: string;
  coolOffset: number;
  warmOffset: number;
}

export interface AdaptiveLevelResult {
  id: string;
  label: string;
  accepted: boolean;
  status: string | null;
  lower: number | null;
  upper: number | null;
}

export interface AdaptiveResponseDto {
  tCmf: number;
  operativeTemperature: number;
  levels: AdaptiveLevelResult[];
  isApplicable: boolean;
  standard: ComfortStandard;
  source: CalculationSource;
}

export interface AdaptiveChartSourceDto {
  inputs: CompareInputMap<AdaptiveRequestDto>;
}

export interface AdaptiveBoundaryDefinition {
  bandSequence: readonly ThermalZone[];
  levels: readonly AdaptiveLevelDefinition[];
  coefficients: { slope: number; intercept: number };
}

export interface AdaptiveModelDeclaration extends AdaptiveBoundaryDefinition {
  modelId: typeof ComfortModel.AdaptiveAshrae | typeof ComfortModel.AdaptiveEn;
  label: string;
  description: string;
  modes: readonly ChartModeType[];
  chartableOutputs: readonly ModelOutput[];
  complianceSpec: ComplianceSpec;
  resultStandard: ComfortStandard;
  operativeTemperatureStandard: JsThermalComfortStandard;
  zones: readonly ThermalZone[];
  hoverLevelIds: readonly string[];
  complianceLevelId: string;
  outdoorTemperatureRangeSi: { min: number; max: number };
  outdoorTemperatureLabel: string;
  airSpeedPresets: readonly PresetInputOption[];
  colorByStatus: Readonly<Record<string, string>>;
  complianceColors: { compliant: string; nonCompliant: string };
  evaluateApplicability: (request: AdaptiveRequestDto) => number;
}

interface AdaptiveChartEvaluation {
  result: AdaptiveResponseDto;
  operativeTemperature: number;
}

export function getCe(airSpeed: number, unadjustedUpperBoundary: number): number {
  if (airSpeed < 0.6 || unadjustedUpperBoundary < 25) return 0;
  if (airSpeed < 0.9) return 1.2;
  if (airSpeed < 1.2) return 1.8;
  return 2.2;
}

function getBaseComfortTemperature(
  declaration: AdaptiveBoundaryDefinition,
  outdoorTemperature: number,
): number {
  return declaration.coefficients.slope * outdoorTemperature
    + declaration.coefficients.intercept;
}

function getLevelBoundaries(
  declaration: AdaptiveBoundaryDefinition,
  level: AdaptiveLevelDefinition,
  outdoorTemperature: number,
  airSpeed: number,
): { lower: number; upper: number } {
  const tCmf = getBaseComfortTemperature(declaration, outdoorTemperature);
  const unadjustedUpper = tCmf + level.warmOffset;
  return {
    lower: tCmf + level.coolOffset,
    upper: unadjustedUpper + getCe(airSpeed, unadjustedUpper),
  };
}

function getAdaptiveTemperatureBoundaries(
  declaration: AdaptiveBoundaryDefinition,
  outdoorTemperature: number,
  airSpeed: number,
): number[] {
  const boundaries = declaration.levels.map((level) =>
    getLevelBoundaries(declaration, level, outdoorTemperature, airSpeed));
  return [
    ...boundaries.map(({ lower }) => lower).sort((left, right) => left - right),
    ...boundaries.map(({ upper }) => upper).sort((left, right) => left - right),
  ];
}

export function calculateAdaptive(
  declaration: AdaptiveModelDeclaration,
  payload: AdaptiveRequestDto,
): AdaptiveResponseDto {
  const operativeTemperature = t_o(
    payload.tdb,
    payload.tr,
    payload.v,
    declaration.operativeTemperatureStandard,
  );
  const applicabilityResult = declaration.evaluateApplicability(payload);
  const isApplicable = Number.isFinite(applicabilityResult);
  const tCmf = isApplicable
    ? getBaseComfortTemperature(declaration, payload.trm)
    : NaN;
  const levels = declaration.levels.map((level): AdaptiveLevelResult => {
    if (!isApplicable) {
      return {
        id: level.id,
        label: level.label,
        accepted: false,
        status: null,
        lower: null,
        upper: null,
      };
    }
    const { lower, upper } = getLevelBoundaries(
      declaration,
      level,
      payload.trm,
      payload.v,
    );
    const accepted = operativeTemperature >= lower && operativeTemperature < upper;
    return {
      id: level.id,
      label: level.label,
      accepted,
      status: accepted
        ? level.label
        : operativeTemperature < lower
          ? declaration.bandSequence[0].label
          : declaration.bandSequence[declaration.bandSequence.length - 1]?.label ?? null,
      lower,
      upper,
    };
  });

  return {
    tCmf,
    operativeTemperature,
    levels,
    isApplicable,
    standard: declaration.resultStandard,
    source: CalculationSource.JsThermalComfort,
  };
}

/** Returns null only when the adaptive standard marks a point unplottable. */
export function tryEvaluateAdaptiveForChart(
  declaration: AdaptiveModelDeclaration,
  payload: AdaptiveRequestDto,
): AdaptiveChartEvaluation | null {
  const result = calculateAdaptive(declaration, payload);
  return result.isApplicable
    ? { result, operativeTemperature: result.operativeTemperature }
    : null;
}

function getLevelResult(
  result: AdaptiveResponseDto,
  levelId: string,
): AdaptiveLevelResult {
  const level = result.levels.find(({ id }) => id === levelId);
  if (!level) throw new Error(`Missing adaptive result level: ${levelId}`);
  return level;
}

function getBoundaryValues(result: AdaptiveResponseDto): number[] | null {
  if (!result.isApplicable) return null;
  const lower = result.levels
    .map((level) => level.lower)
    .filter(isFiniteNumber)
    .sort((left, right) => left - right);
  const upper = result.levels
    .map((level) => level.upper)
    .filter(isFiniteNumber)
    .sort((left, right) => left - right);
  return lower.length === result.levels.length && upper.length === result.levels.length
    ? [...lower, ...upper]
    : null;
}

function mapBoundariesToZoneScale(
  operativeTemperature: number,
  boundaries: readonly number[],
): number {
  if (operativeTemperature < boundaries[0]) {
    return 1.5 - Math.min(0.49, (boundaries[0] - operativeTemperature) / 4);
  }
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    if (operativeTemperature < boundaries[index + 1]) {
      const lower = boundaries[index];
      const upper = boundaries[index + 1];
      return upper <= lower
        ? index + 1.5
        : index + 1.5
          + (operativeTemperature - lower) / (upper - lower);
    }
  }
  const lastBoundary = boundaries[boundaries.length - 1] ?? operativeTemperature;
  return boundaries.length + 0.5
    + Math.min(0.49, Math.max(0, operativeTemperature - lastBoundary) / 4);
}

function getDynamicZone(
  declaration: AdaptiveModelDeclaration,
  evaluation: AdaptiveChartEvaluation,
): { z: number; label: string } | null {
  const boundaries = getBoundaryValues(evaluation.result);
  if (!boundaries) return null;
  const bandIndex = boundaries.findIndex(
    (boundary) => evaluation.operativeTemperature < boundary,
  );
  const resolvedIndex = bandIndex === -1
    ? declaration.bandSequence.length - 1
    : bandIndex;
  return {
    z: mapBoundariesToZoneScale(evaluation.operativeTemperature, boundaries),
    label: declaration.bandSequence[resolvedIndex].label,
  };
}

function normalizeAdaptiveOptionsSnapshot(value: unknown) {
  if (!isRecord(value)) return { ...defaultAdaptiveOptions };
  return {
    ...defaultAdaptiveOptions,
    [OptionKey.TemperatureMode]:
      value[OptionKey.TemperatureMode] === TemperatureMode.Air
        ? TemperatureMode.Air
        : TemperatureMode.Operative,
  };
}

function toAdaptiveRequest(
  context: ModelCalculationContext,
  inputId: InputIdType,
  declaration: AdaptiveModelDeclaration,
): AdaptiveRequestDto {
  const inputs = context.inputsByInput[inputId];
  const options = normalizeAdaptiveOptionsSnapshot(
    context.modelOptionsByModel[declaration.modelId],
  );
  const tdb = Number(inputs[FieldKey.DryBulbTemperature]);
  return {
    tdb,
    tr: options[OptionKey.TemperatureMode] === TemperatureMode.Operative
      ? tdb
      : Number(inputs[FieldKey.MeanRadiantTemperature]),
    trm: Number(inputs[FieldKey.PrevailingMeanOutdoorTemperature]),
    v: Number(inputs[FieldKey.RelativeAirSpeed]),
  };
}

function isTemperatureAxis(field: FieldKeyType): boolean {
  return field === FieldKey.DryBulbTemperature
    || field === FieldKey.MeanRadiantTemperature
    || field === FieldKey.OperativeTemperature;
}

function isAirSpeedAxis(field: FieldKeyType): boolean {
  return field === FieldKey.RelativeAirSpeed || field === FieldKey.WindSpeed;
}

function setAdaptiveAxisValue(
  payload: AdaptiveRequestDto,
  field: FieldKeyType,
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
    case FieldKey.PrevailingMeanOutdoorTemperature:
      payload.trm = valueSi;
      return;
    case FieldKey.RelativeAirSpeed:
    case FieldKey.WindSpeed:
      payload.v = valueSi;
      return;
    default:
      throw new Error(`Unsupported Adaptive chart field: ${field}`);
  }
}

function getAdaptiveAxisValue(
  declaration: AdaptiveModelDeclaration,
  payload: AdaptiveRequestDto,
  field: FieldKeyType,
): number {
  switch (field) {
    case FieldKey.DryBulbTemperature:
      return payload.tdb;
    case FieldKey.MeanRadiantTemperature:
      return payload.tr;
    case FieldKey.OperativeTemperature:
      return t_o(
        payload.tdb,
        payload.tr,
        payload.v,
        declaration.operativeTemperatureStandard,
      );
    case FieldKey.PrevailingMeanOutdoorTemperature:
      return payload.trm;
    case FieldKey.RelativeAirSpeed:
    case FieldKey.WindSpeed:
      return payload.v;
    default:
      throw new Error(`Unsupported Adaptive chart field: ${field}`);
  }
}

function addCoolingEffectTransitionPoints(
  declaration: AdaptiveModelDeclaration,
  airSpeed: number,
  range: { min: number; max: number },
): number[] {
  if (airSpeed < 0.6) return [];
  const epsilon = 0.001;
  return declaration.levels.flatMap(({ warmOffset }) => {
    const outdoorTemperature = (
      25 - warmOffset - declaration.coefficients.intercept
    ) / declaration.coefficients.slope;
    return outdoorTemperature > range.min && outdoorTemperature < range.max
      ? [outdoorTemperature - epsilon, outdoorTemperature + epsilon]
      : [];
  });
}

function getFieldValues(
  field: FieldKeyType,
  points: number,
  extraValues: readonly number[] = [],
): number[] {
  const meta = fieldMetaByKey[field];
  return [
    ...Array.from({ length: points }, (_, index) =>
      meta.minValue
      + ((meta.maxValue - meta.minValue) * index) / (points - 1)),
    ...extraValues.filter((value) => value > meta.minValue && value < meta.maxValue),
  ]
    .sort((left, right) => left - right)
    .filter((value, index, values) =>
      index === 0 || Math.abs(value - values[index - 1]) > 1e-6);
}

function solveOutdoorTemperatureBoundary(
  declaration: AdaptiveModelDeclaration,
  operativeTemperature: number,
  airSpeed: number,
  offset: number,
  isUpperBoundary: boolean,
): number {
  const { slope, intercept } = declaration.coefficients;
  const withoutCooling = (operativeTemperature - offset - intercept) / slope;
  if (!isUpperBoundary || getCe(airSpeed, operativeTemperature) === 0) {
    return withoutCooling;
  }

  const coolingEffect = getCe(airSpeed, 25);
  const withCooling = (
    operativeTemperature - offset - coolingEffect - intercept
  ) / slope;
  const unadjustedUpper = slope * withCooling + intercept + offset;
  return getCe(airSpeed, unadjustedUpper) === coolingEffect
    ? withCooling
    : (25 - offset - intercept) / slope;
}

function getOutdoorTemperatureBoundaries(
  declaration: AdaptiveModelDeclaration,
  operativeTemperature: number,
  airSpeed: number,
): number[] {
  return [
    ...declaration.levels
      .map(({ coolOffset }) => coolOffset)
      .sort((left, right) => left - right)
      .map((offset) => solveOutdoorTemperatureBoundary(
        declaration,
        operativeTemperature,
        airSpeed,
        offset,
        false,
      )),
    ...declaration.levels
      .map(({ warmOffset }) => warmOffset)
      .sort((left, right) => left - right)
      .map((offset) => solveOutdoorTemperatureBoundary(
        declaration,
        operativeTemperature,
        airSpeed,
        offset,
        true,
      )),
  ];
}

function getTemperatureAxisValueForOperativeTemperature(
  declaration: AdaptiveModelDeclaration,
  targetOperativeTemperature: number,
  temperatureAxis: FieldKeyType,
  baseline: AdaptiveRequestDto,
): number {
  if (temperatureAxis === FieldKey.OperativeTemperature) {
    return targetOperativeTemperature;
  }
  const meta = fieldMetaByKey[temperatureAxis];
  const getOperativeTemperature = (axisValue: number) => t_o(
    temperatureAxis === FieldKey.DryBulbTemperature ? axisValue : baseline.tdb,
    temperatureAxis === FieldKey.MeanRadiantTemperature ? axisValue : baseline.tr,
    baseline.v,
    declaration.operativeTemperatureStandard,
  );
  const minimumOperative = getOperativeTemperature(meta.minValue);
  const maximumOperative = getOperativeTemperature(meta.maxValue);
  if (Math.abs(maximumOperative - minimumOperative) < 1e-6) {
    throw new Error("Adaptive temperature axis cannot resolve operative temperature.");
  }
  return meta.minValue + (
    (targetOperativeTemperature - minimumOperative)
    * (meta.maxValue - meta.minValue)
  ) / (maximumOperative - minimumOperative);
}

function convertBoundaryValue(
  value: number | null,
  unitSystem: UnitSystemType,
): number {
  return value === null
    ? NaN
    : roundValue(
        convertFieldValueFromSi(FieldKey.DryBulbTemperature, value, unitSystem),
        1,
      );
}

function getAdaptiveHoverMetadata(
  declaration: AdaptiveModelDeclaration,
  result: AdaptiveResponseDto,
  unitSystem: UnitSystemType,
): unknown[] {
  const complianceLevel = getLevelResult(result, declaration.complianceLevelId);
  return [
    result.isApplicable && complianceLevel.accepted
      ? ComplianceStatus.Compliant
      : ComplianceStatus.NonCompliant,
    ...declaration.hoverLevelIds.flatMap((levelId) => {
      const level = getLevelResult(result, levelId);
      return [
        convertBoundaryValue(level.lower, unitSystem),
        convertBoundaryValue(level.upper, unitSystem),
      ];
    }),
  ];
}

function buildAdaptiveHoverTemplate(
  declaration: AdaptiveModelDeclaration,
  unitSystem: UnitSystemType,
  xAxis: ChartAxisScale,
  yAxis: ChartAxisScale,
  inputLabel: string | null = null,
  coordinateDecimals = 1,
): string {
  const boundaryUnits =
    fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
  const rows = declaration.hoverLevelIds.map((levelId, index) => {
    const level = declaration.levels.find(({ id }) => id === levelId);
    if (!level) throw new Error(`Unknown Adaptive hover level: ${levelId}`);
    const metadataIndex = 1 + index * 2;
    return `${level.label}: %{customdata[${metadataIndex}]:.1f} to %{customdata[${metadataIndex + 1}]:.1f} ${boundaryUnits}`;
  });
  return [
    inputLabel,
    `${xAxis.label}: %{x:.${coordinateDecimals}f} ${xAxis.units}`,
    `${yAxis.label}: %{y:.${coordinateDecimals}f} ${yAxis.units}`,
    ...rows,
  ].filter((row): row is string => row !== null).join("<br>")
    + "<extra></extra>";
}

function createAdaptiveLayout(
  title: string,
  showLegend: boolean,
  margin: Record<string, number>,
): ChartLayoutSpec {
  return {
    title,
    paperBgColor: CHART_COLORS.paper,
    plotBgColor: CHART_COLORS.plot,
    showLegend,
    margin,
    gridColor: CHART_COLORS.grid,
    legend: { orientation: "h", x: 0, y: 1.1 },
    height: 480,
  };
}

function getInputResult(
  declaration: AdaptiveModelDeclaration,
  payload: AdaptiveRequestDto,
  inputId: InputIdType,
  resultsByInput: Partial<Record<InputIdType, AdaptiveResponseDto | null>>,
): AdaptiveResponseDto {
  return resultsByInput[inputId] ?? calculateAdaptive(declaration, payload);
}

function createAdaptiveInputGroup(
  declaration: AdaptiveModelDeclaration,
  source: AdaptiveChartSourceDto,
  resultsByInput: Partial<Record<InputIdType, AdaptiveResponseDto | null>>,
  unitSystem: UnitSystemType,
  xAxis: ChartAxisScale,
  yAxis: ChartAxisScale,
  coordinateDecimals: number,
): FieldChartInputGroup<AdaptiveRequestDto, AdaptiveResponseDto> {
  return {
    inputsMap: source.inputs,
    resultsByInput,
    getXSi: (payload) => getAdaptiveAxisValue(declaration, payload, xAxis.field),
    getYSi: (payload) => getAdaptiveAxisValue(declaration, payload, yAxis.field),
    formatXDisplay: roundValue,
    formatYDisplay: roundValue,
    getHovertemplate: ({ inputLabel }) => buildAdaptiveHoverTemplate(
      declaration,
      unitSystem,
      xAxis,
      yAxis,
      inputLabel,
      coordinateDecimals,
    ),
    hoverMetadata: ({ payload, inputId }) => getAdaptiveHoverMetadata(
      declaration,
      getInputResult(declaration, payload, inputId, resultsByInput),
      unitSystem,
    ),
  };
}

function buildAdaptiveTooltipTrace(
  declaration: AdaptiveModelDeclaration,
  baseline: AdaptiveRequestDto,
  unitSystem: UnitSystemType,
  xAxis: ChartAxisScale,
  yAxis: ChartAxisScale,
): PlotTraceDto {
  return buildTooltipGridTrace({
    xAxis: { ...xAxis, points: TOOLTIP_GRID_POINTS },
    yAxis: { ...yAxis, points: TOOLTIP_GRID_POINTS },
    colorscale: TRANSPARENT_COLORSCALE,
    hovertemplate: buildAdaptiveHoverTemplate(
      declaration,
      unitSystem,
      xAxis,
      yAxis,
    ),
    getHoverMetadata: (xSi, ySi) => {
      const request = { ...baseline };
      setAdaptiveAxisValue(request, xAxis.field, xSi);
      setAdaptiveAxisValue(request, yAxis.field, ySi);
      const evaluation = tryEvaluateAdaptiveForChart(declaration, request);
      return evaluation
        ? getAdaptiveHoverMetadata(declaration, evaluation.result, unitSystem)
        : [NaN];
    },
  });
}

function buildAdaptiveBandTraces(
  declaration: AdaptiveModelDeclaration,
  baseline: AdaptiveRequestDto,
  unitSystem: UnitSystemType,
  variableValues: number[],
  boundaryCurves: number[][],
  bands: readonly ThermalZone[],
  variableAxis: ChartAxisScale,
  boundaryAxis: ChartAxisScale,
  variableDimension: "x" | "y",
  xAxis: ChartAxisScale,
  yAxis: ChartAxisScale,
): PlotTraceDto[] {
  return buildBoundaryRegionTraces({
    variableValuesSi: variableValues,
    boundaryCurvesSi: boundaryCurves,
    bands: [...bands],
    variableAxis,
    boundaryAxis,
    variableDimension,
    boundaryRangeSi: boundaryAxis.rangeSi,
    getHoverMetadata: (xSi, ySi) => {
      const request = { ...baseline };
      setAdaptiveAxisValue(request, xAxis.field, xSi);
      setAdaptiveAxisValue(request, yAxis.field, ySi);
      const evaluation = tryEvaluateAdaptiveForChart(declaration, request);
      return evaluation
        ? getAdaptiveHoverMetadata(declaration, evaluation.result, unitSystem)
        : [NaN];
    },
    buildTrace: ({ band, polygonX, polygonY, hoverMetadata }) =>
      buildFilledBoundaryRegionTrace({
        name: band.label,
        color: band.color,
        polygonX,
        polygonY,
        lineColor: CHART_COLORS.line,
        hoverMetadata,
      }),
  });
}

function buildOutdoorTemperatureDynamicTraces(
  declaration: AdaptiveModelDeclaration,
  baseline: AdaptiveRequestDto,
  unitSystem: UnitSystemType,
  xAxis: ChartAxisScale,
  yAxis: ChartAxisScale,
): PlotTraceDto[] {
  const hasOutdoorXAxis =
    xAxis.field === FieldKey.PrevailingMeanOutdoorTemperature;
  const otherAxis = hasOutdoorXAxis ? yAxis : xAxis;
  const outdoorAxis = hasOutdoorXAxis ? xAxis : yAxis;
  const hoverXAxis = hasOutdoorXAxis
    ? { ...xAxis, label: declaration.outdoorTemperatureLabel }
    : xAxis;
  const hoverYAxis = hasOutdoorXAxis
    ? yAxis
    : { ...yAxis, label: declaration.outdoorTemperatureLabel };
  const tooltip = buildAdaptiveTooltipTrace(
    declaration,
    baseline,
    unitSystem,
    hoverXAxis,
    hoverYAxis,
  );

  if (isTemperatureAxis(otherAxis.field)) {
    const range = declaration.outdoorTemperatureRangeSi;
    const outdoorValues = [
      ...Array.from({ length: DYNAMIC_BOUNDARY_POINTS }, (_, index) =>
        range.min + ((range.max - range.min) * index) / (DYNAMIC_BOUNDARY_POINTS - 1)),
      ...addCoolingEffectTransitionPoints(declaration, baseline.v, range),
    ]
      .sort((left, right) => left - right)
      .filter((value, index, values) =>
        index === 0 || Math.abs(value - values[index - 1]) > 1e-6);
    const firstBoundaries = getAdaptiveTemperatureBoundaries(
      declaration,
      outdoorValues[0],
      baseline.v,
    );
    const boundaryCurves = firstBoundaries.map((_, boundaryIndex) =>
      outdoorValues.map((outdoorTemperature) => {
        const target = getAdaptiveTemperatureBoundaries(
          declaration,
          outdoorTemperature,
          baseline.v,
        )[boundaryIndex];
        return getTemperatureAxisValueForOperativeTemperature(
          declaration,
          target,
          otherAxis.field,
          baseline,
        );
      }));
    return [
      tooltip,
      ...buildAdaptiveBandTraces(
        declaration,
        baseline,
        unitSystem,
        outdoorValues,
        boundaryCurves,
        declaration.bandSequence,
        outdoorAxis,
        otherAxis,
        hasOutdoorXAxis ? "x" : "y",
        xAxis,
        yAxis,
      ),
    ];
  }

  if (isAirSpeedAxis(otherAxis.field)) {
    const speedValues = getFieldValues(
      otherAxis.field,
      DYNAMIC_BOUNDARY_POINTS,
      COOLING_EFFECT_SPEED_BREAKPOINTS,
    );
    const firstOperativeTemperature = t_o(
      baseline.tdb,
      baseline.tr,
      speedValues[0],
      declaration.operativeTemperatureStandard,
    );
    const firstBoundaries = getOutdoorTemperatureBoundaries(
      declaration,
      firstOperativeTemperature,
      speedValues[0],
    );
    const boundaryCurves = firstBoundaries.map((_, boundaryIndex) =>
      speedValues.map((speed) => {
        const operativeTemperature = t_o(
          baseline.tdb,
          baseline.tr,
          speed,
          declaration.operativeTemperatureStandard,
        );
        return getOutdoorTemperatureBoundaries(
          declaration,
          operativeTemperature,
          speed,
        )[boundaryIndex];
      })).reverse();
    return [
      tooltip,
      ...buildAdaptiveBandTraces(
        declaration,
        baseline,
        unitSystem,
        speedValues,
        boundaryCurves,
        [...declaration.bandSequence].reverse(),
        otherAxis,
        outdoorAxis,
        hasOutdoorXAxis ? "y" : "x",
        xAxis,
        yAxis,
      ),
    ];
  }

  throw new Error(`Unsupported Adaptive outdoor axis pair: ${xAxis.field} / ${yAxis.field}`);
}

export function buildAdaptiveChart(
  declaration: AdaptiveModelDeclaration,
  source: AdaptiveChartSourceDto,
  resultsByInput: Partial<Record<InputIdType, AdaptiveResponseDto | null>>,
  context: ChartBuildContext,
): PlotlyChartResponseDto {
  const baseline = getBaselineInputEntry(source.inputs, context.baselineInputId);
  const { unitSystem } = context;
  const temperatureUnits =
    fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
  const xAxis = createFieldAxisScale({
    field: FieldKey.PrevailingMeanOutdoorTemperature,
    unitSystem,
    rangeSi: declaration.outdoorTemperatureRangeSi,
    points: 2,
    label: declaration.outdoorTemperatureLabel,
    units: temperatureUnits,
  });
  const yAxis = createFieldAxisScale({
    field: FieldKey.OperativeTemperature,
    unitSystem,
    rangeSi: FIXED_OPERATIVE_RANGE_SI,
    points: 2,
    units: temperatureUnits,
  });
  const range = declaration.outdoorTemperatureRangeSi;
  const outdoorValues = [
    ...Array.from({ length: FIXED_BOUNDARY_POINTS }, (_, index) =>
      range.min + ((range.max - range.min) * index) / (FIXED_BOUNDARY_POINTS - 1)),
    ...addCoolingEffectTransitionPoints(declaration, baseline.payload.v, range),
  ].sort((left, right) => left - right);
  const boundaryTraces = declaration.levels.map((level) => {
    const boundaries = outdoorValues.map((outdoorTemperature) =>
      getLevelBoundaries(
        declaration,
        level,
        outdoorTemperature,
        baseline.payload.v,
      ));
    return buildClosedBoundaryPolygonTrace({
      lowerXValuesSi: outdoorValues,
      lowerYValuesSi: boundaries.map(({ lower }) => lower),
      upperXValuesSi: outdoorValues,
      upperYValuesSi: boundaries.map(({ upper }) => upper),
      xAxis,
      yAxis,
      buildTrace: ({ polygonX, polygonY }) => buildComfortPolygonTrace({
        inputId: baseline.inputId,
        nameSuffix: level.label,
        polygonX: polygonX.map((value) => roundValue(value)),
        polygonY: polygonY.map((value) => roundValue(value)),
        hovertemplate: "",
        hoverinfo: "skip",
        isZone: true,
      }),
    });
  });
  const inputGroup = createAdaptiveInputGroup(
    declaration,
    source,
    resultsByInput,
    unitSystem,
    xAxis,
    yAxis,
    1,
  );

  return buildFieldChart({
    xAxis,
    yAxis,
    leadingTraces: [buildAdaptiveTooltipTrace(
      declaration,
      baseline.payload,
      unitSystem,
      xAxis,
      yAxis,
    )],
    strategyTraces: boundaryTraces,
    inputGroups: [inputGroup],
    layout: createAdaptiveLayout(
      `${declaration.label} Comfort Chart`,
      shouldShowInputLegend(source.inputs),
      { l: 56, r: 24, t: 48, b: 80 },
    ),
    source: CalculationSource.FrontendGenerated,
  });
}

function assertDynamicAxes(context: ChartBuildContext): {
  xAxis: FieldKeyType;
  yAxis: FieldKeyType;
} {
  const { xAxis, yAxis } = context.dynamicAxes;
  if (
    xAxis === yAxis
    || !ADAPTIVE_DYNAMIC_AXIS_FIELDS.includes(
      xAxis as typeof ADAPTIVE_DYNAMIC_AXIS_FIELDS[number],
    )
    || !ADAPTIVE_DYNAMIC_AXIS_FIELDS.includes(
      yAxis as typeof ADAPTIVE_DYNAMIC_AXIS_FIELDS[number],
    )
  ) {
    throw new Error(`Unsupported Adaptive dynamic axis pair: ${xAxis} / ${yAxis}.`);
  }
  return { xAxis, yAxis };
}

export function buildAdaptiveDynamicChart(
  declaration: AdaptiveModelDeclaration,
  source: AdaptiveChartSourceDto,
  resultsByInput: Partial<Record<InputIdType, AdaptiveResponseDto | null>>,
  context: ChartBuildContext,
): PlotlyChartResponseDto {
  const fields = assertDynamicAxes(context);
  const baseline = getBaselineInputEntry(source.inputs, context.baselineInputId);
  const { unitSystem } = context;
  const xAxis = createFieldAxisScale({
    field: fields.xAxis,
    unitSystem,
    points: DYNAMIC_GRID_POINTS,
    rangeSi: fields.xAxis === FieldKey.PrevailingMeanOutdoorTemperature
      ? declaration.outdoorTemperatureRangeSi
      : undefined,
  });
  const yAxis = createFieldAxisScale({
    field: fields.yAxis,
    unitSystem,
    points: DYNAMIC_GRID_POINTS,
    rangeSi: fields.yAxis === FieldKey.PrevailingMeanOutdoorTemperature
      ? declaration.outdoorTemperatureRangeSi
      : undefined,
  });
  const inputGroup = createAdaptiveInputGroup(
    declaration,
    source,
    resultsByInput,
    unitSystem,
    xAxis,
    yAxis,
    2,
  );
  const layout = createAdaptiveLayout(
    `${declaration.label} Dynamic Chart (${xAxis.label} vs ${yAxis.label})`,
    shouldShowInputLegend(source.inputs),
    { l: 64, r: 24, t: 48, b: 64 },
  );
  const hasOutdoorAxis = fields.xAxis === FieldKey.PrevailingMeanOutdoorTemperature
    || fields.yAxis === FieldKey.PrevailingMeanOutdoorTemperature;
  if (hasOutdoorAxis) {
    const [tooltipTrace, ...boundaryTraces] = buildOutdoorTemperatureDynamicTraces(
      declaration,
      baseline.payload,
      unitSystem,
      xAxis,
      yAxis,
    );
    return buildFieldChart({
      xAxis,
      yAxis,
      leadingTraces: [tooltipTrace],
      strategyTraces: boundaryTraces,
      inputGroups: [inputGroup],
      layout,
      source: CalculationSource.FrontendGenerated,
    });
  }

  const axisAdapter: DynamicAxisPayloadAdapter<AdaptiveRequestDto> = {
    setAxisValue: setAdaptiveAxisValue,
    getAxisValue: (request, field) => getAdaptiveAxisValue(
      declaration,
      request,
      field,
    ),
    getOperativeTemperature: (request) => t_o(
      request.tdb,
      request.tr,
      request.v,
      declaration.operativeTemperatureStandard,
    ),
    getTemperatureComponentRange: (field) => ({
      min: fieldMetaByKey[field].minValue,
      max: fieldMetaByKey[field].maxValue,
    }),
  };
  const grid: GridFieldChartStrategy = {
    evaluatePoint: (xSi, ySi) => {
      const request = { ...baseline.payload };
      const hasValidCoordinates = applyDynamicAxisCoordinates(
        request,
        { field: fields.xAxis, valueSi: xSi },
        { field: fields.yAxis, valueSi: ySi },
        axisAdapter,
      );
      if (!hasValidCoordinates) return null;
      const evaluation = tryEvaluateAdaptiveForChart(declaration, request);
      if (!evaluation) return null;
      const zone = getDynamicZone(declaration, evaluation);
      return zone
        ? {
            z: zone.z,
            text: zone.label,
            hoverMetadata: getAdaptiveHoverMetadata(
              declaration,
              evaluation.result,
              unitSystem,
            ),
          }
        : null;
    },
    layers: buildZoneContourLayers({
      name: "Adaptive Zones",
      colorscale: buildZoneColorscale(declaration.bandSequence),
      contours: ADAPTIVE_CONTOURS,
      zmin: 1.5,
      zmax: declaration.bandSequence.length + 0.5,
      hovertemplate: buildAdaptiveHoverTemplate(
        declaration,
        unitSystem,
        xAxis,
        yAxis,
      ),
      opacity: 0.75,
      isBackgroundZone: true,
    }),
  };

  return buildGridFieldChart({
    xAxis,
    yAxis,
    grid,
    inputGroups: [inputGroup],
    layout,
    source: CalculationSource.FrontendGenerated,
  });
}

export function createAdaptiveComplianceBands(
  declaration: AdaptiveBoundaryDefinition,
): readonly Band[] {
  return declaration.bandSequence.map((zone, index): Band => ({
    min: index === 0
      ? -Infinity
      : (xValueSi, inputsSi) => getAdaptiveTemperatureBoundaries(
          declaration,
          xValueSi,
          inputsSi[FieldKey.RelativeAirSpeed],
        )[index - 1],
    max: index === declaration.bandSequence.length - 1
      ? Infinity
      : (xValueSi, inputsSi) => getAdaptiveTemperatureBoundaries(
          declaration,
          xValueSi,
          inputsSi[FieldKey.RelativeAirSpeed],
        )[index],
    label: zone.label,
    color: zone.color,
  }));
}

function buildAdaptiveResultRows(
  declaration: AdaptiveModelDeclaration,
  unitSystem: UnitSystemType,
): ResultRowDefinition<AdaptiveResponseDto>[] {
  const temperatureUnits =
    fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
  return [
    {
      title: "Compliance",
      formatter: (result) => {
        const complianceLevel = getLevelResult(
          result,
          declaration.complianceLevelId,
        );
        const isCompliant = result.isApplicable && complianceLevel.accepted;
        return {
          text: !result.isApplicable
            ? ComplianceStatus.OutOfRange
            : isCompliant
              ? ComplianceStatus.Compliant
              : ComplianceStatus.NonCompliant,
          color: isCompliant
            ? declaration.complianceColors.compliant
            : declaration.complianceColors.nonCompliant,
        };
      },
    },
    ...declaration.levels.map((definition): ResultRowDefinition<AdaptiveResponseDto> => ({
      title: definition.label,
      formatter: (result) => {
        const level = getLevelResult(result, definition.id);
        if (level.status === null || level.lower === null || level.upper === null) {
          return { text: "N/A", color: declaration.colorByStatus["N/A"] ?? "" };
        }
        const lower = convertFieldValueFromSi(
          FieldKey.DryBulbTemperature,
          level.lower,
          unitSystem,
        );
        const upper = convertFieldValueFromSi(
          FieldKey.DryBulbTemperature,
          level.upper,
          unitSystem,
        );
        return {
          text: level.status,
          subtext: `${lower.toFixed(1)} ~ ${upper.toFixed(1)} ${temperatureUnits}`,
          color: declaration.colorByStatus[level.status] ?? "",
        };
      },
    })),
  ];
}

export function createAdaptiveModelConfig(
  declaration: AdaptiveModelDeclaration,
) {
  const builder = new ComfortModelBuilder<
    AdaptiveResponseDto,
    AdaptiveChartSourceDto
  >(declaration.modelId);
  const temperatureBehavior = createTemperatureControlBehavior(
    InputControlId.Temperature,
  );
  const airSpeedBehavior = createControlBehavior({
    controlId: InputControlId.AirSpeed,
    fieldKey: FieldKey.RelativeAirSpeed,
    presetOptions: [...declaration.airSpeedPresets],
    getPresentation: (context, meta) => ({
      ...buildDefaultPresentation(context, meta),
      label: "Air speed",
    }),
  });

  builder
    .setLabel(declaration.label)
    .setDescription(declaration.description)
    .setModes(declaration.modes)
    .setChartableOutputs(declaration.chartableOutputs)
    .setComplianceSpec(declaration.complianceSpec)
    .addControl({ id: InputControlId.Temperature, behavior: temperatureBehavior })
    .addControl({
      id: InputControlId.RadiantTemperature,
      behavior: createControlBehavior({
        controlId: InputControlId.RadiantTemperature,
        fieldKey: FieldKey.MeanRadiantTemperature,
        hidden: (context) =>
          context.options[OptionKey.TemperatureMode] !== TemperatureMode.Air,
        getPresentation: (context, meta) => ({
          ...buildDefaultPresentation(context, meta),
          label: "Mean radiant temperature",
        }),
      }),
    })
    .addControl({
      id: InputControlId.PrevailingMeanOutdoorTemperature,
      behavior: createControlBehavior({
        controlId: InputControlId.PrevailingMeanOutdoorTemperature,
        fieldKey: FieldKey.PrevailingMeanOutdoorTemperature,
        getPresentation: (context, meta) => ({
          ...buildDefaultPresentation(context, meta),
          label: declaration.outdoorTemperatureLabel,
        }),
      }),
    })
    .addControl({ id: InputControlId.AirSpeed, behavior: airSpeedBehavior })
    .addOptionHandler(OptionKey.TemperatureMode, (context, nextValue) =>
      temperatureBehavior.applyOptionChange?.(
        context,
        OptionKey.TemperatureMode,
        nextValue,
      ) ?? null)
    .setDefaultOptions({
      ...defaultAdaptiveOptions,
      [OptionKey.TemperatureMode]: TemperatureMode.Operative,
    })
    .setDefaultChart(ChartId.Adaptive, [ChartId.Adaptive, ChartId.AdaptiveDynamic])
    .setOptionNormalizer(normalizeAdaptiveOptionsSnapshot)
    .setDynamicAxisFields([...ADAPTIVE_DYNAMIC_AXIS_FIELDS])
    .setDefaultDynamicAxes({
      xAxis: FieldKey.DryBulbTemperature,
      yAxis: FieldKey.PrevailingMeanOutdoorTemperature,
    })
    .setCalculator((context, visibleInputIds) => {
      const resultsByInput = createEmptyResults<AdaptiveResponseDto>();
      const inputs: CompareInputMap<AdaptiveRequestDto> = {};
      for (const inputId of visibleInputIds) {
        const request = toAdaptiveRequest(context, inputId, declaration);
        inputs[inputId] = request;
        resultsByInput[inputId] = calculateAdaptive(declaration, request);
      }
      return { resultsByInput, chartSource: { inputs } };
    })
    .setResultBuilder((results, visibleInputIds, unitSystem) =>
      buildResultSectionsFromRows(
        buildAdaptiveResultRows(declaration, unitSystem),
        results,
        visibleInputIds,
      ))
    .setChartBuilder((chartId, chartSource, resultsByInput, context) => {
      if (!chartSource) return null;
      if (chartId === ChartId.Adaptive) {
        return buildAdaptiveChart(
          declaration,
          chartSource,
          resultsByInput,
          context,
        );
      }
      if (chartId === ChartId.AdaptiveDynamic) {
        return buildAdaptiveDynamicChart(
          declaration,
          chartSource,
          resultsByInput,
          context,
        );
      }
      return null;
    })
    .setZones([...declaration.zones])
    .setLegendChartIds([ChartId.Adaptive, ChartId.AdaptiveDynamic])
    .setLegendTitle("Adaptive Zones")
    .setLockYAxisChartIds([]);

  return builder.build();
}
