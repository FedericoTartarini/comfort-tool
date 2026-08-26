import { CalculationSource } from "../../models/calculationMetadata";
import type { ModelChartSource } from "../../models/chartSource";
import type {
  PlotHoverRow,
  PlotlyChartSpec,
  PlotTrace,
} from "../../services/plotlyTypes";
import { ComplianceStatus } from "../../models/comfortModels";
import { PhysicalQuantityId, getQuantityPresentationMeta } from "../../models/physicalQuantities";
import type { InputId as InputIdType } from "../../models/inputSlots";
import type { Band, ChartBuildContext } from "../../models/modelCapabilities";
import type { UnitSystem as UnitSystemType } from "../../models/units";
import { buildTooltipGridTrace } from "../../services/comfort/charts/boundaryRegionEngine";
import {
  buildFieldChart,
  createBoundaryRegionStrategy,
  type FieldChartInputGroup,
} from "../../services/comfort/charts/fieldChartEngine";
import type { ChartAxisScale } from "../../services/comfort/charts/types";
import { buildHoverTemplate } from "../../services/comfort/charts/plotlyBuilders";
import { getBaselineInputEntry, roundValue } from "../../services/comfort/helpers";
import { convertFieldValueFromSi } from "../../services/units";
import {
  calculateAdaptive,
  getLevelResult,
} from "./adaptiveCalculation";
import type {
  AdaptiveModelDeclaration,
  AdaptiveRequest,
  AdaptiveResponse,
} from "./adaptiveShared";

const FIXED_OPERATIVE_RANGE_SI = { min: 10, max: 40 };
const BOUNDARY_POINTS = 240;
const TOOLTIP_GRID_POINTS = 40;
const CHART_COLORS = {
  line: "#334155",
} as const;

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
        convertFieldValueFromSi(PhysicalQuantityId.DryBulbTemperature, value, unitSystem),
        1,
      );
}

function getAdaptiveHoverMetadata(
  declaration: AdaptiveModelDeclaration,
  result: AdaptiveResponse,
  unitSystem: UnitSystemType,
): PlotHoverRow {
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
    getQuantityPresentationMeta(PhysicalQuantityId.DryBulbTemperature, unitSystem).displayUnits;
  const rows = declaration.hoverLevelIds.map((levelId, index) => {
    const level = declaration.levels.find(({ id }) => id === levelId);
    if (!level) throw new Error(`Unknown Adaptive hover level: ${levelId}`);
    const metadataIndex = 1 + index * 2;
    return `${level.label}: %{customdata[${metadataIndex}]:.1f} to %{customdata[${metadataIndex + 1}]:.1f} ${boundaryUnits}`;
  });
  return buildHoverTemplate([
    inputLabel,
    `${xAxis.label}: %{x:.${coordinateDecimals}f} ${xAxis.units}`,
    `${yAxis.label}: %{y:.${coordinateDecimals}f} ${yAxis.units}`,
    ...rows,
  ]);
}

function getInputResult(
  declaration: AdaptiveModelDeclaration,
  payload: AdaptiveRequest,
  inputId: InputIdType,
  resultsByInput: Partial<Record<InputIdType, AdaptiveResponse | null>>,
): AdaptiveResponse {
  return resultsByInput[inputId] ?? calculateAdaptive(declaration, payload);
}

function createAdaptiveInputGroup(
  declaration: AdaptiveModelDeclaration,
  source: ModelChartSource<AdaptiveRequest>,
  resultsByInput: Partial<Record<InputIdType, AdaptiveResponse | null>>,
  unitSystem: UnitSystemType,
  xAxis: ChartAxisScale,
  yAxis: ChartAxisScale,
  boundaryAxis: "x" | "y",
): FieldChartInputGroup<AdaptiveRequest, AdaptiveResponse> {
  const getResult = (payload: AdaptiveRequest, inputId: InputIdType) => (
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
  baseline: AdaptiveRequest,
  boundaryAxis: "x" | "y",
  xSi: number,
  ySi: number,
): AdaptiveResponse | null {
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
  baseline: AdaptiveRequest,
  unitSystem: UnitSystemType,
  xAxis: ChartAxisScale,
  yAxis: ChartAxisScale,
  boundaryAxis: "x" | "y",
): PlotTrace {
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
  source: ModelChartSource<AdaptiveRequest>,
  resultsByInput: Partial<Record<InputIdType, AdaptiveResponse | null>>,
  context: ChartBuildContext<Band>,
): PlotlyChartSpec {
  const config = context.fieldChartConfig;
  const baseline = getBaselineInputEntry(source.inputs, context.baselineInputId);
  const { unitSystem } = context;
  const boundaryAxis = config.xField === PhysicalQuantityId.PrevailingMeanOutdoorTemperature
    ? "x"
    : "y";
  const outdoorAxisSpec = {
    field: PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
    rangeSi: declaration.outdoorTemperatureRangeSi,
    points: BOUNDARY_POINTS,
    label: declaration.outdoorTemperatureLabel,
    units: (activeUnitSystem: UnitSystemType) =>
      getQuantityPresentationMeta(
        PhysicalQuantityId.DryBulbTemperature,
        activeUnitSystem,
      ).displayUnits,
  };
  const operativeAxisSpec = {
    field: PhysicalQuantityId.OperativeTemperature,
    rangeSi: FIXED_OPERATIVE_RANGE_SI,
    points: 2,
    units: (activeUnitSystem: UnitSystemType) =>
      getQuantityPresentationMeta(
        PhysicalQuantityId.DryBulbTemperature,
        activeUnitSystem,
      ).displayUnits,
  };

  return buildFieldChart({
    unitSystem,
    xAxis: boundaryAxis === "x" ? outdoorAxisSpec : operativeAxisSpec,
    yAxis: boundaryAxis === "x" ? operativeAxisSpec : outdoorAxisSpec,
    strategy: createBoundaryRegionStrategy({
      bands: config.bands,
      bandInputsSi: {
        [PhysicalQuantityId.RelativeAirSpeed]: baseline.payload.v,
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
