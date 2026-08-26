import { psy_ta_rh } from "jsthermalcomfort";
import type {
  PlotHoverRow,
  PlotTrace,
} from "../../services/plotlyTypes";
import { PhysicalQuantityId, getQuantityDisplayMeta } from "../../models/quantities";
import {
  buildComfortPolygonTrace,
  buildFilledPolygonTrace,
  buildLineTrace,
} from "../../services/comfort/charts/plotlyBuilders";
import type {
  ChartAxisScale,
  GridEvaluationResult,
} from "../../services/comfort/charts/types";
import { getBaselineInputEntry, roundValue } from "../../services/comfort/helpers";
import {
  PMV_PSYCHROMETRIC_VIEW,
  tryEvaluatePmvForChart,
  type ComfortPoint,
  type PmvChartEvaluation,
  type PmvChartSource,
  type PmvRequest,
} from "./calculation";
import type { PmvStandardAdapter } from "./shared";
import {
  CONTOUR_GRID_RESOLUTION,
  axisHoverSpec,
  buildPmvHoverTemplate,
  createPmvOutputPresentation,
  getPmvOutputValue,
  type PmvChartViewDescriptorFactory,
  type PmvFieldChartConfig,
  type PmvInputOverlayBuilder,
} from "./chartShared";
import { buildClosedBoundaryPolygon } from "../../services/comfort/charts/boundaryRegionEngine";
import { calculateRelativeHumidityFromHumidityRatio } from "../../services/comfort/derivations";

const CHART_COLOR_RH_LINE = "#94a3b8";
const PSYCHROMETRIC_PLOT_BACKGROUND = "#f8fafc";
const SUPERSATURATED_MASK_TRACE_NAME = "Supersaturated region mask";

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
  coolEdge: ComfortPoint[],
  warmEdge: ComfortPoint[],
  getX: (point: ComfortPoint) => number,
  getY: (point: ComfortPoint) => number,
): { polygonX: number[]; polygonY: number[] } {
  return buildClosedBoundaryPolygon({
    lowerX: smoothComfortZoneXValues(coolEdge.map(getX)),
    lowerY: coolEdge.map(getY),
    upperX: smoothComfortZoneXValues(warmEdge.map(getX)),
    upperY: warmEdge.map(getY),
  });
}
function evaluatePsychrometricPoint(
  adapter: PmvStandardAdapter,
  baseline: PmvRequest,
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
): PlotTrace | null {
  if (saturationCurve.x.length === 0) return null;

  const lastCurveX = saturationCurve.x[saturationCurve.x.length - 1];
  const topY = roundValue(
    humidityRatioAxis.toDisplay(PMV_PSYCHROMETRIC_VIEW.humidityRatioRangeSi.max),
  );
  const leftX = roundValue(
    temperatureAxis.toDisplay(PMV_PSYCHROMETRIC_VIEW.tdbRangeSi.min),
  );
  return buildFilledPolygonTrace({
    name: SUPERSATURATED_MASK_TRACE_NAME,
    x: saturationCurve.x.concat([lastCurveX, leftX]),
    y: saturationCurve.y.concat([topY, topY]),
    fillcolor: PSYCHROMETRIC_PLOT_BACKGROUND,
    lineColor: PSYCHROMETRIC_PLOT_BACKGROUND,
    lineWidth: 0,
    opacity: 1,
    hoverinfo: "skip",
    hovertemplate: "",
  });
}

function buildRelativeHumidityCurveTrace(
  adapter: PmvStandardAdapter,
  baseline: PmvRequest,
  config: PmvFieldChartConfig,
  curve: DisplayedPsychrometricCurve,
  temperatureAxis: ChartAxisScale,
  humidityRatioAxis: ChartAxisScale,
): PlotTrace {
  const presentation = createPmvOutputPresentation(config);
  const hoverMetadata: PlotHoverRow[] = [];
  const text: string[] = [];

  curve.points.forEach(({ temperatureSi }) => {
    const evaluation = tryEvaluatePmvForChart(adapter, {
      ...baseline,
      tdb: temperatureSi,
      rh: curve.relativeHumidity,
    });
    hoverMetadata.push(presentation.getHoverMetadata(evaluation));
    text.push(
      evaluation ? presentation.getClassification(evaluation) : "Unclassified",
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
      classification: { label: presentation.classificationLabel, value: "%{text}" },
      pmv: presentation.pmvHoverToken,
      ppd: presentation.ppdHoverToken,
    }),
    text,
    hoverMetadata,
  });
}

function buildPsychrometricOverlays(
  adapter: PmvStandardAdapter,
  baseline: PmvRequest,
  config: PmvFieldChartConfig,
  temperatureAxis: ChartAxisScale,
  humidityRatioAxis: ChartAxisScale,
): PlotTrace[] {
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
  baseline: PmvRequest,
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
function createPsychrometricComfortZoneOverlayBuilder(
  source: PmvChartSource,
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

export const createPsychrometricViewDescriptor: PmvChartViewDescriptorFactory = (
  declaration,
  source,
  _resultsByInput,
  context,
) => {
  const { adapter } = declaration;
  const { unitSystem } = context;
  const baseline = getBaselineInputEntry(source.inputs, context.baselineInputId);
  const humidityRatioMeta = getQuantityDisplayMeta(
    PhysicalQuantityId.HumidityRatio,
    unitSystem,
  );
  const config: PmvFieldChartConfig = {
    ...context.fieldChartConfig,
    xField: PhysicalQuantityId.DryBulbTemperature,
    yField: PhysicalQuantityId.HumidityRatio,
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
    getInputYSi: (payload) => {
      const derived = source.derivedSlotsByInput?.[context.baselineInputId];
      const humidityRatio = derived?.[PhysicalQuantityId.DerivedHumidityRatio];
      if (typeof humidityRatio === "number" && Number.isFinite(humidityRatio)) {
        return humidityRatio;
      }
      return psy_ta_rh(payload.tdb, payload.rh).hr;
    },
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