import type { PlotTrace } from "../../engines/plotlyTypes";
import { PhysicalQuantityId, getQuantityDisplayMeta } from "../../catalog/quantities";
import { UnitSystem } from "../../catalog/units";
import type { InputId as InputIdType } from "../../catalog/inputSlots";
import { ModelOutputKey, type NumericBand } from "../../catalog/modelCapabilities";
import {
  buildRelativeHumidityCurvePoints,
  humidityRatioSi,
  sampleRelativeHumidityValues,
} from "../../charts/psychrometric/humidity";
import {
  buildComfortZoneOutline,
  buildPsychrometricBandFills,
  sampleIsolines,
  type FieldEvaluate,
  type IsolinePoint,
} from "../../charts/psychrometric/isolines";
import {
  buildComfortPolygonTrace,
  buildFilledPolygonTrace,
  buildLineTrace,
} from "../../engines/comfort/charts/plotlyBuilders";
import type {
  ChartAxisScale,
} from "../../engines/comfort/charts/types";
import { getBaselineInputEntry, roundValue } from "../../engines/comfort/helpers";
import {
  PMV_PSYCHROMETRIC_VIEW,
  evaluatePsychrometricPmv,
  pmvNeutralZone,
  ppdThresholdToAbsPmv,
  psychrometricPmvRequest,
  tryEvaluatePmvForChart,
  type PmvChartEvaluation,
  type PmvRequest,
} from "./calculation";
import type { PmvStandardAdapter } from "./shared";
import {
  CONTOUR_GRID_RESOLUTION,
  type PmvChartViewDescriptorFactory,
  type PmvFieldChartConfig,
  type PmvInputOverlayBuilder,
} from "./chartShared";
import { calculateRelativeHumidityFromHumidityRatio } from "../../engines/comfort/derivations";

const CHART_COLOR_RH_LINE = "#94a3b8";
const PSYCHROMETRIC_PLOT_BACKGROUND = "#f8fafc";
const SUPERSATURATED_MASK_TRACE_NAME = "Supersaturated region mask";
const COMFORT_ISOLINE_TARGETS = [pmvNeutralZone.min, pmvNeutralZone.max];

interface DisplayedPsychrometricCurve {
  relativeHumidity: number;
  x: number[];
  y: number[];
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values.filter(Number.isFinite))].sort((left, right) => left - right);
}

function evaluatePmvField(
  adapter: PmvStandardAdapter,
  payload: PmvRequest,
  tdb: number,
  rh: number,
  trEqualsTdb: boolean,
): number | null {
  return evaluatePsychrometricPmv(adapter, payload, tdb, rh, trEqualsTdb);
}

function pmvIsolineTargetsForBands(
  bands: readonly NumericBand[],
  zOutput: ModelOutputKey,
): number[] {
  const edges = uniqueSorted(bands.flatMap((band) => [band.min, band.max]));
  if (zOutput === ModelOutputKey.Ppd) {
    return uniqueSorted(edges.flatMap((ppd) => {
      const absPmv = ppdThresholdToAbsPmv(ppd);
      if (!Number.isFinite(absPmv) || absPmv === 0) return [];
      return [-absPmv, absPmv];
    }));
  }
  return edges;
}

function isolineTargetsIncludingComfort(
  bands: readonly NumericBand[],
  zOutput: ModelOutputKey,
): number[] {
  return uniqueSorted([
    ...pmvIsolineTargetsForBands(bands, zOutput),
    pmvNeutralZone.min,
    pmvNeutralZone.max,
  ]);
}

function samplePmvIsolines(
  adapter: PmvStandardAdapter,
  payload: PmvRequest,
  targets: readonly number[],
  rhValues: readonly number[],
  trEqualsTdb: boolean,
): Map<number, IsolinePoint[]> {
  return sampleIsolines(
    (tdb, rh) => evaluatePmvField(adapter, payload, tdb, rh, trEqualsTdb),
    targets,
    rhValues,
    PMV_PSYCHROMETRIC_VIEW.tdbRangeSi,
  );
}

