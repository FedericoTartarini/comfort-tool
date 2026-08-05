import { t_o } from "jsthermalcomfort";
import { CalculationSource, type ComfortStandard } from "../models/calculationMetadata";
import { ChartId } from "../models/chartOptions";
import type {
  ModelChartSourceDto,
  PlotHoverRowDto,
  PlotlyChartResponseDto,
  PlotTraceDto,
} from "../models/comfortDtos";
import {
  ComfortModel,
  ComplianceStatus,
  type JsThermalComfortStandard,
} from "../models/comfortModels";
import { FieldKey } from "../models/fieldKeys";
import { fieldMetaByKey } from "../models/inputFieldsMeta";
import { InputControlId, type PresetInputOption } from "../models/inputControls";
import {
  defaultAdaptiveOptions,
  OptionKey,
  TemperatureMode,
  type AdaptiveModelOptions,
} from "../models/inputModes";
import type { InputId as InputIdType } from "../models/inputSlots";
import type { ModelCalculationContext } from "../models/modelCalculation";
import type { ModifierId as ModifierIdType } from "../models/inputModifiers";
import {
  type Band,
  type BandEdge,
  type BandInputsSi,
  type ChartBuildContext,
  type ChartMode as ChartModeType,
  type ComplianceFeedback,
  type ComplianceSpec,
  type ModelOutput,
} from "../models/modelCapabilities";
import { ThermalZone } from "../models/thermalZone";
import type { UnitSystem as UnitSystemType } from "../models/units";
import { buildTooltipGridTrace } from "../services/comfort/charts/boundaryRegionEngine";
import {
  buildFieldChart,
  createBoundaryRegionStrategy,
  type FieldChartInputGroup,
} from "../services/comfort/charts/chartEngine";
import type { ChartAxisScale } from "../services/comfort/charts/types";
import {
  buildDefaultPresentation,
  createControlBehavior,
  createTemperatureControlBehavior,
} from "../services/comfort/controls/controlBehaviors";
import {
  getBaselineInputEntry,
  roundValue,
} from "../services/comfort/helpers";
import {
  calculatePerInput,
  createFieldRequestMapper,
} from "../services/comfort/requestMapping";
import { convertFieldValueFromSi } from "../services/units";
import {
  buildResultSectionsFromRows,
  ComfortModelBuilder,
  hasExactKeys,
  isRecord,
  type ResultRowDefinition,
} from "../state/comfortTool/modelConfigs/builder";

const FIXED_OPERATIVE_RANGE_SI = { min: 10, max: 40 };
const BOUNDARY_POINTS = 240;
const TOOLTIP_GRID_POINTS = 40;
const CHART_COLORS = {
  line: "#334155",
} as const;

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
  supportedModifiers: readonly ModifierIdType[];
  complianceSpec: ComplianceSpec<Band, AdaptiveResponseDto>;
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

function getLevelResult(
  result: AdaptiveResponseDto,
  levelId: string,
): AdaptiveLevelResult {
  const level = result.levels.find(({ id }) => id === levelId);
  if (!level) throw new Error(`Missing adaptive result level: ${levelId}`);
  return level;
}

export function createAdaptiveComplianceFeedbackGetter(
  complianceLevelId: string,
): (result: AdaptiveResponseDto) => ComplianceFeedback {
  return (result) => {
    if (!result.isApplicable) {
      return { text: ComplianceStatus.OutOfRange, passes: false };
    }
    const passes = getLevelResult(result, complianceLevelId).accepted;
    return {
      text: passes ? ComplianceStatus.Compliant : ComplianceStatus.NonCompliant,
      passes,
    };
  };
}

function formatAdaptiveOffset(offset: number): string {
  if (!Number.isFinite(offset)) {
    throw new Error(`Adaptive compliance offsets must be finite; received ${offset}.`);
  }
  return offset < 0 ? `− ${Math.abs(offset)}` : `+ ${offset}`;
}

export function createAdaptiveComplianceCaption(
  shadingDescription: string,
  declaration: AdaptiveBoundaryDefinition,
  complianceLevelId: string,
): string {
  const level = declaration.levels.find(({ id }) => id === complianceLevelId);
  if (!level) {
    throw new Error(`Missing adaptive compliance level: ${complianceLevelId}`);
  }
  const rangeLabel = level.label.replace(/ Acceptability$/, "");
  return `${shadingDescription}; compliance is the ${rangeLabel} range from t_cmf ${formatAdaptiveOffset(level.coolOffset)}°C to t_cmf ${formatAdaptiveOffset(level.warmOffset)}°C, including the applicable upper-limit cooling adjustment.`;
}

