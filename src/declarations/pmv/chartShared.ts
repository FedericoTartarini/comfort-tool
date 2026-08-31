import { CalculationSource } from "../../catalog/calculationMetadata";
import { PhysicalQuantityId } from "../../catalog/quantities";
import type { CompareInputMap } from "../../catalog/chartSource";
import type {
  PlotHoverRow,
  PlotMargin,
  PlotTrace,
} from "../../engines/plotlyTypes";
import type { InputId as InputIdType } from "../../catalog/inputSlots";
import { findNumericBandIndexForValue, type ChartBuildContext, type FieldChartConfig, type NumericBand } from "../../catalog/modelCapabilities";
import type {
  ChartPlotlyBuild,
} from "../../engines/comfort/charts/chartBuildResult";
import { createDisplayHoverProbe } from "../../engines/comfort/charts/hoverProbe";
import {
  buildFieldChart,
  createEmptyFieldStrategy,
  createFieldChartAxis,
  type FieldChartAxisSpec,
  type FieldChartInputGroup,
  type FieldChartRenderContext,
} from "../../engines/comfort/charts/fieldChartEngine";
import { buildHoverTemplate } from "../../engines/comfort/charts/plotlyBuilders";
import { buildIsolineBandOverlayTraces } from "../../engines/comfort/charts/isolineBandOverlays";
import type {
  ChartAxisScale,
} from "../../engines/comfort/charts/types";
import { roundValue } from "../../engines/comfort/helpers";
import {
  formatDisplayValue,
  plotlyHoverNumber,
} from "../../engines/units";
import {
  getPmvZoneMeta,
  ppdThresholdToAbsPmv,
  tryEvaluatePmvForChart,
  type ComfortZoneRequest,
  type PmvChartEvaluation,
  type PmvChartSource,
  type PmvResponse,
} from "./calculation";
import type { PmvModelDeclaration, PmvStandardAdapter } from "./shared";

export type PmvFieldChartConfig = FieldChartConfig<NumericBand>;

interface PmvHoverAxis {
  label: string;
  units: string;
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
    `${xAxis.label}: ${plotlyHoverNumber("x")} ${xAxis.units}`,
    `${yAxis.label}: ${plotlyHoverNumber("y")} ${yAxis.units}`,
    classification.value === null
      ? null
      : `<b>${classification.label}: ${classification.value}</b>`,
    pmv === null ? null : `PMV: ${pmv}`,
    ppd === null ? null : `PPD: ${ppd}`,
  ]);
}

export function axisHoverSpec(axis: ChartAxisScale): PmvHoverAxis {
  return { label: axis.label, units: axis.units };
}

export function getPmvOutputValue(
  outputKey: PhysicalQuantityId,
  evaluation: PmvChartEvaluation,
): number {
  if (outputKey === PhysicalQuantityId.Pmv) return evaluation.pmv;
  if (outputKey === PhysicalQuantityId.Ppd) return evaluation.ppd;
  throw new Error(`Unsupported PMV chart output: ${outputKey}`);
}

interface PmvInputGroupOptions {
  adapter: PmvStandardAdapter;
  inputsMap: CompareInputMap<ComfortZoneRequest>;
  resultsByInput: Partial<Record<InputIdType, PmvResponse | null>>;
  xAxis: ChartAxisScale;
  yAxis: ChartAxisScale;
  getXSi: (payload: ComfortZoneRequest) => number;
  getYSi: (payload: ComfortZoneRequest) => number;
  coordinateDecimals: number;
  classificationLabel?: string;
  getClassification?: (evaluation: PmvChartEvaluation) => string;
  buildOverlayTraces?: FieldChartInputGroup<
    ComfortZoneRequest,
    PmvResponse
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
  ComfortZoneRequest,
  PmvResponse
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
        xAxis: axisHoverSpec(xAxis),
        yAxis: axisHoverSpec(yAxis),
        classification: {
          label: classificationLabel,
          value: evaluation ? getClassification(evaluation) : null,
        },
        pmv: evaluation ? formatDisplayValue(evaluation.pmv) : null,
        ppd: evaluation ? `${formatDisplayValue(evaluation.ppd)}%` : null,
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
  getHoverMetadata: (evaluation: PmvChartEvaluation | null) => PlotHoverRow;
  getAdditionalHoverMetadata: (evaluation: PmvChartEvaluation) => number;
}

