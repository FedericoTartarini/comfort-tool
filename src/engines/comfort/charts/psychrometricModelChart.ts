import { CalculationSource } from "../../../catalog/calculationMetadata";
import type { CompareInputMap, ModelChartSource } from "../../../catalog/chartSource";
import { PhysicalQuantityId } from "../../../catalog/quantities";
import type { DerivedSlotQuantityState } from "../derivations/psychrometrics";
import type { InputId as InputIdType } from "../../../catalog/inputSlots";
import {
  findNumericBandIndexForValue,
  type ChartBuildContext,
  type NumericBand,
} from "../../../catalog/modelCapabilities";
import { UnitSystem } from "../../../catalog/units";
import {
  DEFAULT_PSYCHROMETRIC_VIEW,
  buildRelativeHumidityCurvePoints,
  humidityRatioSi,
  sampleRelativeHumidityValues,
} from "../../../charts/psychrometric/humidity";
import {
  buildComfortZoneOutline,
  buildPsychrometricBandFills,
  sampleIsolines,
  type IsolinePoint,
} from "../../../charts/psychrometric/isolines";
import { calculateRelativeHumidityFromHumidityRatio } from "../derivations";
import { getBaselineInputEntry, roundValue } from "../helpers";
import type { PlotTrace } from "../../plotlyTypes";
import { formatDisplayValue, plotlyHoverNumber } from "../../units";
import type { ChartPlotlyBuild } from "./chartBuildResult";
import {
  buildFieldChart,
  createEmptyFieldStrategy,
  createFieldChartAxis,
} from "./fieldChartEngine";
import { createDisplayHoverProbe } from "./hoverProbe";
import {
  buildComfortPolygonTrace,
  buildFilledPolygonTrace,
  buildHoverTemplate,
  buildLineTrace,
} from "./plotlyBuilders";
import type { ChartAxisScale } from "./types";
import type { PsychrometricDataSpec, PsychrometricHoverSample } from "./kinds/types";

const EMPTY_AXIS_POINTS = 2;
const CHART_COLOR_RH_LINE = "#94a3b8";
const PSYCHROMETRIC_PLOT_BACKGROUND = "#f8fafc";
const SUPERSATURATED_MASK_TRACE_NAME = "Supersaturated region mask";
const VIEW = DEFAULT_PSYCHROMETRIC_VIEW;

interface PsychrometricPayload {
  tdb: number;
  rh: number;
  tr?: number;
}

interface PsychrometricSource extends ModelChartSource<PsychrometricPayload> {
  psychrometricTrEqualsTdb?: boolean;
  derivedSlotsByInput?: CompareInputMap<DerivedSlotQuantityState>;
}

interface DisplayedPsychrometricCurve {
  relativeHumidity: number;
  x: number[];
  y: number[];
}

type EvaluatePmv = (
  payload: PsychrometricPayload,
  tdb: number,
  rh: number,
) => number | null;

function atPoint(
  payload: PsychrometricPayload,
  tdb: number,
  rh: number,
  trEqualsTdb: boolean,
): PsychrometricPayload {
  return trEqualsTdb
    ? { ...payload, tdb, tr: tdb, rh }
    : { ...payload, tdb, rh };
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values.filter(Number.isFinite))].sort((left, right) => left - right);
}

function asSource(chartSource: unknown): PsychrometricSource | null {
  if (
    chartSource
    && typeof chartSource === "object"
    && "inputs" in chartSource
  ) {
    return chartSource as PsychrometricSource;
  }
  return null;
}

function pmvIsolineTargetsForBands(
  bands: readonly NumericBand[],
  zOutput: PhysicalQuantityId,
  absFromThreshold?: (ppd: number) => number,
): number[] {
  const edges = uniqueSorted(bands.flatMap((band) => [band.min, band.max]));
  if (zOutput === PhysicalQuantityId.PredictedPercentageOfDissatisfied && absFromThreshold) {
    return uniqueSorted(edges.flatMap((ppd) => {
      const absPmv = absFromThreshold(ppd);
      if (!Number.isFinite(absPmv) || absPmv === 0) return [];
      return [-absPmv, absPmv];
    }));
  }
  return edges;
}

function sampleFieldIsolines(
  evaluate: EvaluatePmv,
  payload: PsychrometricPayload,
  targets: readonly number[],
  rhValues: readonly number[],
  trEqualsTdb: boolean,
): Map<number, IsolinePoint[]> {
  return sampleIsolines(
    (tdb, rh) => evaluate(atPoint(payload, tdb, rh, trEqualsTdb), tdb, rh),
    targets,
    rhValues,
    VIEW.tdbRangeSi,
  );
}

