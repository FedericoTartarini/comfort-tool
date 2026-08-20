import { psy_ta_rh } from "jsthermalcomfort";
import { CalculationSource } from "../models/calculationMetadata";
import { ChartId } from "../models/chartOptions";
import type {
  CompareInputMap,
  PlotHoverRowDto,
  PlotMarginDto,
  PlotlyChartResponseDto,
  PlotTraceDto,
} from "../models/comfortDtos";
import { FieldKey } from "../models/fieldKeys";
import type { InputId as InputIdType } from "../models/inputSlots";
import {
  findNumericBandIndexForValue,
  ModelOutputKey,
  type ChartBuildContext,
  type FieldChartConfig,
  type NumericBand,
} from "../models/modelCapabilities";
import { buildClosedBoundaryPolygon } from "../services/comfort/charts/boundaryRegionEngine";
import {
  buildFieldChart,
  createBandedGridStrategy,
  GridBandRenderStrategy,
  type FieldChartAxisSpec,
  type FieldChartInputGroup,
  type FieldChartRenderContext,
} from "../services/comfort/charts/chartEngine";
import { applyDynamicAxisCoordinates } from "../services/comfort/charts/dynamicAxisPayload";
import {
  buildComfortPolygonTrace,
  buildHoverTemplate,
  buildLineTrace,
} from "../services/comfort/charts/plotlyBuilders";
import type {
  ChartAxisScale,
  GridEvaluationResult,
} from "../services/comfort/charts/types";
import { calculateRelativeHumidityFromHumidityRatio } from "../services/comfort/derivations";
import { getBaselineInputEntry, roundValue } from "../services/comfort/helpers";
import {
  convertHumidityRatioFromSi,
  convertHumidityRatioToSi,
  getHumidityRatioDisplayMeta,
} from "../services/units";
import {
  PMV_PSYCHROMETRIC_VIEW,
  createPmvRequestAxisAdapter,
  getPmvZoneMeta,
  tryEvaluatePmvForChart,
  type ComfortPointDto,
  type ComfortZoneRequestDto,
  type PmvChartEvaluation,
  type PmvChartSourceDto,
  type PmvRequestDto,
  type PmvResponseDto,
} from "./pmvCalculation";
import type { PmvModelDeclaration, PmvStandardAdapter } from "./pmvShared";

const CONTOUR_GRID_RESOLUTION = 50;
const CHART_COLOR_RH_LINE = "#94a3b8";
const PSYCHROMETRIC_PLOT_BACKGROUND = "#f8fafc";
const SUPERSATURATED_MASK_TRACE_NAME = "Supersaturated region mask";

type PmvFieldChartConfig = FieldChartConfig<NumericBand>;

interface PsychrometricCurvePoint {
  temperatureSi: number;
  humidityRatioSi: number;
}

