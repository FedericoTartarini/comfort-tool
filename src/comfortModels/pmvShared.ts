/**
 * @file pmvShared.ts
 * @description Shared configuration, calculation, and charting support for PMV model declarations.
 */

import { units_converter, psy_ta_rh, p_sat } from "jsthermalcomfort";

import { CalculationSource, type ComfortStandard } from "../models/calculationMetadata";
import {
  ComfortModel,
  comfortModelMetaById,
  ComplianceStatus,
  type JsThermalComfortStandard,
} from "../models/comfortModels";
import { ChartId, type ChartId as ChartIdType } from "../models/chartOptions";
import { FieldKey } from "../models/fieldKeys";
import { fieldMetaByKey } from "../models/inputFieldsMeta";
import { InputControlId } from "../models/inputControls";
import { ThermalZone } from "../models/thermalZone";
import {
  bandsFromThermalZones,
  ChartMode,
  findNumericBandIndexForValue,
  ModelOutputKey,
  type Band,
  type ChartMode as ChartModeType,
  type ComplianceSpec,
  type ExploreFieldChartConfig,
  type FieldChartConfig,
  type ModelOutput,
  type NumericBand,
} from "../models/modelCapabilities";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../models/units";
import { type InputId as InputIdType } from "../models/inputSlots";
import type {
  CompareInputMap,
  ComfortPointDto,
  PlotlyChartResponseDto,
  PlotTraceDto,
} from "../models/comfortDtos";

import {
  AirSpeedControlMode,
  AirSpeedInputMode,
  HumidityInputMode,
  OptionKey,
  type OptionKey as OptionKeyType,
  TemperatureMode,
  defaultPmvOptions,
  type PmvModelOptions,
} from "../models/inputModes";

import {
  normalizePmvOptions,
  synchronizePmvInputState,
} from "../services/comfort/syncState";

import {
  createAirSpeedControlBehavior,
  createControlBehavior,
  createHumidityControlBehavior,
  createTemperatureControlBehavior,
} from "../services/comfort/controls/controlBehaviors";

import { createSingleInputPatch, type InputControlBehavior } from "../services/comfort/controls/types";
import { clothingTypicalEnsembles, metabolicActivityOptions } from "../services/comfort/referenceValues";
import {
  convertFieldValueFromSi,
  convertFieldValueToSi,
  convertHumidityRatioFromSi,
  convertHumidityRatioToSi,
  formatDisplayValue,
  getHumidityRatioDisplayMeta,
} from "../services/units/index";
import {
  ComfortModelBuilder,
  isRecord,
  createEmptyResults,
  buildResultSectionsFromRows,
  type ResultRowDefinition,
} from "../state/comfortTool/modelConfigs/builder";
import { roundValue } from "../services/comfort/helpers";
import { buildComfortPolygonTrace, buildLineTrace } from "../services/comfort/charts/plotlyBuilders";
import { createFieldAxisScale } from "../services/comfort/charts/axis";
import {
  buildBandedGridFieldChart,
  buildGridContourFieldChart,
  GridBandRenderStrategy,
  type GridFieldChartStrategy,
} from "../services/comfort/charts/chartEngine";
import { buildClosedBoundaryPolygon } from "../services/comfort/charts/boundaryRegionEngine";
import { applyDynamicAxisCoordinates } from "../services/comfort/charts/dynamicAxisPayload";
import {
  resolveBaselineInputEntry,
  shouldShowInputLegend,
  type BuildInputTraceGroupsOptions,
} from "../services/comfort/charts/inputPoints";
import { buildZoneColorscale, buildZoneContourLayers } from "../services/comfort/charts/zoneGrid";
import type { ChartAxisScale } from "../services/comfort/charts/types";

// ── Constants ──────────────────────────────────────────

// These exact bounds are used as a search bracket for finding PMV roots (comfort zone boundaries).
const COMFORT_ZONE_MIN_DRY_BULB = -20;
const COMFORT_ZONE_MAX_DRY_BULB = 80;
const ROOT_SCAN_POINTS = 101;
const ROOT_REFINE_POINTS = 7;
const ROOT_MAX_REFINEMENTS = 9;
const ROOT_TOLERANCE = 5e-4;

/**
 * Standard atmospheric pressure at sea level in Pascals (Pa).
 */
const STANDARD_ATM_PRESSURE_PA = 101325;

/**
 * Saturated water vapor to dry air molecular weight ratio constant 
 * (approx. 18.015 / 28.964) under standard conditions.
 */
const WATER_VAPOR_MOLECULAR_WEIGHT_RATIO = 0.62198;

/**
 * Resolution grid size (number of points) along the X and Y axes for generating 
 * background contours in both psychrometric and dynamic PMV charts.
 */
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

/**
 * Standard colors used across the PMV charts layout.
 */
const CHART_COLOR_WHITE = "#ffffff";
const CHART_COLOR_PLOT_BG = "#f8fafc";
const CHART_COLOR_GRIDLINE = "#e2e8f0";
const CHART_COLOR_BOUNDARY_LINE = "#333333";
const CHART_COLOR_RH_LINE = "#94a3b8";

const COLOR_COMPLIANT_GREEN = "#047857";
const COLOR_NON_COMPLIANT_RED = "#dc2626";

// ── Thermal Zones Definition ──────────────────────────

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

export type PmvModelId = typeof ComfortModel.PmvAshrae | typeof ComfortModel.PmvIso;

export interface PmvStandardAdapter {
  readonly modelId: PmvModelId;
  readonly calculationStandard: JsThermalComfortStandard;
  readonly resultStandard: ComfortStandard;
  readonly clothingInsulationMaxSi: number;
  readonly supportsOccupantAirSpeedControl: boolean;
  readonly calculate: (request: PmvRequestDto) => { pmv: number; ppd: number };
  readonly checkApplicability: (request: PmvRequestDto) => readonly string[];
  readonly getOperativeTemperature: (request: PmvRequestDto) => number;
}

export interface PmvModelDeclaration {
  readonly adapter: PmvStandardAdapter;
  readonly modes: readonly ChartModeType[];
  readonly chartableOutputs: readonly ModelOutput[];
  readonly complianceSpec: ComplianceSpec;
}

const pmvExploreBands = bandsFromThermalZones(pmvZonesList);

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

