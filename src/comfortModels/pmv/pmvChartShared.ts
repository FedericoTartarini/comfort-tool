import { CalculationSource } from "../../models/calculationMetadata";
import type {
  CompareInputMap,
  PlotHoverRowDto,
  PlotMarginDto,
  PlotlyChartResponseDto,
  PlotTraceDto,
} from "../../models/comfortDtos";
import type { InputId as InputIdType } from "../../models/inputSlots";
import {
  findNumericBandIndexForValue,
  ModelOutputKey,
  type ChartBuildContext,
  type FieldChartConfig,
  type NumericBand,
} from "../../models/modelCapabilities";
import {
  buildFieldChart,
  createBandedGridStrategy,
  GridBandRenderStrategy,
  type FieldChartAxisSpec,
  type FieldChartInputGroup,
  type FieldChartRenderContext,
} from "../../services/comfort/charts/chartEngine";
import { buildHoverTemplate } from "../../services/comfort/charts/plotlyBuilders";
import type {
  ChartAxisScale,
  GridEvaluationResult,
} from "../../services/comfort/charts/types";
import { roundValue } from "../../services/comfort/helpers";
import {
  getPmvZoneMeta,
  tryEvaluatePmvForChart,
  type ComfortZoneRequestDto,
  type PmvChartEvaluation,
  type PmvChartSourceDto,
  type PmvResponseDto,
} from "./pmvCalculation";
import type { PmvModelDeclaration, PmvStandardAdapter } from "./pmvShared";

export const CONTOUR_GRID_RESOLUTION = 50;

export type PmvFieldChartConfig = FieldChartConfig<NumericBand>;

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

export function buildPmvHoverTemplate({
  xAxis,
  yAxis,
  classification,
  pmv,
  ppd,
  inputLabel,
}: PmvHoverSpec): string {
  return buildHoverTemplate([
    inputLabel,
    `${xAxis.label}: %{x:.${xAxis.decimals}f} ${xAxis.units}`,
    `${yAxis.label}: %{y:.${yAxis.decimals}f} ${yAxis.units}`,
    classification.value === null
      ? null
      : `<b>${classification.label}: ${classification.value}</b>`,
    pmv === null ? null : `PMV: ${pmv}`,
    ppd === null ? null : `PPD: ${ppd}`,
  ]);
}

export function axisHoverSpec(axis: ChartAxisScale, decimals = axis.decimals ?? 2): PmvHoverAxis {
  return { label: axis.label, units: axis.units, decimals };
}