interface DisplayedPsychrometricCurve {
  relativeHumidity: number;
  points: PsychrometricCurvePoint[];
  x: number[];
  y: number[];
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

function buildPsychrometricTemperatures(): number[] {
  return Array.from(
    { length: PMV_PSYCHROMETRIC_VIEW.tdbPoints },
    (_, index) => PMV_PSYCHROMETRIC_VIEW.tdbRangeSi.min
      + (
        (PMV_PSYCHROMETRIC_VIEW.tdbRangeSi.max - PMV_PSYCHROMETRIC_VIEW.tdbRangeSi.min)
        * index
      ) / (PMV_PSYCHROMETRIC_VIEW.tdbPoints - 1),
  );
}

function interpolateCurvePointAtHumidityRatio(
  lower: PsychrometricCurvePoint,
  upper: PsychrometricCurvePoint,
  targetHumidityRatioSi: number,
): PsychrometricCurvePoint {
  const humidityRatioSpan = upper.humidityRatioSi - lower.humidityRatioSi;
  const fraction = humidityRatioSpan === 0
    ? 0
    : (targetHumidityRatioSi - lower.humidityRatioSi) / humidityRatioSpan;
  return {
    temperatureSi: lower.temperatureSi
      + (upper.temperatureSi - lower.temperatureSi) * fraction,
    humidityRatioSi: targetHumidityRatioSi,
  };
}

function appendDistinctCurvePoint(
  points: PsychrometricCurvePoint[],
  point: PsychrometricCurvePoint,
): void {
  const previous = points[points.length - 1];
  if (
    previous
    && Math.abs(previous.temperatureSi - point.temperatureSi) < 1e-9
    && Math.abs(previous.humidityRatioSi - point.humidityRatioSi) < 1e-12
  ) {
    return;
  }
  points.push(point);
}

function buildRelativeHumidityCurvePoints(
  relativeHumidity: number,
): PsychrometricCurvePoint[] {
  const rawPoints = buildPsychrometricTemperatures().map((temperatureSi) => ({
    temperatureSi,
    humidityRatioSi: psy_ta_rh(temperatureSi, relativeHumidity).hr,
  }));
  const { min, max } = PMV_PSYCHROMETRIC_VIEW.humidityRatioRangeSi;
  const clippedPoints: PsychrometricCurvePoint[] = [];

  rawPoints.forEach((point, index) => {
    const previous = rawPoints[index - 1];
    if (previous && previous.humidityRatioSi < min && point.humidityRatioSi >= min) {
      appendDistinctCurvePoint(
        clippedPoints,
        interpolateCurvePointAtHumidityRatio(previous, point, min),
      );
    }
    if (point.humidityRatioSi >= min && point.humidityRatioSi <= max) {
      appendDistinctCurvePoint(clippedPoints, point);
    }
    if (previous && previous.humidityRatioSi <= max && point.humidityRatioSi > max) {
      appendDistinctCurvePoint(
        clippedPoints,
        interpolateCurvePointAtHumidityRatio(previous, point, max),
      );
    }
  });

  return clippedPoints;
}

function buildDisplayedRelativeHumidityCurve(
  relativeHumidity: number,
  temperatureAxis: ChartAxisScale,
  humidityRatioAxis: ChartAxisScale,
): DisplayedPsychrometricCurve {
  const points = buildRelativeHumidityCurvePoints(relativeHumidity);
  return {
    relativeHumidity,
    points,
    x: points.map(({ temperatureSi }) => (
      roundValue(temperatureAxis.toDisplay(temperatureSi))
    )),
    y: points.map(({ humidityRatioSi }) => (
      roundValue(humidityRatioAxis.toDisplay(humidityRatioSi))
    )),
  };
}

function buildSupersaturatedRegionMask(
  saturationCurve: DisplayedPsychrometricCurve,
  temperatureAxis: ChartAxisScale,
  humidityRatioAxis: ChartAxisScale,
): PlotTraceDto | null {
  if (saturationCurve.x.length === 0) return null;

  const lastCurveX = saturationCurve.x[saturationCurve.x.length - 1];
  const topY = roundValue(
    humidityRatioAxis.toDisplay(PMV_PSYCHROMETRIC_VIEW.humidityRatioRangeSi.max),
  );
  const leftX = roundValue(
    temperatureAxis.toDisplay(PMV_PSYCHROMETRIC_VIEW.tdbRangeSi.min),
  );
  return {
    type: "scatter",
    mode: "lines",
    name: SUPERSATURATED_MASK_TRACE_NAME,
    x: saturationCurve.x.concat([lastCurveX, leftX]),
    y: saturationCurve.y.concat([topY, topY]),
    showlegend: false,
    fill: "toself",
    fillcolor: PSYCHROMETRIC_PLOT_BACKGROUND,
    line: { color: PSYCHROMETRIC_PLOT_BACKGROUND, width: 0 },
    marker: {},
    opacity: 1,
    hovertemplate: "",
    hoverinfo: "skip",
  };
}

function buildRelativeHumidityCurveTrace(
  adapter: PmvStandardAdapter,
  baseline: PmvRequestDto,
  config: PmvFieldChartConfig,
  curve: DisplayedPsychrometricCurve,
  temperatureAxis: ChartAxisScale,
  humidityRatioAxis: ChartAxisScale,
): PlotTraceDto {
  const isPmvOutput = config.zOutput === ModelOutputKey.Pmv;
  const classificationLabel = isPmvOutput ? "Zone" : "Band";
  const hoverMetadata: PlotHoverRowDto[] = [];
  const text: string[] = [];

  curve.points.forEach(({ temperatureSi }) => {
    const evaluation = tryEvaluatePmvForChart(adapter, {
      ...baseline,
      tdb: temperatureSi,
      rh: curve.relativeHumidity,
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
  });

  return buildLineTrace({
    name: `RH ${curve.relativeHumidity}%`,
    x: curve.x,
    y: curve.y,
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
  });
}

function buildPsychrometricOverlays(
  adapter: PmvStandardAdapter,
  baseline: PmvRequestDto,
  config: PmvFieldChartConfig,
  temperatureAxis: ChartAxisScale,
  humidityRatioAxis: ChartAxisScale,
): PlotTraceDto[] {
  const curves = PMV_PSYCHROMETRIC_VIEW.rhCurves.map((relativeHumidity) => (
    buildDisplayedRelativeHumidityCurve(
      relativeHumidity,
      temperatureAxis,
      humidityRatioAxis,
    )
  ));
  const saturationCurve = curves.find(({ relativeHumidity }) => (
    relativeHumidity === 100
  ));
  const mask = saturationCurve
    ? buildSupersaturatedRegionMask(
        saturationCurve,
        temperatureAxis,
        humidityRatioAxis,
      )
    : null;
  return [
    ...(mask ? [mask] : []),
    ...curves
      .filter(({ x }) => x.length > 0)
      .map((curve) => buildRelativeHumidityCurveTrace(
        adapter,
        baseline,
        config,
        curve,
        temperatureAxis,
        humidityRatioAxis,
      )),
  ];
}

function projectPsychrometricFillGrid(
  adapter: PmvStandardAdapter,
  baseline: PmvRequestDto,
  config: PmvFieldChartConfig,
  grid: GridEvaluationResult,
): GridEvaluationResult {
  const saturationHumidityRatioByX = grid.xValuesSi.map((temperatureSi) => (
    psy_ta_rh(temperatureSi, 100).hr
  ));
  const saturationOutputByX = grid.xValuesSi.map((temperatureSi) => {
    const evaluation = tryEvaluatePmvForChart(adapter, {
      ...baseline,
      tdb: temperatureSi,
      rh: 100,
    });
    return evaluation ? getPmvOutputValue(config.zOutput, evaluation) : NaN;
  });

  return {
    ...grid,
    zValues: grid.zValues.map((row, yIndex) => row.map((value, xIndex) => {
      if (
        Number.isFinite(value)
        || grid.yValuesSi[yIndex] <= saturationHumidityRatioByX[xIndex]
      ) {
        return value;
      }
      return saturationOutputByX[xIndex];
    })),
  };
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
      projectFillGrid: descriptor.projectFillGrid,
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
      plotBgColor: descriptor.plotBgColor,
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
          isBackgroundZone: true,
        })];
  };
}