export function createPmvOutputPresentation(
  config: PmvFieldChartConfig,
): PmvOutputPresentation {
  const isPmvOutput = config.zOutput === PhysicalQuantityId.Pmv;
  const classificationLabel = isPmvOutput ? "Zone" : "Band";
  return {
    isPmvOutput,
    classificationLabel,
    getClassification: (evaluation) => {
      const valueSi = getPmvOutputValue(config.zOutput, evaluation);
      const bandIndex = findNumericBandIndexForValue(config.bands, valueSi);
      return bandIndex === undefined ? "Unclassified" : config.bands[bandIndex].label;
    },
    pmvHoverToken: isPmvOutput ? plotlyHoverNumber("customdata[0]") : plotlyHoverNumber("customdata[1]"),
    ppdHoverToken: isPmvOutput
      ? `${plotlyHoverNumber("customdata[1]")}%`
      : `${plotlyHoverNumber("customdata[0]")}%`,
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
  ComfortZoneRequest,
  PmvResponse
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
  getInputXSi: (payload: ComfortZoneRequest) => number;
  getInputYSi: (payload: ComfortZoneRequest) => number;
  chartOverlays?: (context: FieldChartRenderContext) => PlotTrace[];
  getInputOverlayBuilder?: (
    xAxis: ChartAxisScale,
    yAxis: ChartAxisScale,
  ) => PmvInputOverlayBuilder;
  clipAirSpeedWithoutOccupantControl?: boolean;
  margin: PlotMargin;
}

export function buildPmvFieldChart(
  declaration: PmvModelDeclaration,
  source: PmvChartSource,
  resultsByInput: Partial<Record<InputIdType, PmvResponse | null>>,
  context: ChartBuildContext<NumericBand>,
  descriptor: PmvFieldChartDescriptor,
): ChartPlotlyBuild {
  const { adapter } = declaration;
  const { config } = descriptor;
  const output = declaration.exploreOutputs.find(({ key }) => key === config.zOutput);
  if (!output) {
    throw new Error(
      `${declaration.label} does not declare chart output ${config.zOutput}.`,
    );
  }
  const presentation = createPmvOutputPresentation(config);
  const layout = config.zOutput === PhysicalQuantityId.Ppd ? "radial" as const : "monotonic";
  const absFromThreshold = config.zOutput === PhysicalQuantityId.Ppd
    ? ppdThresholdToAbsPmv
    : undefined;
  const xAxis = createFieldChartAxis(descriptor.xAxis, context.unitSystem);
  const yAxis = createFieldChartAxis(descriptor.yAxis, context.unitSystem);

  const spec = buildFieldChart({
    unitSystem: context.unitSystem,
    xAxis: descriptor.xAxis,
    yAxis: descriptor.yAxis,
    strategy: createEmptyFieldStrategy(),
    chartOverlays: (renderContext) => (
      descriptor.chartOverlays?.(renderContext)
        ?? buildIsolineBandOverlayTraces({
          bands: config.bands,
          outputLabel: output.label,
          evaluateField: (xSi, ySi) => {
            const evaluation = descriptor.evaluatePoint(xSi, ySi);
            return evaluation ? evaluation.pmv : null;
          },
          xAxis: renderContext.xAxis,
          yAxis: renderContext.yAxis,
          xField: config.xField,
          yField: config.yField,
          layout,
          absFromThreshold,
          opacity: descriptor.opacity,
          clipAirSpeedWithoutOccupantControl:
            descriptor.clipAirSpeedWithoutOccupantControl === true,
        })
    ),
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

  return {
    spec,
    hoverProbe: createDisplayHoverProbe(xAxis, yAxis, (xSi, ySi) => {
      const evaluation = descriptor.evaluatePoint(xSi, ySi);
      if (!evaluation) return null;
      return {
        hovertemplate: buildPmvHoverTemplate({
          inputLabel: null,
          xAxis: axisHoverSpec(xAxis),
          yAxis: axisHoverSpec(yAxis),
          classification: {
            label: presentation.classificationLabel,
            value: presentation.getClassification(evaluation),
          },
          pmv: formatDisplayValue(evaluation.pmv),
          ppd: `${formatDisplayValue(evaluation.ppd)}%`,
        }),
      };
    }),
  };
}

export type PmvChartViewDescriptorFactory = (
  declaration: PmvModelDeclaration,
  source: PmvChartSource,
  resultsByInput: Partial<Record<InputIdType, PmvResponse | null>>,
  context: ChartBuildContext<NumericBand>,
) => PmvFieldChartDescriptor;