function evaluatePsychrometricPoint(
  adapter: PmvStandardAdapter,
  baseline: PmvRequest,
  tdb: number,
  humidityRatio: number,
  trEqualsTdb: boolean,
): PmvChartEvaluation | null {
  const unboundedRh = calculateRelativeHumidityFromHumidityRatio(tdb, humidityRatio);
  if (unboundedRh > 100) return null;

  const rh = Math.max(0, unboundedRh);
  return tryEvaluatePmvForChart(
    adapter,
    psychrometricPmvRequest(baseline, tdb, rh, trEqualsTdb),
  );
}

function buildDisplayedRelativeHumidityCurve(
  relativeHumidity: number,
  temperatureAxis: ChartAxisScale,
  humidityRatioAxis: ChartAxisScale,
): DisplayedPsychrometricCurve {
  const points = buildRelativeHumidityCurvePoints(
    relativeHumidity,
    PMV_PSYCHROMETRIC_VIEW,
  );
  return {
    relativeHumidity,
    x: points.map(({ temperatureSi }) => (
      roundValue(temperatureAxis.toDisplay(temperatureSi))
    )),
    y: points.map(({ humidityRatioSi: humidityRatio }) => (
      roundValue(humidityRatioAxis.toDisplay(humidityRatio))
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
  curve: DisplayedPsychrometricCurve,
): PlotTrace {
  return buildLineTrace({
    name: `RH ${curve.relativeHumidity}%`,
    x: curve.x,
    y: curve.y,
    color: CHART_COLOR_RH_LINE,
    hoverinfo: "skip",
    hovertemplate: "",
  });
}

function buildBandFillTraces(
  polygons: ReturnType<typeof buildPsychrometricBandFills>,
  opacity: number,
): PlotTrace[] {
  return polygons.map((polygon) => buildFilledPolygonTrace({
    name: polygon.name,
    x: polygon.x,
    y: polygon.y,
    fillcolor: polygon.color,
    lineColor: polygon.color,
    lineWidth: 1.5,
    opacity,
    hoverinfo: "skip",
    hovertemplate: "",
    isBackgroundZone: true,
  }));
}

function buildPsychrometricOverlays(
  config: PmvFieldChartConfig,
  outputLabel: string,
  isolines: Map<number, IsolinePoint[]>,
  evaluate: FieldEvaluate,
  rhValues: readonly number[],
  temperatureAxis: ChartAxisScale,
  humidityRatioAxis: ChartAxisScale,
  opacity: number,
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
  const bandFills = buildBandFillTraces(
    buildPsychrometricBandFills({
      bands: config.bands,
      isolines,
      outputLabel,
      xScale: temperatureAxis,
      yScale: humidityRatioAxis,
      extents: PMV_PSYCHROMETRIC_VIEW,
      layout: config.zOutput === ModelOutputKey.Ppd ? "radial" : "monotonic",
      evaluate,
      rhValues,
      absFromThreshold: config.zOutput === ModelOutputKey.Ppd
        ? ppdThresholdToAbsPmv
        : undefined,
    }),
    opacity,
  );
  return [
    ...(mask ? [mask] : []),
    ...bandFills,
    ...curves
      .filter(({ x }) => x.length > 0)
      .map((curve) => buildRelativeHumidityCurveTrace(curve)),
  ];
}

function createPsychrometricComfortZoneOverlayBuilder(
  adapter: PmvStandardAdapter,
  baselineInputId: InputIdType,
  baselineIsolines: Map<number, IsolinePoint[]>,
  xAxis: ChartAxisScale,
  yAxis: ChartAxisScale,
  trEqualsTdb: boolean,
): PmvInputOverlayBuilder {
  const rhValues = sampleRelativeHumidityValues(PMV_PSYCHROMETRIC_VIEW.tdbPoints);
  return ({ inputId, payload }) => {
    const isolines = inputId === baselineInputId
      ? baselineIsolines
      : samplePmvIsolines(
          adapter,
          payload,
          COMFORT_ISOLINE_TARGETS,
          rhValues,
          trEqualsTdb,
        );
    const outline = buildComfortZoneOutline(
      isolines,
      pmvNeutralZone.min,
      pmvNeutralZone.max,
      xAxis,
      yAxis,
      PMV_PSYCHROMETRIC_VIEW,
    );
    if (!outline) return [];
    return [buildComfortPolygonTrace({
      inputId,
      nameSuffix: "comfort zone",
      polygonX: outline.x,
      polygonY: outline.y,
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
  const trEqualsTdb = source.psychrometricTrEqualsTdb;
  const config: PmvFieldChartConfig = {
    ...context.fieldChartConfig,
    xField: trEqualsTdb
      ? PhysicalQuantityId.OperativeTemperature
      : PhysicalQuantityId.DryBulbTemperature,
    yField: PhysicalQuantityId.HumidityRatio,
  };
  const output = declaration.exploreOutputs.find(({ key }) => key === config.zOutput);
  const outputLabel = output?.label ?? "PMV";
  const rhValues = sampleRelativeHumidityValues(PMV_PSYCHROMETRIC_VIEW.tdbPoints);
  const baselineIsolines = samplePmvIsolines(
    adapter,
    baseline.payload,
    isolineTargetsIncludingComfort(config.bands, config.zOutput),
    rhValues,
    trEqualsTdb,
  );

  return {
    config,
    title: `${declaration.label} Psychrometric Chart`,
    xAxis: {
      field: config.xField,
      rangeSi: PMV_PSYCHROMETRIC_VIEW.tdbRangeSi,
      points: CONTOUR_GRID_RESOLUTION,
      // CBE d3 default ticks on 10–36°C are ~2°C (IP ~5°F).
      dtick: unitSystem === UnitSystem.IP ? 5 : 2,
    },
    yAxis: {
      field: config.yField,
      rangeSi: PMV_PSYCHROMETRIC_VIEW.humidityRatioRangeSi,
      points: CONTOUR_GRID_RESOLUTION,
    },
    coordinateDecimals: humidityRatioMeta.decimals,
    opacity: 0.8,
    plotBgColor: PSYCHROMETRIC_PLOT_BACKGROUND,
    omitBandFillTraces: true,
    evaluatePoint: (tdb, humidityRatio) => evaluatePsychrometricPoint(
      adapter,
      baseline.payload,
      tdb,
      humidityRatio,
      trEqualsTdb,
    ),
    getInputXSi: (payload) => payload.tdb,
    getInputYSi: (payload) => {
      const derived = source.derivedSlotsByInput?.[context.baselineInputId];
      const humidityRatio = derived?.[PhysicalQuantityId.DerivedHumidityRatio];
      if (typeof humidityRatio === "number" && Number.isFinite(humidityRatio)) {
        return humidityRatio;
      }
      return humidityRatioSi(payload.tdb, payload.rh);
    },
    chartOverlays: ({ xAxis, yAxis }) => buildPsychrometricOverlays(
      config,
      outputLabel,
      baselineIsolines,
      (tdb, rh) => evaluatePmvField(
        adapter,
        baseline.payload,
        tdb,
        rh,
        trEqualsTdb,
      ),
      rhValues,
      xAxis,
      yAxis,
      0.8,
    ),
    getInputOverlayBuilder: (xAxis, yAxis) => (
      createPsychrometricComfortZoneOverlayBuilder(
        adapter,
        context.baselineInputId,
        baselineIsolines,
        xAxis,
        yAxis,
        trEqualsTdb,
      )
    ),
    margin: { l: 56, r: 24, t: 48, b: 80 },
  };
};