function buildDisplayedRelativeHumidityCurve(
  relativeHumidity: number,
  temperatureAxis: ChartAxisScale,
  humidityRatioAxis: ChartAxisScale,
): DisplayedPsychrometricCurve {
  const points = buildRelativeHumidityCurvePoints(relativeHumidity, VIEW);
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
    humidityRatioAxis.toDisplay(VIEW.humidityRatioRangeSi.max),
  );
  const leftX = roundValue(
    temperatureAxis.toDisplay(VIEW.tdbRangeSi.min),
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

function buildPsychrometricHoverTemplate(options: {
  xAxis: ChartAxisScale;
  yAxis: ChartAxisScale;
  classificationLabel: string;
  classification: string | null;
  pmv: string | null;
  ppd: string | null;
  inputLabel: string | null;
}): string {
  return buildHoverTemplate([
    options.inputLabel,
    `${options.xAxis.label}: ${plotlyHoverNumber("x")} ${options.xAxis.units}`,
    `${options.yAxis.label}: ${plotlyHoverNumber("y")} ${options.yAxis.units}`,
    options.classification === null
      ? null
      : `<b>${options.classificationLabel}: ${options.classification}</b>`,
    options.pmv === null ? null : `PMV: ${options.pmv}`,
    options.ppd === null ? null : `PPD: ${options.ppd}`,
  ]);
}

function humidityRatioForPayload(
  source: PsychrometricSource,
  payload: PsychrometricPayload,
  baselineInputId: InputIdType,
): number {
  const derived = source.derivedSlotsByInput?.[baselineInputId];
  const humidityRatio = derived?.[PhysicalQuantityId.HumidityRatio];
  if (typeof humidityRatio === "number" && Number.isFinite(humidityRatio)) {
    return humidityRatio;
  }
  return humidityRatioSi(payload.tdb, payload.rh);
}

function sampleAtHumidityRatio(
  spec: PsychrometricDataSpec,
  payload: PsychrometricPayload,
  tdb: number,
  humidityRatio: number,
  trEqualsTdb: boolean,
): PsychrometricHoverSample | null {
  const unboundedRh = calculateRelativeHumidityFromHumidityRatio(tdb, humidityRatio);
  if (unboundedRh > 100) return null;
  const rh = Math.max(0, unboundedRh);
  const point = atPoint(payload, tdb, rh, trEqualsTdb);
  const evaluateHover = spec.evaluateHover as
    | ((payload: PsychrometricPayload, tdb: number, rh: number) => PsychrometricHoverSample | null)
    | undefined;
  if (evaluateHover) {
    return evaluateHover(point, tdb, rh);
  }
  const evaluate = spec.evaluate as EvaluatePmv;
  const pmv = evaluate(point, tdb, rh);
  if (pmv == null || !Number.isFinite(pmv)) return null;
  return { pmv, ppd: Number.NaN };
}

export function buildPsychrometricModelChart(
  spec: PsychrometricDataSpec,
  chartSource: unknown,
  resultsByInput: Record<InputIdType, unknown>,
  context: ChartBuildContext,
): ChartPlotlyBuild | null {
  const source = asSource(chartSource);
  if (!source) return null;
  const baseline = getBaselineInputEntry(source.inputs, context.baselineInputId);
  const trEqualsTdb = spec.trEqualsTdb(source, context);
  const evaluate = spec.evaluate as EvaluatePmv;
  const config = context.fieldChartConfig;
  const bands = config.bands as readonly NumericBand[];
  const zOutput = config.zOutput;
  const isPpdOutput = zOutput === PhysicalQuantityId.PredictedPercentageOfDissatisfied;
  const outputLabel = isPpdOutput ? "PPD (%)" : "PMV";
  const classificationLabel = isPpdOutput ? "Band" : "Zone";
  const xField = trEqualsTdb
    ? PhysicalQuantityId.OperativeTemperature
    : PhysicalQuantityId.DryBulbTemperature;
  const rhValues = sampleRelativeHumidityValues(VIEW.tdbPoints);
  const comfortTargets = spec.comfortIsolineTargets ?? [];
  const isolineTargets = uniqueSorted([
    ...pmvIsolineTargetsForBands(bands, zOutput, spec.ppdThresholdToAbsPmv),
    ...(isPpdOutput ? [] : comfortTargets),
  ]);
  const baselineIsolines = sampleFieldIsolines(
    evaluate,
    baseline.payload,
    isolineTargets,
    rhValues,
    trEqualsTdb,
  );
  const xAxisSpec = {
    field: xField,
    rangeSi: VIEW.tdbRangeSi,
    points: EMPTY_AXIS_POINTS,
    dtick: context.unitSystem === UnitSystem.IP ? 5 : 2,
  };
  const yAxisSpec = {
    field: PhysicalQuantityId.HumidityRatio,
    rangeSi: VIEW.humidityRatioRangeSi,
    points: EMPTY_AXIS_POINTS,
  };
  const xAxis = createFieldChartAxis(xAxisSpec, context.unitSystem);
  const yAxis = createFieldChartAxis(yAxisSpec, context.unitSystem);
  const title = spec.title ?? "Psychrometric";

  const classify = (sample: PsychrometricHoverSample): string => {
    const valueSi = isPpdOutput ? sample.ppd : sample.pmv;
    const bandIndex = findNumericBandIndexForValue(bands, valueSi);
    return bandIndex === undefined ? "Unclassified" : bands[bandIndex]!.label;
  };

  const plotly = buildFieldChart<PsychrometricPayload>({
    unitSystem: context.unitSystem,
    xAxis: xAxisSpec,
    yAxis: yAxisSpec,
    strategy: createEmptyFieldStrategy(),
    chartOverlays: ({ xAxis: temperatureAxis, yAxis: humidityRatioAxis }) => {
      const curves = VIEW.rhCurves.map((relativeHumidity) => (
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
          bands,
          isolines: baselineIsolines,
          outputLabel,
          xScale: temperatureAxis,
          yScale: humidityRatioAxis,
          extents: VIEW,
          layout: isPpdOutput ? "radial" : "monotonic",
          evaluate: (tdb, rh) => evaluate(
            atPoint(baseline.payload, tdb, rh, trEqualsTdb),
            tdb,
            rh,
          ),
          rhValues,
          absFromThreshold: isPpdOutput ? spec.ppdThresholdToAbsPmv : undefined,
        }),
        0.8,
      );
      return [
        ...(mask ? [mask] : []),
        ...bandFills,
        ...curves
          .filter(({ x }) => x.length > 0)
          .map((curve) => buildRelativeHumidityCurveTrace(curve)),
      ];
    },
    inputGroups: ({ xAxis: temperatureAxis, yAxis: humidityRatioAxis }) => [{
      inputsMap: source.inputs,
      resultsByInput,
      getXSi: (payload) => payload.tdb,
      getYSi: (payload) => humidityRatioForPayload(source, payload, context.baselineInputId),
      getHovertemplate: ({ inputLabel, payload }) => {
        const sample = sampleAtHumidityRatio(
          spec,
          payload,
          payload.tdb,
          humidityRatioSi(payload.tdb, payload.rh),
          trEqualsTdb,
        );
        return buildPsychrometricHoverTemplate({
          inputLabel,
          xAxis: temperatureAxis,
          yAxis: humidityRatioAxis,
          classificationLabel,
          classification: sample ? classify(sample) : null,
          pmv: sample ? formatDisplayValue(sample.pmv) : null,
          ppd: sample && Number.isFinite(sample.ppd)
            ? `${formatDisplayValue(sample.ppd)}%`
            : null,
        });
      },
      buildOverlayTraces: comfortTargets.length < 2
        ? undefined
        : ({ inputId, payload }) => {
            const isolines = inputId === context.baselineInputId
              ? baselineIsolines
              : sampleFieldIsolines(
                  evaluate,
                  payload,
                  comfortTargets,
                  rhValues,
                  trEqualsTdb,
                );
            const outline = buildComfortZoneOutline(
              isolines,
              comfortTargets[0]!,
              comfortTargets[1]!,
              temperatureAxis,
              humidityRatioAxis,
              VIEW,
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
          },
    }],
    layout: {
      title: `${title} — ${outputLabel}`,
      margin: { l: 56, r: 24, t: 48, b: 80 },
      plotBgColor: PSYCHROMETRIC_PLOT_BACKGROUND,
      legend: { orientation: "h", x: 0, y: 1.1 },
    },
    source: CalculationSource.FrontendGenerated,
  });

  return {
    spec: plotly,
    hoverProbe: createDisplayHoverProbe(xAxis, yAxis, (tdb, humidityRatio) => {
      const sample = sampleAtHumidityRatio(
        spec,
        baseline.payload,
        tdb,
        humidityRatio,
        trEqualsTdb,
      );
      if (!sample) return null;
      return {
        hovertemplate: buildPsychrometricHoverTemplate({
          inputLabel: null,
          xAxis,
          yAxis,
          classificationLabel,
          classification: classify(sample),
          pmv: formatDisplayValue(sample.pmv),
          ppd: Number.isFinite(sample.ppd)
            ? `${formatDisplayValue(sample.ppd)}%`
            : null,
        }),
      };
    }),
  };
}