type PmvChartViewDescriptorFactory = (
  declaration: PmvModelDeclaration,
  source: PmvChartSourceDto,
  context: ChartBuildContext<NumericBand>,
) => PmvFieldChartDescriptor;

const createPsychrometricViewDescriptor: PmvChartViewDescriptorFactory = (
  declaration,
  source,
  context,
) => {
  const { adapter } = declaration;
  const { unitSystem } = context;
  const baseline = getBaselineInputEntry(source.inputs, context.baselineInputId);
  const humidityRatioMeta = getHumidityRatioDisplayMeta(unitSystem);
  const config: PmvFieldChartConfig = {
    ...context.fieldChartConfig,
    xField: FieldKey.DryBulbTemperature,
    yField: FieldKey.HumidityRatio,
  };

  return {
    config,
    title: `${declaration.label} Psychrometric Chart`,
    xAxis: {
      field: config.xField,
      rangeSi: PMV_PSYCHROMETRIC_VIEW.tdbRangeSi,
      points: CONTOUR_GRID_RESOLUTION,
    },
    yAxis: {
      field: config.yField,
      rangeSi: PMV_PSYCHROMETRIC_VIEW.humidityRatioRangeSi,
      points: CONTOUR_GRID_RESOLUTION,
      units: humidityRatioMeta.displayUnits,
      decimals: humidityRatioMeta.decimals,
      toDisplay: convertHumidityRatioFromSi,
      toSi: convertHumidityRatioToSi,
    },
    coordinateDecimals: humidityRatioMeta.decimals,
    opacity: 0.8,
    plotBgColor: PSYCHROMETRIC_PLOT_BACKGROUND,
    evaluatePoint: (tdb, humidityRatio) => evaluatePsychrometricPoint(
      adapter,
      baseline.payload,
      tdb,
      humidityRatio,
    ),
    projectFillGrid: (grid) => projectPsychrometricFillGrid(
      adapter,
      baseline.payload,
      config,
      grid,
    ),
    getInputXSi: (payload) => payload.tdb,
    getInputYSi: (payload) => psy_ta_rh(payload.tdb, payload.rh).hr,
    chartOverlays: ({ xAxis, yAxis }) => buildPsychrometricOverlays(
      adapter,
      baseline.payload,
      config,
      xAxis,
      yAxis,
    ),
    getInputOverlayBuilder: (xAxis, yAxis) => (
      createPsychrometricComfortZoneOverlayBuilder(source, xAxis, yAxis)
    ),
    margin: { l: 56, r: 24, t: 48, b: 80 },
  };
};