export const pmvChartableOutputs: readonly ModelOutput[] = [
  {
    key: ModelOutputKey.Pmv,
    label: "PMV",
    legendTitle: "PMV Zones",
    defaultBands: pmvExploreBands,
  },
  {
    key: ModelOutputKey.Ppd,
    label: "PPD (%)",
    legendTitle: "PPD Bands",
    unit: "%",
    defaultBands: ppdExploreBands,
  },
];

type TemperatureBracket =
  | { exactTemperature: number }
  | { low: number; high: number };

/**
 * Returns the ThermalZone metadata for a PMV value if it falls within the 
 * defined comfort zones, otherwise it returns the Neutral zone.
 */
export function getPmvZoneMeta(pmv: number): ThermalZone {
  if (isNaN(pmv)) return pmvZonesList[3]; // Neutral
  return pmvZonesList.find((zone) => zone.contains(pmv)) ?? pmvZonesList[3];
}

// ── Data Transfer Object (DTOs) ──────────────────────────

export interface PmvRequestDto {
  tdb: number;
  tr: number;
  vr: number;
  rh: number;
  met: number;
  clo: number;
  wme: number;
  occupantHasAirSpeedControl: boolean;
  standard: JsThermalComfortStandard;
  units: UnitSystemType;
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

export function calculateComfortZone(
  adapter: PmvStandardAdapter,
  payload: ComfortZoneRequestDto,
): ComfortZoneResponseDto {
  assertPmvRequestStandard(adapter, payload);
  const rhMinimum = Math.min(payload.rhMin, payload.rhMax);
  const rhMaximum = Math.max(payload.rhMin, payload.rhMax);
  const rhValues =
    payload.rhPoints === 1
      ? [rhMinimum]
      : Array.from({ length: payload.rhPoints }, (_, index) => (
        rhMinimum + ((rhMaximum - rhMinimum) * index) / (payload.rhPoints - 1)
      ));

  const coolEdge: ComfortPointDto[] = [];
  const warmEdge: ComfortPointDto[] = [];

  rhValues.forEach((relativeHumidity) => {
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

    if (coolTemperature === null || warmTemperature === null) {
      return;
    }

    coolEdge.push({
      tdb: coolTemperature,
      rh: relativeHumidity,
    });
    warmEdge.push({
      tdb: warmTemperature,
      rh: relativeHumidity,
    });
  });

  return {
    coolEdge,
    warmEdge,
    source: CalculationSource.FrontendGenerated,
  };
}

export interface PmvResponseDto {
  pmv: number;
  ppd: number;
  vr: number;
  isCompliant: boolean;
  standard: ComfortStandard;
  source: CalculationSource;
}

interface ChartRangeDto {
  tdbMin: number;
  tdbMax: number;
  tdbPoints: number;
  humidityRatioMin: number;
  humidityRatioMax: number;
}

export interface PmvChartInputsRequestDto {
  inputs: CompareInputMap<ComfortZoneRequestDto>;
  chartRange: ChartRangeDto;
  rhCurves: number[];
}

export interface PmvChartSourceDto {
  modelId: PmvModelId;
  chartRequest: PmvChartInputsRequestDto;
  comfortZonesByInput: CompareInputMap<ComfortZoneResponseDto>;
  baselineInputId?: InputIdType;
}

// ── Math Calculations & Solvers ──────────────────────

function assertPmvRequestStandard(
  adapter: PmvStandardAdapter,
  payload: PmvRequestDto,
): void {
  if (payload.standard !== adapter.calculationStandard) {
    throw new Error(
      `PMV adapter ${adapter.modelId} cannot evaluate a ${payload.standard} request.`,
    );
  }
}

function assertPmvChartSource(
  adapter: PmvStandardAdapter,
  chartSource: PmvChartSourceDto,
): void {
  if (chartSource.modelId !== adapter.modelId) {
    throw new Error(
      `PMV adapter ${adapter.modelId} cannot build a chart for ${chartSource.modelId}.`,
    );
  }

  Object.values(chartSource.chartRequest.inputs).forEach((request) => {
    if (request) {
      assertPmvRequestStandard(adapter, request);
    }
  });
}

function calculatePmvValues(
  adapter: PmvStandardAdapter,
  payload: PmvRequestDto,
): { pmv: number; ppd: number } {
  assertPmvRequestStandard(adapter, payload);
  return adapter.calculate(payload);
}

/**
 * Scans a range of temperatures sequentially to locate a bracket where the target PMV root crosses zero.
 */
function findTemperatureBracket(
  adapter: PmvStandardAdapter,
  targetPmv: number,
  rh: number,
  payload: PmvRequestDto,
  minimum: number,
  maximum: number,
  pointCount: number,
): TemperatureBracket | null {
  let previousTemperature: number | null = null;
  let previousDelta: number | null = null;

  for (let index = 0; index < pointCount; index += 1) {
    const temperature = minimum + ((maximum - minimum) * index) / (pointCount - 1);
    const evaluationPayload = {
      ...payload,
      tdb: temperature,
      rh,
    };
    const normalizedPayload = evaluationPayload.units === UnitSystem.SI
      ? evaluationPayload
      : {
        ...evaluationPayload,
        ...units_converter(
          {
            tdb: evaluationPayload.tdb,
            tr: evaluationPayload.tr,
            vr: evaluationPayload.vr,
          },
          evaluationPayload.units,
        ),
        units: UnitSystem.SI,
      };

    const pmv = calculatePmvValues(adapter, normalizedPayload).pmv;
    const delta = Number.isFinite(pmv) ? pmv - targetPmv : null;

    if (delta === null) {
      previousTemperature = null;
      previousDelta = null;
      continue;
    }

    if (Math.abs(delta) < ROOT_TOLERANCE) {
      return { exactTemperature: temperature };
    }

    if (previousTemperature !== null && previousDelta !== null && previousDelta * delta <= 0) {
      return {
        low: previousTemperature,
        high: temperature,
      };
    }

    previousTemperature = temperature;
    previousDelta = delta;
  }

  return null;
}

/**
 * Solves for the dry bulb temperature that results in a target PMV value at a given RH.
 */
export function solveDryBulbForTargetPmv(
  adapter: PmvStandardAdapter,
  targetPmv: number,
  rh: number,
  payload: PmvRequestDto,
): number | null {
  const initialBracket = findTemperatureBracket(
    adapter,
    targetPmv,
    rh,
    payload,
    COMFORT_ZONE_MIN_DRY_BULB,
    COMFORT_ZONE_MAX_DRY_BULB,
    ROOT_SCAN_POINTS,
  );

  if (!initialBracket) {
    return null;
  }

  if ("exactTemperature" in initialBracket) {
    return initialBracket.exactTemperature;
  }

  let currentBracket = initialBracket;

  for (let index = 0; index < ROOT_MAX_REFINEMENTS; index += 1) {
    const refinedBracket = findTemperatureBracket(
      adapter,
      targetPmv,
      rh,
      payload,
      currentBracket.low,
      currentBracket.high,
      ROOT_REFINE_POINTS,
    );

    if (!refinedBracket) {
      break;
    }

    if ("exactTemperature" in refinedBracket) {
      return refinedBracket.exactTemperature;
    }

    currentBracket = refinedBracket;
  }

  return (currentBracket.low + currentBracket.high) / 2;
}

// ── Option Normalization and Synchronizers ──────────────────────────

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

function normalizePmvOptionsSnapshot(value: unknown) {
  if (!isRecord(value)) {
    return Object.assign({}, defaultPmvOptions);
  }

  const nextTemperatureMode = value[OptionKey.TemperatureMode];
  const nextAirSpeedControlMode = value[OptionKey.AirSpeedControlMode];
  const nextAirSpeedInputMode = value[OptionKey.AirSpeedInputMode];
  const nextHumidityInputMode = value[OptionKey.HumidityInputMode];

  if (nextTemperatureMode !== undefined && !temperatureModeValues.has(String(nextTemperatureMode))) {
    return null;
  }
  if (nextAirSpeedControlMode !== undefined && !airSpeedControlModeValues.has(String(nextAirSpeedControlMode))) {
    return null;
  }
  if (nextAirSpeedInputMode !== undefined && !airSpeedInputModeValues.has(String(nextAirSpeedInputMode))) {
    return null;
  }
  if (nextHumidityInputMode !== undefined && !humidityInputModeValues.has(String(nextHumidityInputMode))) {
    return null;
  }

  const options: PmvModelOptions = Object.assign({}, defaultPmvOptions);

  if (nextTemperatureMode !== undefined) {
    options[OptionKey.TemperatureMode] = nextTemperatureMode as TemperatureMode;
  }
  if (nextAirSpeedControlMode !== undefined) {
    options[OptionKey.AirSpeedControlMode] = nextAirSpeedControlMode as AirSpeedControlMode;
  }
  if (nextAirSpeedInputMode !== undefined) {
    options[OptionKey.AirSpeedInputMode] = nextAirSpeedInputMode as AirSpeedInputMode;
  }
  if (nextHumidityInputMode !== undefined) {
    options[OptionKey.HumidityInputMode] = nextHumidityInputMode as HumidityInputMode;
  }

  return options;
}

function toPmvRequest(
  state: any,
  inputId: InputIdType,
  adapter: PmvStandardAdapter,
): PmvRequestDto {
  const inputs = state.inputsByInput[inputId];
  const options = normalizePmvOptionsSnapshot(
    state.ui.modelOptionsByModel[adapter.modelId],
  ) || defaultPmvOptions;

  const tdb = Number(inputs[FieldKey.DryBulbTemperature]);
  const tr = options[OptionKey.TemperatureMode] === TemperatureMode.Operative
    ? tdb
    : Number(inputs[FieldKey.MeanRadiantTemperature]);

  return {
    tdb,
    tr,
    vr: Number(inputs[FieldKey.RelativeAirSpeed]),
    rh: Number(inputs[FieldKey.RelativeHumidity]),
    met: Number(inputs[FieldKey.MetabolicRate]),
    clo: Number(inputs[FieldKey.ClothingInsulation]),
    wme: Number(inputs[FieldKey.ExternalWork]),
    occupantHasAirSpeedControl: adapter.supportsOccupantAirSpeedControl &&
      options[OptionKey.AirSpeedControlMode] === AirSpeedControlMode.WithLocalControl,
    standard: adapter.calculationStandard,
    units: UnitSystem.SI,
  };
}

function toComfortZoneRequest(
  state: any,
  inputId: InputIdType,
  adapter: PmvStandardAdapter,
): ComfortZoneRequestDto {
  const baseRequest = toPmvRequest(state, inputId, adapter);
  return {
    ...baseRequest,
    rhMin: 0,
    rhMax: 100,
    rhPoints: 31,
  };
}

function toPmvChartInputsRequest(
  state: any,
  visibleInputIds: InputIdType[],
  adapter: PmvStandardAdapter,
): PmvChartInputsRequestDto {
  return {
    inputs: visibleInputIds.reduce((accumulator, inputId) => {
      accumulator[inputId] = toComfortZoneRequest(state, inputId, adapter);
      return accumulator;
    }, {} as PmvChartInputsRequestDto["inputs"]),
    chartRange: {
      tdbMin: 10,
      tdbMax: 40,
      tdbPoints: 121,
      humidityRatioMin: 0,
      humidityRatioMax: 0.03,
    },
    rhCurves: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
  };
}

// ── Tabular Result Builder ──────────────────────────

function buildPmvResultSections(
  results: Record<InputIdType, PmvResponseDto | null>,
  visibleInputIds: InputIdType[],
  unitSystem: UnitSystemType,
  options: any,
) {
  const normalizedOptions = normalizePmvOptions(options);
  const measuredAirSpeedRows: ResultRowDefinition<PmvResponseDto>[] =
    normalizedOptions[OptionKey.AirSpeedInputMode] === AirSpeedInputMode.Measured
      ? [
          {
            title: fieldMetaByKey[FieldKey.RelativeAirSpeed].label,
            formatter: (result) => {
              const airSpeedUnits = fieldMetaByKey[FieldKey.RelativeAirSpeed].displayUnits[unitSystem];
              const displayValue = convertFieldValueFromSi(FieldKey.RelativeAirSpeed, result.vr, unitSystem);
              const formattedValue = formatDisplayValue(
                displayValue,
                fieldMetaByKey[FieldKey.RelativeAirSpeed].decimals,
              );

              return {
                text: `${formattedValue} ${airSpeedUnits}`,
                color: "",
              };
            },
          },
        ]
      : [];
  const rows: ResultRowDefinition<PmvResponseDto>[] = [
    {
      title: "Compliance",
      formatter: (result) => {
        return {
          text: result.isCompliant ? ComplianceStatus.Compliant : ComplianceStatus.OutOfRange,
          color: result.isCompliant ? COLOR_COMPLIANT_GREEN : COLOR_NON_COMPLIANT_RED,
        };
      },
    },
    ...measuredAirSpeedRows,
    {
      title: "PMV",
      formatter: (result) => {
        return {
          text: result.pmv.toFixed(2),
          color: "",
        };
      },
    },
    {
      title: "Zone",
      formatter: (result) => {
        const zoneInfo = getPmvZoneMeta(result.pmv);
        return {
          text: zoneInfo.label,
          color: zoneInfo.textColor,
        };
      },
    },
    {
      title: "PPD",
      formatter: (result) => {
        return {
          text: `${result.ppd.toFixed(1)}%`,
          color: "",
        };
      },
    },
    {
      title: "Acceptability",
      formatter: (result) => {
        return {
          text: `${(100 - result.ppd).toFixed(1)}%`,
          color: "",
        };
      },
    },
  ];

  return buildResultSectionsFromRows(rows, results, visibleInputIds);
}

// ── Chart Building Logic ──────────────────────────

function getPmvHoverTemplate({
  xLabel,
  xUnits,
  yLabel,
  yUnits,
  yDecimals = 1,
  inputLabel,
  classificationLabel = "Zone",
  zoneText = "%{text}",
  pmvText = "%{z:.2f}",
  ppdText = "%{customdata[0]:.1f}%",
  isStaticZone = false,
}: {
  xLabel: string;
  xUnits: string;
  yLabel: string;
  yUnits: string;
  yDecimals?: number;
  inputLabel?: string;
  classificationLabel?: string;
  zoneText?: string | null;
  pmvText?: string | null;
  ppdText?: string | null;
  isStaticZone?: boolean;
}): string {
  const parts = [];
  if (inputLabel) parts.push(inputLabel);
  parts.push(`${xLabel}: %{x:.1f} ${xUnits}`);
  parts.push(`${yLabel}: %{y:.${yDecimals}f} ${yUnits}`);

  if (zoneText) {
    parts.push(`<b>${classificationLabel}: ${zoneText}</b>`);
  }
  if (pmvText && !isStaticZone) {
    parts.push(`PMV: ${pmvText}`);
  }
  if (ppdText && !isStaticZone) {
    parts.push(`PPD: ${ppdText}`);
  }

  return parts.join("<br>") + "<extra></extra>";
}

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

interface PmvChartEvaluation {
  pmv: number;
  ppd: number;
  zoneLabel: string;
}

const pmvOutputSelectors: Partial<
  Record<ModelOutputKey, (evaluation: PmvChartEvaluation) => number>
> = {
  [ModelOutputKey.Pmv]: (evaluation) => evaluation.pmv,
  [ModelOutputKey.Ppd]: (evaluation) => evaluation.ppd,
};

function getPmvOutputValue(
  outputKey: ModelOutputKey,
  evaluation: PmvChartEvaluation,
): number {
  const selector = pmvOutputSelectors[outputKey];
  if (!selector) {
    throw new Error(`Unsupported PMV chart output: ${outputKey}`);
  }
  return selector(evaluation);
}

function evaluatePmvCondition(
  adapter: PmvStandardAdapter,
  payload: PmvRequestDto,
): PmvChartEvaluation {
  const pmvResult = calculatePmvValues(adapter, payload);

  return {
    pmv: pmvResult.pmv,
    ppd: pmvResult.ppd,
    zoneLabel: getPmvZoneMeta(pmvResult.pmv).label,
  };
}

function evaluatePmvPayload(
  adapter: PmvStandardAdapter,
  payload: PmvRequestDto,
): PmvChartEvaluation {
  return evaluatePmvCondition(adapter, payload);
}

function buildPmvGridPoint(evaluation: PmvChartEvaluation) {
  return {
    z: evaluation.pmv,
    text: evaluation.zoneLabel,
    hoverMetadata: [evaluation.ppd],
  };
}

function buildPmvZoneLayers(name: string, hovertemplate: string) {
  return buildZoneContourLayers({
    name,
    colorscale: PMV_COLORSCALE,
    contours: PMV_CONTOURS,
    zmin: -3.5,
    zmax: 3.5,
    hovertemplate,
    opacity: 0.80,
    isBackgroundZone: true,
  });
}

function buildPmvGridStrategy(
  activeInputPayload: PmvRequestDto | undefined,
  name: string,
  hovertemplate: string,
  evaluatePoint: (xSi: number, ySi: number, activeInputPayload: PmvRequestDto) => ReturnType<typeof buildPmvGridPoint>,
): GridFieldChartStrategy | undefined {
  if (!activeInputPayload) {
    return undefined;
  }

  return {
    evaluatePoint: (xSi, ySi) => evaluatePoint(xSi, ySi, activeInputPayload),
    layers: buildPmvZoneLayers(name, hovertemplate),
  };
}

function buildFailedPmvGridPoint() {
  return { z: NaN, text: "", hoverMetadata: [NaN] };
}

function smoothComfortZoneXValues(xValues: number[]): number[] {
  if (xValues.length < 3) {
    return xValues;
  }
  return xValues.map((value, index) => (
    index === 0 || index === xValues.length - 1
      ? value
      : Math.round((((xValues[index - 1] + (value * 2) + xValues[index + 1]) / 4) * 1000)) / 1000
  ));
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

function getComfortZoneForInput(
  adapter: PmvStandardAdapter,
  inputId: InputIdType,
  payload: ComfortZoneRequestDto,
  comfortZonesByInput: Record<string, any>
): ComfortZoneResponseDto {
  return comfortZonesByInput[inputId] ?? calculateComfortZone(adapter, payload);
}

function getHumidityRatioDisplayValue(
  temperature: number,
  relativeHumidity: number,
  unitSystem: UnitSystemType,
): number {
  return convertHumidityRatioFromSi(psy_ta_rh(temperature, relativeHumidity).hr, unitSystem);
}

function getPmvAxisRangeSi(
  adapter: PmvStandardAdapter,
  fieldKey: FieldKey,
): { min: number; max: number } | undefined {
  if (fieldKey !== FieldKey.ClothingInsulation) {
    return undefined;
  }

  return {
    min: fieldMetaByKey[fieldKey].minValue,
    max: adapter.clothingInsulationMaxSi,
  };
}

function setPmvAxisValue(payload: PmvRequestDto, key: FieldKey, value: number): void {
  if (key === FieldKey.DryBulbTemperature) payload.tdb = value;
  else if (key === FieldKey.MeanRadiantTemperature) payload.tr = value;
  else if (key === FieldKey.OperativeTemperature) {
    payload.tdb = value;
    payload.tr = value;
  } else if (key === FieldKey.WindSpeed || key === FieldKey.RelativeAirSpeed) payload.vr = value;
  else if (key === FieldKey.RelativeHumidity) payload.rh = value;
  else if (key === FieldKey.MetabolicRate) payload.met = value;
  else if (key === FieldKey.ClothingInsulation) payload.clo = value;
  else if (key === FieldKey.ExternalWork) payload.wme = value;
}

function getPmvAxisValue(
  adapter: PmvStandardAdapter,
  payload: PmvRequestDto,
  key: FieldKey,
): number {
  const fieldValues: Partial<Record<FieldKey, number>> = {
    [FieldKey.DryBulbTemperature]: payload.tdb,
    [FieldKey.MeanRadiantTemperature]: payload.tr,
    [FieldKey.WindSpeed]: payload.vr,
    [FieldKey.RelativeAirSpeed]: payload.vr,
    [FieldKey.RelativeHumidity]: payload.rh,
    [FieldKey.MetabolicRate]: payload.met,
    [FieldKey.ClothingInsulation]: payload.clo,
    [FieldKey.ExternalWork]: payload.wme,
    [FieldKey.OperativeTemperature]: adapter.getOperativeTemperature(payload),
  };

  return fieldValues[key] ?? 0;
}

function getPmvInputHoverTemplate({
  adapter,
  inputLabel,
  inputPayload,
  xLabel,
  xUnits,
  yLabel,
  yUnits,
  yDecimals,
}: {
  adapter: PmvStandardAdapter;
  inputLabel: string;
  inputPayload: PmvRequestDto;
  xLabel: string;
  xUnits: string;
  yLabel: string;
  yUnits: string;
  yDecimals: number;
}): string {
  let evaluation: PmvChartEvaluation | undefined;
  try {
    evaluation = evaluatePmvPayload(adapter, inputPayload);
  } catch {
    // Preserve existing hover fallback behavior when PMV evaluation fails.
  }

  return getPmvHoverTemplate({
    inputLabel,
    xLabel,
    xUnits,
    yLabel,
    yUnits,
    yDecimals,
    zoneText: evaluation?.zoneLabel,
    pmvText: evaluation !== undefined ? roundValue(evaluation.pmv, 2).toString() : undefined,
    ppdText: evaluation !== undefined ? `${roundValue(evaluation.ppd, 1)}%` : undefined,
  });
}

interface PmvFieldChartOptions {
  title: string;
  xAxis: ChartAxisScale;
  yAxis: ChartAxisScale;
  grid: GridFieldChartStrategy | undefined;
  showLegend: boolean;
  margin: Record<string, number>;
  inputGroups: Array<BuildInputTraceGroupsOptions<ComfortZoneRequestDto, unknown>>;
  beforeInputTraces?: PlotTraceDto[];
}

interface PmvInputGroupOptions {
  adapter: PmvStandardAdapter;
  inputsMap: CompareInputMap<ComfortZoneRequestDto>;
  xAxis: ChartAxisScale;
  yAxis: ChartAxisScale;
  getXSi: (payload: ComfortZoneRequestDto) => number;
  getYSi: (payload: ComfortZoneRequestDto) => number;
  coordinateDecimals: number;
  showLegend?: boolean;
  xLabel?: string;
  xUnits?: string;
  yLabel?: string;
  yUnits?: string;
  buildOverlayTraces?: BuildInputTraceGroupsOptions<ComfortZoneRequestDto, unknown>["buildOverlayTraces"];
}

function buildPmvFieldChart({
  title,
  xAxis,
  yAxis,
  grid,
  showLegend,
  margin,
  inputGroups,
  beforeInputTraces = [],
}: PmvFieldChartOptions): PlotlyChartResponseDto {
  return buildGridContourFieldChart({
    xAxis,
    yAxis,
    grid,
    beforeInputTraces,
    inputGroups,
    layout: {
      title,
      xAxis,
      yAxis,
      paperBgColor: CHART_COLOR_WHITE,
      plotBgColor: CHART_COLOR_PLOT_BG,
      showLegend,
      margin,
      gridColor: CHART_COLOR_GRIDLINE,
      legend: { orientation: "h", x: 0, y: 1.1 },
      height: 480,
    },
    source: CalculationSource.FrontendGenerated,
  });
}

function buildPmvInputGroup({
  adapter,
  inputsMap,
  xAxis,
  yAxis,
  getXSi,
  getYSi,
  coordinateDecimals,
  showLegend,
  xLabel = xAxis.label,
  xUnits = xAxis.units,
  yLabel = yAxis.label,
  yUnits = yAxis.units,
  buildOverlayTraces,
}: PmvInputGroupOptions): BuildInputTraceGroupsOptions<ComfortZoneRequestDto, unknown> {
  return {
    inputsMap,
    showLegend,
    xAxis,
    yAxis,
    getXSi,
    getYSi,
    formatXDisplay: roundValue,
    formatYDisplay: roundValue,
    buildOverlayTraces,
    getHovertemplate: ({ inputLabel, payload: inputPayload }) => getPmvInputHoverTemplate({
      adapter,
      inputLabel,
      inputPayload,
      xLabel,
      xUnits,
      yLabel,
      yUnits,
      yDecimals: coordinateDecimals,
    }),
  };
}

export function buildComparePsychrometricChart(
  adapter: PmvStandardAdapter,
  chartSource: PmvChartSourceDto,
  unitSystem: UnitSystemType = UnitSystem.SI,
): PlotlyChartResponseDto {
  assertPmvChartSource(adapter, chartSource);
  const { modelId, chartRequest: payload, comfortZonesByInput } = chartSource;
  const showInputLegend = shouldShowInputLegend(payload.inputs);
  const { chartRange } = payload;
  const humidityRatioMeta = getHumidityRatioDisplayMeta(unitSystem);
  const temperatureAxis = createFieldAxisScale({
    field: FieldKey.DryBulbTemperature,
    unitSystem,
    rangeSi: { min: chartRange.tdbMin, max: chartRange.tdbMax },
    points: CONTOUR_GRID_RESOLUTION,
  });
  const humidityRatioAxis = createFieldAxisScale({
    field: FieldKey.HumidityRatio,
    unitSystem,
    rangeSi: {
      min: chartRange.humidityRatioMin,
      max: chartRange.humidityRatioMax,
    },
    points: CONTOUR_GRID_RESOLUTION,
    units: humidityRatioMeta.displayUnits,
    decimals: humidityRatioMeta.decimals,
    toDisplay: (valueSi) => convertHumidityRatioFromSi(valueSi, unitSystem),
    toSi: (valueDisplay) => convertHumidityRatioToSi(valueDisplay, unitSystem),
  });
  const temperatures = Array.from({ length: chartRange.tdbPoints }, (_, index) => (
    chartRange.tdbMin + ((chartRange.tdbMax - chartRange.tdbMin) * index) / (chartRange.tdbPoints - 1)
  ));

  const activeInputPayload = resolveBaselineInputEntry(payload.inputs, chartSource.baselineInputId)?.payload;
  const gridStrategy = buildPmvGridStrategy(
    activeInputPayload,
    `${comfortModelMetaById[modelId].label} Zones`,
    getPmvHoverTemplate({
      xLabel: fieldMetaByKey[FieldKey.DryBulbTemperature].label,
      xUnits: temperatureAxis.units,
      yLabel: fieldMetaByKey[FieldKey.HumidityRatio].label,
      yUnits: humidityRatioMeta.displayUnits,
      yDecimals: humidityRatioMeta.decimals,
    }),
    (tdb: number, hr: number, inputPayload: PmvRequestDto) => {
      const pAtm = STANDARD_ATM_PRESSURE_PA;
      const pVap = (hr * pAtm) / (WATER_VAPOR_MOLECULAR_WEIGHT_RATIO + hr);
      const pSaturation = p_sat(tdb);
      if (pVap > pSaturation) {
        return { z: NaN, text: "", hoverMetadata: [NaN] };
      }

      const rh = Math.max(0, (pVap / pSaturation) * 100);
      try {
        const evaluation = evaluatePmvCondition(adapter, {
          ...inputPayload,
          tdb,
          rh,
        });
        return buildPmvGridPoint(evaluation);
      } catch {
        return buildFailedPmvGridPoint();
      }
    },
  );

  const rhCurveTraces: PlotTraceDto[] = [];

  payload.rhCurves.forEach((relativeHumidity) => {
    const xValues: number[] = [];
    const yValues: number[] = [];
    const hoverMetadata: any[][] = [];
    const textValues: string[] = [];

    temperatures.forEach((temperature) => {
      const humidityRatioSi = psy_ta_rh(temperature, relativeHumidity).hr;
      const humidityRatio = convertHumidityRatioFromSi(humidityRatioSi, unitSystem);
      if (humidityRatioSi >= chartRange.humidityRatioMin && humidityRatioSi <= chartRange.humidityRatioMax) {
        xValues.push(roundValue(convertFieldValueFromSi(FieldKey.DryBulbTemperature, temperature, unitSystem)));
        yValues.push(roundValue(humidityRatio));

        if (activeInputPayload) {
          try {
            const evaluation = evaluatePmvCondition(adapter, {
              ...activeInputPayload,
              tdb: temperature,
              rh: relativeHumidity,
            });
            hoverMetadata.push([evaluation.ppd, evaluation.pmv.toFixed(2)]);
            textValues.push(evaluation.zoneLabel);
          } catch {
            hoverMetadata.push([NaN, "NaN"]);
            textValues.push("");
          }
        }
      }
    });
    if (xValues.length === 0) {
      return;
    }
    rhCurveTraces.push(buildLineTrace({
      name: `RH ${relativeHumidity}%`,
      x: xValues,
      y: yValues,
      color: CHART_COLOR_RH_LINE,
      hovertemplate: getPmvHoverTemplate({
        xLabel: fieldMetaByKey[FieldKey.DryBulbTemperature].label,
        xUnits: temperatureAxis.units,
        yLabel: fieldMetaByKey[FieldKey.HumidityRatio].label,
        yUnits: humidityRatioMeta.displayUnits,
        yDecimals: humidityRatioMeta.decimals,
        zoneText: "%{text}",
        pmvText: "%{customdata[1]}",
        ppdText: "%{customdata[0]:.1f}%",
      }),
      text: textValues,
      hoverMetadata: hoverMetadata,
    }));
  });

  return buildPmvFieldChart({
    title: `${comfortModelMetaById[modelId].label} Psychrometric Chart`,
    xAxis: temperatureAxis,
    yAxis: humidityRatioAxis,
    grid: gridStrategy,
    beforeInputTraces: rhCurveTraces,
    inputGroups: [buildPmvInputGroup({
      adapter,
      inputsMap: payload.inputs,
      showLegend: showInputLegend,
      xAxis: temperatureAxis,
      yAxis: humidityRatioAxis,
      getXSi: (inputPayload) => inputPayload.tdb,
      getYSi: (inputPayload) => psy_ta_rh(inputPayload.tdb, inputPayload.rh).hr,
      coordinateDecimals: humidityRatioMeta.decimals,
      buildOverlayTraces: ({ inputId, payload: inputPayload }) => {
        const comfortZone = getComfortZoneForInput(
          adapter,
          inputId,
          inputPayload,
          comfortZonesByInput,
        );

        const { polygonX, polygonY } = buildComfortZonePolygon(
          comfortZone.coolEdge || [],
          comfortZone.warmEdge || [],
          (point) => roundValue(convertFieldValueFromSi(FieldKey.DryBulbTemperature, point.tdb, unitSystem)),
          (point) => roundValue(getHumidityRatioDisplayValue(point.tdb, point.rh, unitSystem)),
        );

        return polygonX.length > 0
          ? [buildComfortPolygonTrace({
            inputId,
            nameSuffix: "comfort zone",
            polygonX,
            polygonY,
            hovertemplate: "",
            hoverinfo: "skip",
            isComfortZone: true,
          })]
          : [];
      },
    })],
    showLegend: showInputLegend,
    margin: { l: 56, r: 24, t: 48, b: 80 },
  });
}

export function buildPmvDynamicChart(
  adapter: PmvStandardAdapter,
  chartSource: PmvChartSourceDto,
  fieldChartConfig: ExploreFieldChartConfig,
  unitSystem: UnitSystemType = UnitSystem.SI,
): PlotlyChartResponseDto {
  assertPmvChartSource(adapter, chartSource);

  const dynamicXAxis = fieldChartConfig.xField;
  const dynamicYAxis = fieldChartConfig.yField;

  if (
    dynamicXAxis === dynamicYAxis ||
    !PMV_DYNAMIC_AXIS_FIELDS.includes(
      dynamicXAxis as typeof PMV_DYNAMIC_AXIS_FIELDS[number],
    ) ||
    !PMV_DYNAMIC_AXIS_FIELDS.includes(
      dynamicYAxis as typeof PMV_DYNAMIC_AXIS_FIELDS[number],
    )
  ) {
    return {
      traces: [],
      layout: {
        title: "Invalid Axes Selection",
        paper_bgcolor: CHART_COLOR_WHITE,
        plot_bgcolor: CHART_COLOR_PLOT_BG,
        showlegend: false,
        margin: { l: 64, r: 24, t: 48, b: 64 },
        xaxis: {},
        yaxis: {},
      },
      annotations: [],
      source: CalculationSource.FrontendGenerated,
    };
  }

  const { modelId, chartRequest: payload } = chartSource;
  const showInputLegend = shouldShowInputLegend(payload.inputs);
  const activeInputPayload = resolveBaselineInputEntry(payload.inputs, chartSource.baselineInputId)?.payload;
  const output = pmvChartableOutputs.find(({ key }) => key === fieldChartConfig.zOutput);
  if (!output) {
    throw new Error(`Unsupported PMV chart output: ${fieldChartConfig.zOutput}`);
  }
  const xAxis = createFieldAxisScale({
    field: dynamicXAxis,
    unitSystem,
    rangeSi: getPmvAxisRangeSi(adapter, dynamicXAxis),
    points: CONTOUR_GRID_RESOLUTION,
  });
  const yAxis = createFieldAxisScale({
    field: dynamicYAxis,
    unitSystem,
    rangeSi: getPmvAxisRangeSi(adapter, dynamicYAxis),
    points: CONTOUR_GRID_RESOLUTION,
  });
  const isPmvOutput = fieldChartConfig.zOutput === ModelOutputKey.Pmv;
  const classificationLabel = isPmvOutput ? "Zone" : "Band";
  const gridHoverTemplate = getPmvHoverTemplate({
    xLabel: xAxis.label,
    xUnits: xAxis.units,
    yLabel: yAxis.label,
    yUnits: yAxis.units,
    yDecimals: 2,
    classificationLabel,
    pmvText: isPmvOutput
      ? "%{customdata[0]:.2f}"
      : "%{customdata[1]:.2f}",
    ppdText: isPmvOutput
      ? "%{customdata[1]:.1f}%"
      : "%{customdata[0]:.1f}%",
  });

  return buildBandedGridFieldChart({
    config: fieldChartConfig,
    output,
    unitSystem,
    renderStrategy: GridBandRenderStrategy.ConstraintContours,
    hoverTemplate: gridHoverTemplate,
    xAxis,
    yAxis,
    evaluateOutput: activeInputPayload
      ? (xSi: number, ySi: number) => {
          const pointArgs = { ...activeInputPayload };
          const hasValidCoordinates = applyDynamicAxisCoordinates(
            pointArgs,
            { field: dynamicXAxis, valueSi: xSi },
            { field: dynamicYAxis, valueSi: ySi },
            {
              setAxisValue: setPmvAxisValue,
              getOperativeTemperature: adapter.getOperativeTemperature,
              getTemperatureComponentRange: (field) => {
                const range = getPmvAxisRangeSi(adapter, field);
                const meta = fieldMetaByKey[field];
                return range ?? { min: meta.minValue, max: meta.maxValue };
              },
            },
          );
          if (!hasValidCoordinates) {
            return {
              valueSi: NaN,
              additionalHoverMetadata: [NaN],
            };
          }
          const evaluation = evaluatePmvPayload(adapter, pointArgs);
          return {
            valueSi: getPmvOutputValue(fieldChartConfig.zOutput, evaluation),
            additionalHoverMetadata: [
              isPmvOutput ? evaluation.ppd : evaluation.pmv,
            ],
          };
        }
      : undefined,
    inputGroups: [{
      inputsMap: payload.inputs,
      xAxis,
      yAxis,
      getXSi: (inputPayload) => getPmvAxisValue(adapter, inputPayload, dynamicXAxis),
      getYSi: (inputPayload) => getPmvAxisValue(adapter, inputPayload, dynamicYAxis),
      formatXDisplay: roundValue,
      formatYDisplay: roundValue,
      getHovertemplate: ({ inputLabel, payload: inputPayload }) => {
        let bandLabel: string | null = null;
        let pmvText: string | null = null;
        let ppdText: string | null = null;
        try {
          const evaluation = evaluatePmvPayload(adapter, inputPayload);
          const valueSi = getPmvOutputValue(fieldChartConfig.zOutput, evaluation);
          const bandIndex = findNumericBandIndexForValue(fieldChartConfig.bands, valueSi);
          bandLabel = bandIndex === undefined
            ? "Unclassified"
            : fieldChartConfig.bands[bandIndex].label;
          pmvText = evaluation.pmv.toFixed(2);
          ppdText = `${evaluation.ppd.toFixed(1)}%`;
        } catch {
          // Preserve a useful coordinate-only hover when a model point cannot be evaluated.
        }

        return getPmvHoverTemplate({
          inputLabel,
          xLabel: xAxis.label,
          xUnits: xAxis.units,
          yLabel: yAxis.label,
          yUnits: yAxis.units,
          yDecimals: 2,
          classificationLabel,
          zoneText: bandLabel,
          pmvText,
          ppdText,
        });
      },
    }],
    layout: {
      title: `${comfortModelMetaById[modelId].label} Dynamic Chart — ${output.label}`,
      xAxis,
      yAxis,
      paperBgColor: CHART_COLOR_WHITE,
      plotBgColor: CHART_COLOR_PLOT_BG,
      showLegend: showInputLegend,
      margin: { l: 64, r: 24, t: 48, b: 64 },
      gridColor: CHART_COLOR_GRIDLINE,
      legend: { orientation: "h", x: 0, y: 1.1 },
      height: 480,
    },
    source: CalculationSource.FrontendGenerated,
  });
}

function buildPmvChartResult(
  adapter: PmvStandardAdapter,
  chartId: ChartIdType,
  chartSource: PmvChartSourceDto | null,
  unitSystem: UnitSystemType,
  fieldChartConfig?: FieldChartConfig | null,
) {
  if (!chartSource) {
    return null;
  }

  if (chartId === ChartId.Psychrometric) {
    return buildComparePsychrometricChart(
      adapter,
      chartSource,
      unitSystem,
    );
  }

  if (chartId === ChartId.PmvDynamic && fieldChartConfig?.mode === ChartMode.Explore) {
    return buildPmvDynamicChart(
      adapter,
      chartSource,
      fieldChartConfig,
      unitSystem,
    );
  }

  return null;
}

// ── Model Config Builder ──────────────────────────

function createOptionHandler(
  behavior: InputControlBehavior,
  optionKey: OptionKeyType,
) {
  return (context: any, nextValue: string) => {
    if (behavior.applyOptionChange) {
      return behavior.applyOptionChange(context, optionKey, nextValue);
    }
    return null;
  };
}

const temperatureBehavior = createTemperatureControlBehavior(InputControlId.Temperature);
const humidityBehavior = createHumidityControlBehavior(InputControlId.Humidity);

const pmvChartIds: ChartIdType[] = [ChartId.Psychrometric, ChartId.PmvDynamic];

export function createPmvModelConfig({
  adapter,
  modes,
  chartableOutputs,
  complianceSpec,
}: PmvModelDeclaration) {
  const builder = new ComfortModelBuilder<PmvResponseDto, PmvChartSourceDto>(
    adapter.modelId,
  );
  const airSpeedBehavior = createAirSpeedControlBehavior(InputControlId.AirSpeed, {
    supportsOccupantAirSpeedControl: adapter.supportsOccupantAirSpeedControl,
  });

  builder
  .setLabel(comfortModelMetaById[adapter.modelId].label)
  .setDescription(comfortModelMetaById[adapter.modelId].description)
  .setModes(modes)
  .setChartableOutputs(chartableOutputs)
  .setComplianceSpec(complianceSpec)
  .addControl({
    id: InputControlId.Temperature,
    behavior: temperatureBehavior,
  })
  .addControl({
    id: InputControlId.RadiantTemperature,
    behavior: createControlBehavior({
      controlId: InputControlId.RadiantTemperature,
      fieldKey: FieldKey.MeanRadiantTemperature,
      hidden: (context) => {
        const options = normalizePmvOptions(context.options);
        return options[OptionKey.TemperatureMode] === TemperatureMode.Operative;
      },
    }),
  })
  .addControl({
    id: InputControlId.AirSpeed,
    behavior: airSpeedBehavior,
  })
  .addControl({
    id: InputControlId.Humidity,
    behavior: humidityBehavior,
  })
  .addControl({
    id: InputControlId.MetabolicRate,
    behavior: createControlBehavior({
      controlId: InputControlId.MetabolicRate,
      fieldKey: FieldKey.MetabolicRate,
      presetOptions: metabolicPresetOptions,
      applyInput: (context, inputId, nextValue) => {
        if (nextValue === null) {
          return null;
        }
        const nextInputState = Object.assign({}, context.inputsByInput[inputId]);
        nextInputState[FieldKey.MetabolicRate] = nextValue;

        const synchronizedState = synchronizePmvInputState(
          nextInputState,
          context.options,
          context.derivedByInput[inputId],
        );

        return createSingleInputPatch(inputId, synchronizedState.inputState);
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
  .addOptionHandler(OptionKey.TemperatureMode, createOptionHandler(temperatureBehavior, OptionKey.TemperatureMode))
  .addOptionHandler(OptionKey.AirSpeedInputMode, createOptionHandler(airSpeedBehavior, OptionKey.AirSpeedInputMode))
  .addOptionHandler(OptionKey.HumidityInputMode, createOptionHandler(humidityBehavior, OptionKey.HumidityInputMode))
  .setDefaultChart(ChartId.Psychrometric, pmvChartIds)
  .setDefaultOptions(Object.assign({}, defaultPmvOptions))
  .setOptionNormalizer(normalizePmvOptionsSnapshot)
  .setDynamicAxisFields([...PMV_DYNAMIC_AXIS_FIELDS])
  .setDefaultDynamicAxes({
    xAxis: FieldKey.DryBulbTemperature,
    yAxis: FieldKey.RelativeHumidity,
  })
  .setCalculator((state, visibleInputIds) => {
    const compareChartRequest = toPmvChartInputsRequest(state, visibleInputIds, adapter);
    const resultsByInput = createEmptyResults<PmvResponseDto>();

    const comfortZonesByInput = visibleInputIds.reduce((accumulator, inputId) => {
      accumulator[inputId] = calculateComfortZone(
        adapter,
        toComfortZoneRequest(state, inputId, adapter),
      );
      return accumulator;
    }, {} as Record<string, any>);

    visibleInputIds.forEach((inputId) => {
      const request = toPmvRequest(state, inputId, adapter);
      const result = calculatePmvValues(adapter, request);
      const complianceWarnings = adapter.checkApplicability(request);

      resultsByInput[inputId] = {
        pmv: result.pmv,
        ppd: result.ppd,
        vr: request.vr,
        isCompliant: complianceWarnings.length === 0
          && PMV_NEUTRAL_ZONE.contains(result.pmv),
        standard: adapter.resultStandard,
        source: CalculationSource.JsThermalComfort,
      };
    });

    return {
      resultsByInput: resultsByInput,
      chartSource: {
        modelId: adapter.modelId,
        chartRequest: compareChartRequest,
        comfortZonesByInput: comfortZonesByInput,
        baselineInputId: state.ui.chartBaselineInputId,
      },
    };
  })
  .setResultBuilder(buildPmvResultSections)
  .setChartBuilder((chartId, chartSource, _resultsByInput, unitSystem, fieldChartConfig) => {
    return buildPmvChartResult(
      adapter,
      chartId,
      chartSource,
      unitSystem,
      fieldChartConfig,
    );
  })
  .setZones(pmvZonesList)
  .setLegendChartIds([ChartId.Psychrometric, ChartId.PmvDynamic])
  .setLegendTitle("PMV Zones")
  .setLockYAxisChartIds([]);

  if (adapter.supportsOccupantAirSpeedControl) {
    builder.addOptionHandler(
      OptionKey.AirSpeedControlMode,
      createOptionHandler(airSpeedBehavior, OptionKey.AirSpeedControlMode),
    );
  }

  return builder.build();
}
