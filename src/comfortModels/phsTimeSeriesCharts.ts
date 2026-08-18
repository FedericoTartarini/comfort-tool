import { CalculationSource } from "../models/calculationMetadata";
import type {
  PlotlyChartResponseDto,
  PlotScatterLineTraceDto,
} from "../models/comfortDtos";
import { ModelOutputKey } from "../models/modelCapabilities";
import {
  PHS_RECTAL_TEMPERATURE_LIMIT_C,
  type PhsTimeSeriesResult,
} from "../models/phs";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../models/units";
import {
  convertModelOutputFromSi,
} from "../services/units";
import { convertTemperatureFromSi } from "../services/units/temperature";

const RECTAL_COLOR = "#3BBDED";
const CORE_COLOR = "#1B679B";
const LIMIT_COLOR = "#ed3b3b";

function convertTemperature(valueC: number, unitSystem: UnitSystemType): number {
  return unitSystem === UnitSystem.IP ? convertTemperatureFromSi(valueC) : valueC;
}

function lineTrace(options: {
  name: string;
  x: number[];
  y: number[];
  color: string;
  unit: string;
  visible?: true | "legendonly";
  segmentNames?: string[];
  hoverInfo?: "all" | "skip";
}): PlotScatterLineTraceDto {
  return {
    type: "scatter",
    mode: "lines",
    name: options.name,
    x: options.x,
    y: options.y,
    showlegend: true,
    visible: options.visible,
    line: { color: options.color, width: 2 },
    marker: {},
    hoverinfo: options.hoverInfo,
    hovertemplate: options.hoverInfo === "skip"
      ? undefined
      : `%{customdata[0]}<br>Time: %{x:.2f} h<br>${options.name}: %{y:.2f} ${options.unit}<extra></extra>`,
    hoverMetadata: options.segmentNames?.map((name) => [name]),
  };
}

function paddedRange(values: readonly number[], minimumPadding: number): [number, number] {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = Math.max(minimumPadding, (maximum - minimum) * 0.08);
  return [minimum - padding, maximum + padding];
}

export function buildPhsTemperatureTimeSeriesChart(
  result: PhsTimeSeriesResult,
  unitSystem: UnitSystemType,
): PlotlyChartResponseDto {
  const x = result.points.map(({ hours }) => hours);
  const segmentNames = result.points.map(({ segmentName }) => segmentName);
  const tRe = result.points.map(({ tRe: value }) => convertTemperature(value, unitSystem));
  const tCr = result.points.map(({ tCr: value }) => convertTemperature(value, unitSystem));
  const limit = convertTemperature(PHS_RECTAL_TEMPERATURE_LIMIT_C, unitSystem);
  const unit = unitSystem === UnitSystem.IP ? "°F" : "°C";
  const maxHours = Math.max(result.totalDurationMinutes / 60, 1 / 60);

  return {
    traces: [
      lineTrace({
        name: "Rectal temperature",
        x,
        y: tRe,
        color: RECTAL_COLOR,
        unit,
        visible: true,
        segmentNames,
      }),
      lineTrace({
        name: "Core temperature",
        x,
        y: tCr,
        color: CORE_COLOR,
        unit,
        visible: "legendonly",
        segmentNames,
      }),
      lineTrace({
        name: "Maximum rectal temperature",
        x: [0, maxHours],
        y: [limit, limit],
        color: LIMIT_COLOR,
        unit,
        visible: true,
        hoverInfo: "skip",
      }),
    ],
    layout: {
      title: "PHS temperature over time",
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#ffffff",
      showlegend: true,
      margin: { l: 64, r: 24, t: 24, b: 72 },
      xaxis: {
        title: "Time (hours)",
        range: [0, maxHours],
        gridcolor: "#e2e8f0",
        showgrid: true,
        zeroline: false,
      },
      yaxis: {
        title: `Temperature (${unit})`,
        range: paddedRange(
          [...tRe, ...tCr, limit],
          unitSystem === UnitSystem.IP ? 1 : 0.5,
        ),
        gridcolor: "#e2e8f0",
        showgrid: true,
        zeroline: false,
      },
      legend: { orientation: "h", x: 0.5, y: -0.22 },
      height: 390,
    },
    annotations: [],
    source: CalculationSource.JsThermalComfort,
  };
}

export function buildPhsWaterLossTimeSeriesChart(
  result: PhsTimeSeriesResult,
  unitSystem: UnitSystemType,
): PlotlyChartResponseDto {
  const x = result.points.map(({ hours }) => hours);
  const segmentNames = result.points.map(({ segmentName }) => segmentName);
  const waterLoss = result.points.map(({ sweatLossG }) => (
    convertModelOutputFromSi(ModelOutputKey.PhsWaterLoss, sweatLossG, unitSystem)
  ));
  const limit = convertModelOutputFromSi(
    ModelOutputKey.PhsWaterLoss,
    result.waterLossLimitG,
    unitSystem,
  );
  const unit = unitSystem === UnitSystem.IP ? "lb" : "kg";
  const maxHours = Math.max(result.totalDurationMinutes / 60, 1 / 60);

  return {
    traces: [
      lineTrace({
        name: "Predicted cumulative water loss",
        x,
        y: waterLoss,
        color: CORE_COLOR,
        unit,
        visible: true,
        segmentNames,
      }),
      lineTrace({
        name: "Water-loss limit",
        x: [0, maxHours],
        y: [limit, limit],
        color: LIMIT_COLOR,
        unit,
        visible: true,
        hoverInfo: "skip",
      }),
    ],
    layout: {
      title: "PHS predicted water loss over time",
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#ffffff",
      showlegend: true,
      margin: { l: 64, r: 24, t: 24, b: 72 },
      xaxis: {
        title: "Time (hours)",
        range: [0, maxHours],
        gridcolor: "#e2e8f0",
        showgrid: true,
        zeroline: false,
      },
      yaxis: {
        title: `Water loss (${unit})`,
        range: [0, Math.max(limit, ...waterLoss) * 1.08],
        gridcolor: "#e2e8f0",
        showgrid: true,
        zeroline: false,
      },
      legend: { orientation: "h", x: 0.5, y: -0.22 },
      height: 360,
    },
    annotations: [],
    source: result.source,
  };
}