function parseAdaptiveOptions(value: unknown): AdaptiveModelOptions | null {
  if (!isRecord(value) || !hasExactKeys(value, [OptionKey.TemperatureMode])) {
    return null;
  }
  const temperatureMode = value[OptionKey.TemperatureMode];
  if (
    temperatureMode !== TemperatureMode.Air
    && temperatureMode !== TemperatureMode.Operative
  ) {
    return null;
  }
  return { [OptionKey.TemperatureMode]: temperatureMode };
}

const mapAdaptiveRequestFields = createFieldRequestMapper<AdaptiveRequestDto>({
  tdb: FieldKey.DryBulbTemperature,
  tr: FieldKey.MeanRadiantTemperature,
  trm: FieldKey.PrevailingMeanOutdoorTemperature,
  v: FieldKey.RelativeAirSpeed,
});

function toAdaptiveRequest(
  context: ModelCalculationContext,
  inputId: InputIdType,
  declaration: AdaptiveModelDeclaration,
): AdaptiveRequestDto {
  const options = parseAdaptiveOptions(
    context.modelOptionsByModel[declaration.modelId],
  );
  if (!options) {
    throw new Error(`Invalid options state for ${declaration.modelId}.`);
  }
  const request = mapAdaptiveRequestFields(context, inputId);
  if (options[OptionKey.TemperatureMode] === TemperatureMode.Operative) {
    request.tr = request.tdb;
  }
  return request;
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
): PlotHoverRowDto {
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
  source: ModelChartSourceDto<AdaptiveRequestDto>,
  resultsByInput: Partial<Record<InputIdType, AdaptiveResponseDto | null>>,
  unitSystem: UnitSystemType,
  xAxis: ChartAxisScale,
  yAxis: ChartAxisScale,
  boundaryAxis: "x" | "y",
): FieldChartInputGroup<AdaptiveRequestDto, AdaptiveResponseDto> {
  const getResult = (payload: AdaptiveRequestDto, inputId: InputIdType) => (
    getInputResult(declaration, payload, inputId, resultsByInput)
  );
  return {
    inputsMap: source.inputs,
    resultsByInput,
    getXSi: (payload, inputId) => boundaryAxis === "x"
      ? payload.trm
      : getResult(payload, inputId).operativeTemperature,
    getYSi: (payload, inputId) => boundaryAxis === "x"
      ? getResult(payload, inputId).operativeTemperature
      : payload.trm,
    formatXDisplay: roundValue,
    formatYDisplay: roundValue,
    getHovertemplate: ({ inputLabel }) => buildAdaptiveHoverTemplate(
      declaration,
      unitSystem,
      xAxis,
      yAxis,
      inputLabel,
      1,
    ),
    hoverMetadata: ({ payload, inputId }) => getAdaptiveHoverMetadata(
      declaration,
      getInputResult(declaration, payload, inputId, resultsByInput),
      unitSystem,
    ),
  };
}

function evaluateAdaptiveChartPoint(
  declaration: AdaptiveModelDeclaration,
  baseline: AdaptiveRequestDto,
  boundaryAxis: "x" | "y",
  xSi: number,
  ySi: number,
): AdaptiveResponseDto | null {
  const outdoorTemperatureSi = boundaryAxis === "x" ? xSi : ySi;
  const operativeTemperatureSi = boundaryAxis === "x" ? ySi : xSi;
  const result = calculateAdaptive(declaration, {
    ...baseline,
    tdb: operativeTemperatureSi,
    tr: operativeTemperatureSi,
    trm: outdoorTemperatureSi,
  });
  return result.isApplicable ? result : null;
}

function buildAdaptiveTooltipTrace(
  declaration: AdaptiveModelDeclaration,
  baseline: AdaptiveRequestDto,
  unitSystem: UnitSystemType,
  xAxis: ChartAxisScale,
  yAxis: ChartAxisScale,
  boundaryAxis: "x" | "y",
): PlotTraceDto {
  return buildTooltipGridTrace({
    xAxis: { ...xAxis, points: TOOLTIP_GRID_POINTS },
    yAxis: { ...yAxis, points: TOOLTIP_GRID_POINTS },
    hovertemplate: buildAdaptiveHoverTemplate(
      declaration,
      unitSystem,
      xAxis,
      yAxis,
    ),
    getHoverMetadata: (xSi, ySi) => {
      const result = evaluateAdaptiveChartPoint(
        declaration,
        baseline,
        boundaryAxis,
        xSi,
        ySi,
      );
      return result
        ? getAdaptiveHoverMetadata(declaration, result, unitSystem)
        : [NaN];
    },
  });
}

