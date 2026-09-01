import { CalculationSource } from "../../../../catalog/calculationMetadata";
import type {
  PlotAxis,
  PlotlyChartSpec,
  PlotScatterLineTrace,
} from "../../../plotlyTypes";
import type { ChartBuildContext } from "../../../../catalog/modelCapabilities";
import {
  UnitSystem,
  type UnitSystem as UnitSystemType,
} from "../../../../catalog/units";
import { convertFieldValueFromSi, plotlyHoverNumber } from "../../../units";
import { convertHeatFluxFromSi } from "../../../units/physicalQuantities";
import { convertTemperatureFromSi } from "../../../units/temperature";
import { createFieldAxisScale, formatAxisTitle } from "../axis";
import { buildCompareInputMarkerTraces } from "../inputPoints";
import { buildFilledPolygonTrace, buildLineTrace } from "../plotlyBuilders";
import { paddedSeriesRange } from "../timeSeriesLineChart";
import type {
  ParametricLimitBand,
  ParametricLineDataSpec,
  ParametricLineGeometry,
  ParametricPolyline,
  ParametricYUnit as ParametricYUnitType,
} from "./types";
import { ParametricYUnit } from "./types";
import type { InputId as InputIdType } from "../../../../catalog/inputSlots";

const LIMIT_BAND_OPACITY = 0.22;
const DEFAULT_MARGIN = { l: 56, r: 24, t: 48, b: 88 };

function convertParametricY(
  yUnit: ParametricYUnitType,
  valueSi: number,
  unitSystem: UnitSystemType,
): number {
  if (!Number.isFinite(valueSi)) return valueSi;
  if (unitSystem !== UnitSystem.IP) return valueSi;
  if (yUnit === ParametricYUnit.Temperature)
    return convertTemperatureFromSi(valueSi);
  if (yUnit === ParametricYUnit.HeatFlux) return convertHeatFluxFromSi(valueSi);
  return valueSi;
}

function unitsForParametricY(
  yUnit: ParametricYUnitType,
  unitSystem: UnitSystemType,
): string {
  if (yUnit === ParametricYUnit.Temperature) {
    return unitSystem === UnitSystem.IP ? "°F" : "°C";
  }
  if (yUnit === ParametricYUnit.HeatFlux) {
    return unitSystem === UnitSystem.IP ? "Btu/(h·ft²)" : "W/m²";
  }
  return "";
}

function axisTitleWithUnits(label: string, units: string): string {
  if (!label) return "";
  return units ? `${label} (${units})` : label;
}

function sharedAxisUnits(
  items: readonly { yUnit: ParametricYUnitType }[],
  unitSystem: UnitSystemType,
): string {
  const units = new Set(
    items.map((item) => unitsForParametricY(item.yUnit, unitSystem)),
  );
  return units.size === 1 ? ([...units][0] ?? "") : "";
}

function finitePoints(
  polyline: ParametricPolyline,
): Array<{ x: number; y: number }> {
  return polyline.points.filter(
    ({ x, y }) => Number.isFinite(x) && Number.isFinite(y),
  );
}

function polylineAxis(polyline: ParametricPolyline): "y" | "y2" {
  return polyline.yAxis ?? "y";
}

function bandAxis(band: ParametricLimitBand): "y" | "y2" {
  return band.yAxis ?? "y";
}

function buildLimitBandTrace(
  band: ParametricLimitBand,
  xDisplay: readonly number[],
  unitSystem: UnitSystemType,
): PlotScatterLineTrace | null {
  if (
    !Number.isFinite(band.min) ||
    !Number.isFinite(band.max) ||
    xDisplay.length === 0
  ) {
    return null;
  }
  const xMin = Math.min(...xDisplay);
  const xMax = Math.max(...xDisplay);
  const yMin = convertParametricY(band.yUnit, band.min, unitSystem);
  const yMax = convertParametricY(band.yUnit, band.max, unitSystem);
  return {
    ...buildFilledPolygonTrace({
      name: band.label,
      x: [xMin, xMax, xMax, xMin, xMin],
      y: [yMin, yMin, yMax, yMax, yMin],
      fillcolor: band.color,
      lineColor: band.color,
      lineWidth: 0,
      opacity: LIMIT_BAND_OPACITY,
      hoverinfo: "skip",
      isBackgroundZone: true,
    }),
    yaxis: bandAxis(band),
  };
}

function buildPolylineTrace(
  polyline: ParametricPolyline,
  xFieldLabel: string,
  xUnits: string,
  unitSystem: UnitSystemType,
  convertX: (valueSi: number) => number,
): PlotScatterLineTrace | null {
  const points = finitePoints(polyline);
  if (points.length === 0) return null;
  const yUnits = unitsForParametricY(polyline.yUnit, unitSystem);
  const xDisplay = points.map(({ x }) => convertX(x));
  const yDisplay = points.map(({ y }) =>
    convertParametricY(polyline.yUnit, y, unitSystem),
  );
  return {
    ...buildLineTrace({
      name: polyline.label,
      x: xDisplay,
      y: yDisplay,
      color: polyline.color,
      showlegend: true,
      visible: polyline.visible === false ? "legendonly" : true,
      lineWidth: 2,
      dash: polyline.dash,
      hovertemplate:
        `${polyline.label}<br>` +
        `${xFieldLabel}: ${plotlyHoverNumber("x")} ${xUnits}<br>` +
        `${polyline.label}: ${plotlyHoverNumber("y")}${yUnits ? ` ${yUnits}` : ""}` +
        `<extra></extra>`,
    }),
    yaxis: polylineAxis(polyline),
  };
}