export function getPmvOutputValue(
  outputKey: ModelOutputKey,
  evaluation: PmvChartEvaluation,
): number {
  if (outputKey === ModelOutputKey.Pmv) return evaluation.pmv;
  if (outputKey === ModelOutputKey.Ppd) return evaluation.ppd;
  throw new Error(`Unsupported PMV chart output: ${outputKey}`);
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
interface PmvOutputPresentation {
  isPmvOutput: boolean;
  classificationLabel: string;
  getClassification: (evaluation: PmvChartEvaluation) => string;
  pmvHoverToken: string;
  ppdHoverToken: string;
  getHoverMetadata: (evaluation: PmvChartEvaluation | null) => PlotHoverRowDto;
  getAdditionalHoverMetadata: (evaluation: PmvChartEvaluation) => number;
}

export function createPmvOutputPresentation(
  config: PmvFieldChartConfig,
): PmvOutputPresentation {
  const isPmvOutput = config.zOutput === ModelOutputKey.Pmv;
  const classificationLabel = isPmvOutput ? "Zone" : "Band";
  return {
    isPmvOutput,
    classificationLabel,
    getClassification: (evaluation) => {
      const valueSi = getPmvOutputValue(config.zOutput, evaluation);
      const bandIndex = findNumericBandIndexForValue(config.bands, valueSi);
      return bandIndex === undefined ? "Unclassified" : config.bands[bandIndex].label;
    },
    pmvHoverToken: isPmvOutput ? "%{customdata[0]:.2f}" : "%{customdata[1]:.2f}",
    ppdHoverToken: isPmvOutput ? "%{customdata[1]:.1f}%" : "%{customdata[0]:.1f}%",
    getHoverMetadata: (evaluation) => (
      evaluation
        ? isPmvOutput
          ? [evaluation.pmv, evaluation.ppd]
          : [evaluation.ppd, evaluation.pmv]
        : [NaN, NaN]
    ),
    getAdditionalHoverMetadata: (evaluation) => (
      isPmvOutput ? evaluation.ppd : evaluation.pmv
    ),
  };
}
export type PmvInputOverlayBuilder = NonNullable<FieldChartInputGroup<
  ComfortZoneRequestDto,
  PmvResponseDto
>["buildOverlayTraces"]>;

export interface PmvFieldChartDescriptor {
  config: PmvFieldChartConfig;
  title: string;
  xAxis: FieldChartAxisSpec;
  yAxis: FieldChartAxisSpec;
  coordinateDecimals: number;
  opacity?: number;
  plotBgColor?: string;
  evaluatePoint: (xSi: number, ySi: number) => PmvChartEvaluation | null;
  projectFillGrid?: (
    grid: GridEvaluationResult,
    context: FieldChartRenderContext,
  ) => GridEvaluationResult;
  getInputXSi: (payload: ComfortZoneRequestDto) => number;
  getInputYSi: (payload: ComfortZoneRequestDto) => number;
  chartOverlays?: (context: FieldChartRenderContext) => PlotTraceDto[];
  getInputOverlayBuilder?: (
    xAxis: ChartAxisScale,
    yAxis: ChartAxisScale,
  ) => PmvInputOverlayBuilder;
  margin: PlotMarginDto;
}

export function buildPmvFieldChart(
  declaration: PmvModelDeclaration,
  source: PmvChartSourceDto,
  resultsByInput: Partial<Record<InputIdType, PmvResponseDto | null>>,
  context: ChartBuildContext<NumericBand>,
  descriptor: PmvFieldChartDescriptor,
): PlotlyChartResponseDto {
  const { adapter } = declaration;
  const { config } = descriptor;
  const output = declaration.exploreOutputs.find(({ key }) => key === config.zOutput);
  if (!output) {
    throw new Error(
      `${declaration.label} does not declare chart output ${config.zOutput}.`,
    );
  }
  const presentation = createPmvOutputPresentation(config);

  return buildFieldChart({
    unitSystem: context.unitSystem,
    xAxis: descriptor.xAxis,
    yAxis: descriptor.yAxis,
    strategy: createBandedGridStrategy({
      config,
      output,
      renderStrategy: GridBandRenderStrategy.ConstraintContours,
      bandLabel: presentation.classificationLabel,
      hoverTemplate: ({ xAxis, yAxis }) => buildPmvHoverTemplate({
        inputLabel: null,
        xAxis: axisHoverSpec(xAxis),
        yAxis: axisHoverSpec(yAxis),
        classification: {
          label: presentation.classificationLabel,
          value: "%{text}",
        },
        pmv: presentation.pmvHoverToken,
        ppd: presentation.ppdHoverToken,
      }),
      opacity: descriptor.opacity,
      projectFillGrid: descriptor.projectFillGrid,
      evaluateOutput: (xSi, ySi) => {
        const evaluation = descriptor.evaluatePoint(xSi, ySi);
        return evaluation
          ? {
              valueSi: getPmvOutputValue(config.zOutput, evaluation),
              additionalHoverMetadata: [
                presentation.getAdditionalHoverMetadata(evaluation),
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
      classificationLabel: presentation.classificationLabel,
      getClassification: presentation.getClassification,
      buildOverlayTraces: descriptor.getInputOverlayBuilder?.(xAxis, yAxis),
    })],
    layout: {
      title: `${descriptor.title} — ${output.label}`,
      margin: descriptor.margin,
      plotBgColor: descriptor.plotBgColor,
      legend: { orientation: "h", x: 0, y: 1.1 },
    },
    source: CalculationSource.FrontendGenerated,
  });
}

export type PmvChartViewDescriptorFactory = (
  declaration: PmvModelDeclaration,
  source: PmvChartSourceDto,
  resultsByInput: Partial<Record<InputIdType, PmvResponseDto | null>>,
  context: ChartBuildContext<NumericBand>,
) => PmvFieldChartDescriptor;