const createDynamicViewDescriptor: PmvChartViewDescriptorFactory = (
  declaration: PmvModelDeclaration,
  source: PmvChartSourceDto,
  context: ChartBuildContext<NumericBand>,
) => {
  const { adapter } = declaration;
  const config = context.fieldChartConfig;
  const baseline = getBaselineInputEntry(source.inputs, context.baselineInputId);
  const axisAdapter = createPmvRequestAxisAdapter(adapter);

  return {
    config,
    title: `${declaration.label} Dynamic Chart`,
    xAxis: {
      field: config.xField,
      rangeSi: axisAdapter.getAxisRange(config.xField),
      points: CONTOUR_GRID_RESOLUTION,
    },
    yAxis: {
      field: config.yField,
      rangeSi: axisAdapter.getAxisRange(config.yField),
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
    getInputXSi: (payload) => axisAdapter.getAxisValue(payload, config.xField),
    getInputYSi: (payload) => axisAdapter.getAxisValue(payload, config.yField),
    margin: { l: 64, r: 24, t: 48, b: 64 },
  };
};

const pmvChartViewById: Partial<Record<ChartId, PmvChartViewDescriptorFactory>> = {
  [ChartId.Psychrometric]: createPsychrometricViewDescriptor,
  [ChartId.PmvDynamic]: createDynamicViewDescriptor,
};

export function buildPmvChart(
  chartId: ChartId,
  declaration: PmvModelDeclaration,
  source: PmvChartSourceDto,
  resultsByInput: Partial<Record<InputIdType, PmvResponseDto | null>>,
  context: ChartBuildContext<NumericBand>,
): PlotlyChartResponseDto | null {
  const createDescriptor = pmvChartViewById[chartId];
  return createDescriptor
    ? buildPmvFieldChart(
        declaration,
        source,
        resultsByInput,
        context,
        createDescriptor(declaration, source, context),
      )
    : null;
}