function collectDisplayValues(
  geometry: ParametricLineGeometry,
  axis: "y" | "y2",
  unitSystem: UnitSystemType,
  convertX: (valueSi: number) => number,
  compareDisplay: readonly { x: number; y: number }[] = [],
): { x: number[]; y: number[] } {
  const x: number[] = [];
  const y: number[] = [];
  for (const polyline of geometry.polylines) {
    if (polylineAxis(polyline) !== axis) continue;
    for (const point of finitePoints(polyline)) {
      x.push(convertX(point.x));
      y.push(convertParametricY(polyline.yUnit, point.y, unitSystem));
    }
  }
  for (const band of geometry.limitBands ?? []) {
    if (bandAxis(band) !== axis) continue;
    y.push(convertParametricY(band.yUnit, band.min, unitSystem));
    y.push(convertParametricY(band.yUnit, band.max, unitSystem));
  }
  if (axis === "y") {
    for (const point of compareDisplay) {
      x.push(point.x);
      y.push(point.y);
    }
  }
  return { x, y };
}

function toPlotAxis(
  title: string,
  values: readonly number[],
  extras: Partial<PlotAxis> = {},
): PlotAxis {
  const range: [number, number] =
    values.length > 0 ? paddedSeriesRange(values, 0.1) : [0, 1];
  return {
    title,
    range,
    ...extras,
  };
}

export function buildModelParametricLineChart<TResult>(
  spec: ParametricLineDataSpec<TResult>,
  chartSource: unknown,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
): PlotlyChartSpec | null {
  const geometry = spec.getGeometry(chartSource, resultsByInput, context);
  if (!geometry) return null;
  return renderParametricLineGeometry(spec, geometry, context);
}

export function renderParametricLineGeometry(
  spec: Pick<
    ParametricLineDataSpec<unknown>,
    "title" | "xField" | "yLabel" | "y2Label"
  >,
  geometry: ParametricLineGeometry,
  context: ChartBuildContext,
): PlotlyChartSpec | null {
  const xAxis = createFieldAxisScale({
    field: spec.xField,
    unitSystem: context.unitSystem,
    points: 2,
  });
  const convertX = (valueSi: number) =>
    convertFieldValueFromSi(spec.xField, valueSi, context.unitSystem);

  const polylineTraces = geometry.polylines.flatMap((polyline) => {
    const trace = buildPolylineTrace(
      polyline,
      xAxis.label,
      xAxis.units,
      context.unitSystem,
      convertX,
    );
    return trace ? [trace] : [];
  });
  if (polylineTraces.length === 0) return null;

  const compareYUnit =
    geometry.polylines.find((polyline) => polylineAxis(polyline) === "y")
      ?.yUnit ?? ParametricYUnit.Identity;
  const comparePointsByInput: Partial<
    Record<InputIdType, { x: number; y: number }>
  > = {};
  const compareDisplay: Array<{ x: number; y: number }> = [];
  for (const [inputId, point] of Object.entries(geometry.comparePoints ?? {})) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      continue;
    }
    const converted = {
      x: convertX(point.x),
      y: convertParametricY(compareYUnit, point.y, context.unitSystem),
    };
    comparePointsByInput[inputId as InputIdType] = converted;
    compareDisplay.push(converted);
  }

  const primaryValues = collectDisplayValues(
    geometry,
    "y",
    context.unitSystem,
    convertX,
    compareDisplay,
  );
  const secondaryValues = collectDisplayValues(
    geometry,
    "y2",
    context.unitSystem,
    convertX,
  );
  const hasSecondary = secondaryValues.y.length > 0;
  const xDisplay =
    primaryValues.x.length > 0 ? primaryValues.x : secondaryValues.x;

  const bandTraces = (geometry.limitBands ?? []).flatMap((band) => {
    const trace = buildLimitBandTrace(band, xDisplay, context.unitSystem);
    return trace ? [trace] : [];
  });

  const primaryUnits = sharedAxisUnits(
    [
      ...geometry.polylines.filter(
        (polyline) => polylineAxis(polyline) === "y",
      ),
      ...(geometry.limitBands ?? []).filter((band) => bandAxis(band) === "y"),
    ],
    context.unitSystem,
  );
  const secondaryItems = [
    ...geometry.polylines.filter((polyline) => polylineAxis(polyline) === "y2"),
    ...(geometry.limitBands ?? []).filter((band) => bandAxis(band) === "y2"),
  ];
  const secondaryUnits = sharedAxisUnits(secondaryItems, context.unitSystem);

  return {
    traces: [
      ...bandTraces,
      ...polylineTraces,
      ...buildCompareInputMarkerTraces(comparePointsByInput),
    ],
    layout: {
      title: spec.title ?? "",
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#f8fafc",
      showlegend: true,
      margin: {
        ...DEFAULT_MARGIN,
        r: hasSecondary ? 72 : DEFAULT_MARGIN.r,
      },
      legend: { orientation: "h", x: 0, y: -0.22 },
      xaxis: toPlotAxis(formatAxisTitle(xAxis), xDisplay, {
        showgrid: true,
        zeroline: false,
      }),
      yaxis: toPlotAxis(
        axisTitleWithUnits(spec.yLabel, primaryUnits),
        primaryValues.y,
        { showgrid: true, zeroline: false },
      ),
      ...(hasSecondary
        ? {
            yaxis2: toPlotAxis(
              axisTitleWithUnits(spec.y2Label ?? "", secondaryUnits),
              secondaryValues.y,
              {
                side: "right",
                overlaying: "y",
                showgrid: false,
                zeroline: false,
              },
            ),
          }
        : {}),
    },
    annotations: [],
    source: CalculationSource.FrontendGenerated,
  };
}