export function buildAdaptiveChart(
  declaration: AdaptiveModelDeclaration,
  source: ModelChartSourceDto<AdaptiveRequestDto>,
  resultsByInput: Partial<Record<InputIdType, AdaptiveResponseDto | null>>,
  context: ChartBuildContext<Band>,
): PlotlyChartResponseDto {
  const config = context.fieldChartConfig;
  const baseline = getBaselineInputEntry(source.inputs, context.baselineInputId);
  const { unitSystem } = context;
  const boundaryAxis = config.xField === FieldKey.PrevailingMeanOutdoorTemperature
    ? "x"
    : "y";
  const outdoorAxisSpec = {
    field: FieldKey.PrevailingMeanOutdoorTemperature,
    rangeSi: declaration.outdoorTemperatureRangeSi,
    points: BOUNDARY_POINTS,
    label: declaration.outdoorTemperatureLabel,
    units: (activeUnitSystem: UnitSystemType) =>
      fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[activeUnitSystem],
  };
  const operativeAxisSpec = {
    field: FieldKey.OperativeTemperature,
    rangeSi: FIXED_OPERATIVE_RANGE_SI,
    points: 2,
    units: (activeUnitSystem: UnitSystemType) =>
      fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[activeUnitSystem],
  };

  return buildFieldChart({
    unitSystem,
    xAxis: boundaryAxis === "x" ? outdoorAxisSpec : operativeAxisSpec,
    yAxis: boundaryAxis === "x" ? operativeAxisSpec : outdoorAxisSpec,
    strategy: createBoundaryRegionStrategy({
      bands: config.bands,
      bandInputsSi: {
        [FieldKey.RelativeAirSpeed]: baseline.payload.v,
      },
      style: { lineColor: CHART_COLORS.line },
      boundaryAxis,
      additionalBoundaryValuesSi: () => addCoolingEffectTransitionPoints(
        declaration,
        baseline.payload.v,
        declaration.outdoorTemperatureRangeSi,
      ),
    }),
    chartOverlays: ({ xAxis, yAxis }) => [buildAdaptiveTooltipTrace(
      declaration,
      baseline.payload,
      unitSystem,
      xAxis,
      yAxis,
      boundaryAxis,
    )],
    inputGroups: ({ xAxis, yAxis }) => [createAdaptiveInputGroup(
      declaration,
      source,
      resultsByInput,
      unitSystem,
      xAxis,
      yAxis,
      boundaryAxis,
    )],
    layout: {
      title: `${declaration.label} Comfort Chart`,
      margin: { l: 56, r: 24, t: 48, b: 80 },
      legend: { orientation: "h", x: 0, y: 1.1 },
    },
    source: CalculationSource.FrontendGenerated,
  });
}

export function createAdaptiveComplianceBands(
  declaration: AdaptiveBoundaryDefinition,
): readonly Band[] {
  const getRelativeAirSpeed = (inputsSi: BandInputsSi): number => {
    const airSpeed = inputsSi[FieldKey.RelativeAirSpeed];
    if (typeof airSpeed !== "number" || !Number.isFinite(airSpeed)) {
      throw new Error(
        "Adaptive boundary bands require finite canonical-SI relative air speed.",
      );
    }
    return airSpeed;
  };
  const internalEdges: BandEdge[] = Array.from(
    { length: declaration.bandSequence.length - 1 },
    (_, boundaryIndex) => (outdoorTemperatureSi, inputsSi) => (
      getAdaptiveTemperatureBoundaries(
        declaration,
        outdoorTemperatureSi,
        getRelativeAirSpeed(inputsSi),
      )[boundaryIndex]
    ),
  );

  return declaration.bandSequence.map((zone, index): Band => ({
    min: index === 0 ? -Infinity : internalEdges[index - 1],
    max: index === declaration.bandSequence.length - 1
      ? Infinity
      : internalEdges[index],
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
        const feedback = declaration.complianceSpec.getFeedback(result);
        return {
          text: feedback.text,
          color: feedback.passes
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
    ModelChartSourceDto<AdaptiveRequestDto>,
    Band
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
    .setModifiers(declaration.supportedModifiers)
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
    .setDefaultChart(ChartId.Adaptive, [ChartId.Adaptive])
    .setOptionParser(parseAdaptiveOptions)
    .setDynamicAxisFields([
      FieldKey.PrevailingMeanOutdoorTemperature,
      FieldKey.OperativeTemperature,
    ])
    .setDefaultDynamicAxes({
      xAxis: FieldKey.PrevailingMeanOutdoorTemperature,
      yAxis: FieldKey.OperativeTemperature,
    })
    .setCalculator((context, visibleInputIds) =>
      calculatePerInput({
        context,
        visibleInputIds,
        mapRequest: (calculationContext, inputId) =>
          toAdaptiveRequest(calculationContext, inputId, declaration),
        calculate: (request) => calculateAdaptive(declaration, request),
      }))
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
      return null;
    })
    .setZones([...declaration.zones])
    .setLegendChartIds([ChartId.Adaptive])
    .setLegendTitle("Adaptive Zones")
    .setLockYAxisChartIds([]);

  return builder.build();
}
