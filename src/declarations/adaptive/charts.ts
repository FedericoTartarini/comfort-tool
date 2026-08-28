import { CalculationSource } from "../../catalog/calculationMetadata";
import type { ModelChartSource } from "../../catalog/chartSource";
import type {
  PlotHoverRow,
  PlotlyChartSpec,
} from "../../engines/plotlyTypes";
import { ComplianceStatus } from "../../catalog/modelIds";
import { PhysicalQuantityId, getQuantityPresentationMeta } from "../../catalog/quantities";
import type { InputId as InputIdType } from "../../catalog/inputSlots";
import type { Band, ChartBuildContext } from "../../catalog/modelCapabilities";
import type { UnitSystem as UnitSystemType } from "../../catalog/units";
import {
  buildFieldChart,
  createBoundaryRegionStrategy,
  type FieldChartInputGroup,
} from "../../engines/comfort/charts/fieldChartEngine";
import type { ChartAxisScale } from "../../engines/comfort/charts/types";
import { buildHoverTemplate } from "../../engines/comfort/charts/plotlyBuilders";
import { getBaselineInputEntry, roundValue } from "../../engines/comfort/helpers";
import { convertFieldValueFromSi, plotlyHoverNumber } from "../../engines/units";
import {
  calculateAdaptive,
  getLevelResult,
} from "./calculation";
import type {
  AdaptiveModelDeclaration,
  AdaptiveRequest,
  AdaptiveResponse,
} from "./shared";

const FIXED_OPERATIVE_RANGE_SI = { min: 10, max: 40 };
const BOUNDARY_POINTS = 240;
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
    return `${level.label}: ${plotlyHoverNumber(`customdata[${metadataIndex}]`)} to ${plotlyHoverNumber(`customdata[${metadataIndex + 1}]`)} ${boundaryUnits}`;
  });
  return buildHoverTemplate([
    inputLabel,
    `${xAxis.label}: ${plotlyHoverNumber("x")} ${xAxis.units}`,
    `${yAxis.label}: ${plotlyHoverNumber("y")} ${yAxis.units}`,
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
  const outdoorAxisSpec = { field: PhysicalQuantityId.PrevailingMeanOutdoorTemperature, rangeSi: declaration.outdoorTemperatureRangeSi, points: BOUNDARY_POINTS, label: declaration.outdoorTemperatureLabel, units: (activeUnitSystem: UnitSystemType) =>
      getQuantityPresentationMeta(
        PhysicalQuantityId.DryBulbTemperature, activeUnitSystem, ).displayUnits };
  const operativeAxisSpec = { field: PhysicalQuantityId.OperativeTemperature, rangeSi: FIXED_OPERATIVE_RANGE_SI, points: 2, units: (activeUnitSystem: UnitSystemType) =>
      getQuantityPresentationMeta(
        PhysicalQuantityId.DryBulbTemperature, activeUnitSystem, ).displayUnits };

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
