import type {
  PlotlyChartSpec,
  PlotScatterLineTrace,
} from "../../services/plotlyTypes";
import { ModelOutputKey } from "../../catalog/modelCapabilities";
import {
  PHS_RECTAL_TEMPERATURE_LIMIT_C,
  type PhsHistorySample,
  type PhsSimulationResult,
  type PhsTimeSeriesDraft,
} from "../../catalog/phs";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../catalog/units";
import {
  buildTimeSeriesLineTrace,
  crossesSeriesThreshold,
  paddedSeriesRange,
} from "../../services/comfort/charts/timeSeriesLineChart";
import { convertModelOutputFromSi } from "../../services/units";
import { convertTemperatureFromSi } from "../../services/units/temperature";

const RECTAL_COLOR = "#3BBDED";
const CORE_COLOR = "#1B679B";
const LIMIT_COLOR = "#ed3b3b";
const BOUNDARY_COLOR = "#94a3b8";
const DEFAULT_MAX_CHART_SAMPLES = 2_000;

interface DownsampleOptions {
  maxPoints?: number;
  temperatureThresholdsC?: readonly number[];
  waterLossThresholdsG?: readonly number[];
}

interface TemperatureHistoryChartOptions {
  title: string;
  thresholdC: number;
  thresholdLabel: string;
  markerMinute?: number | null;
  markerLabel?: string;
  segmentBoundariesMinutes?: readonly number[];
  segmentNamesById?: Readonly<Record<string, string>>;
}

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
  showLegend?: boolean;
  dash?: "solid" | "dot" | "dash";
  width?: number;
}): PlotScatterLineTrace {
  return buildTimeSeriesLineTrace(options);
}

function paddedRange(values: readonly number[], minimumPadding: number): [number, number] {
  return paddedSeriesRange(values, minimumPadding);
}

function crossesThreshold(before: number, after: number, threshold: number): boolean {
  return crossesSeriesThreshold(before, after, threshold);
}

function addSeriesExtrema(
  indexes: Set<number>,
  samples: readonly PhsHistorySample[],
  start: number,
  end: number,
) {
  const keys = ["tRe", "tCr", "sweatLossG"] as const;
  for (const key of keys) {
    let minimumIndex = start;
    let maximumIndex = start;
    for (let index = start + 1; index < end; index += 1) {
      if (samples[index][key] < samples[minimumIndex][key]) minimumIndex = index;
      if (samples[index][key] > samples[maximumIndex][key]) maximumIndex = index;
    }
    indexes.add(minimumIndex);
    indexes.add(maximumIndex);
  }
}

/**
 * Reduces chart payload size while retaining phase transitions, global/bucket
 * extrema, threshold crossings, and the final physiological state.
 */
export function downsamplePhsHistorySamples(
  samples: readonly PhsHistorySample[],
  options: DownsampleOptions = {},
): PhsHistorySample[] {
  const maxPoints = options.maxPoints ?? DEFAULT_MAX_CHART_SAMPLES;
  if (samples.length <= maxPoints) return samples.map((sample) => ({ ...sample }));

  const required = new Set<number>([0, samples.length - 1]);
  addSeriesExtrema(required, samples, 0, samples.length);

  for (let index = 1; index < samples.length; index += 1) {
    const before = samples[index - 1];
    const after = samples[index];
    if (before.segmentId !== after.segmentId) {
      required.add(index - 1);
      required.add(index);
    }
    for (const threshold of options.temperatureThresholdsC ?? []) {
      if (crossesThreshold(before.tRe, after.tRe, threshold)) {
        required.add(index - 1);
        required.add(index);
      }
    }
    for (const threshold of options.waterLossThresholdsG ?? []) {
      if (crossesThreshold(before.sweatLossG, after.sweatLossG, threshold)) {
        required.add(index - 1);
        required.add(index);
      }
    }
  }

  if (required.size < maxPoints) {
    const available = maxPoints - required.size;
    const bucketCount = Math.max(1, Math.floor(available / 6));
    const bucketSize = Math.ceil(samples.length / bucketCount);
    for (let start = 0; start < samples.length; start += bucketSize) {
      addSeriesExtrema(
        required,
        samples,
        start,
        Math.min(samples.length, start + bucketSize),
      );
    }
  }

  if (required.size < maxPoints) {
    const targetAdditionalPoints = maxPoints - required.size;
    const spacing = (samples.length - 1) / (targetAdditionalPoints + 1);
    for (let step = 1; step <= targetAdditionalPoints; step += 1) {
      required.add(Math.round(step * spacing));
    }
    for (let index = 1; required.size < maxPoints && index < samples.length; index += 1) {
      required.add(index);
    }
  }

  return [...required]
    .sort((left, right) => left - right)
    .map((index) => ({ ...samples[index] }));
}

export function findFirstRectalThresholdCrossingMinute(
  samples: readonly PhsHistorySample[],
  thresholdC: number,
): number | null {
  const sample = samples.find(({ tRe }) => tRe >= thresholdC);
  return sample?.minute ?? null;
}

function requireHistory(result: PhsSimulationResult): readonly PhsHistorySample[] {
  if (!result.samples || result.samples.length === 0) {
    throw new Error("PHS history chart requires retained simulation samples.");
  }
  return result.samples;
}

function buildBoundaryTrace(
  boundariesMinutes: readonly number[],
  yRange: [number, number],
): PlotScatterLineTrace | null {
  if (boundariesMinutes.length === 0) return null;
  const x: number[] = [];
  const y: number[] = [];
  for (const minute of boundariesMinutes) {
    x.push(minute / 60, minute / 60, Number.NaN);
    y.push(yRange[0], yRange[1], Number.NaN);
  }
  return lineTrace({
    name: "Segment boundaries",
    x,
    y,
    color: BOUNDARY_COLOR,
    unit: "",
    hoverInfo: "skip",
    showLegend: false,
    dash: "dot",
    width: 1,
  });
}

export function buildPhsTemperatureHistoryChart(
  result: PhsSimulationResult,
  unitSystem: UnitSystemType,
  options: TemperatureHistoryChartOptions,
): PlotlyChartSpec {
  const samples = downsamplePhsHistorySamples(requireHistory(result), {
    temperatureThresholdsC: [options.thresholdC],
    waterLossThresholdsG: [result.waterLossLimitG],
  });
  const x = samples.map(({ hours }) => hours);
  const segmentNames = samples.map(({ segmentId, segmentName }) => (
    options.segmentNamesById?.[segmentId] ?? segmentName
  ));
  const tRe = samples.map(({ tRe: value }) => convertTemperature(value, unitSystem));
  const tCr = samples.map(({ tCr: value }) => convertTemperature(value, unitSystem));
  const threshold = convertTemperature(options.thresholdC, unitSystem);
  const unit = unitSystem === UnitSystem.IP ? "°F" : "°C";
  const maxHours = Math.max(result.totalDurationMinutes / 60, 1 / 60);
  const yRange = paddedRange(
    [...tRe, ...tCr, threshold],
    unitSystem === UnitSystem.IP ? 1 : 0.5,
  );
  const traces: PlotScatterLineTrace[] = [
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
      name: options.thresholdLabel,
      x: [0, maxHours],
      y: [threshold, threshold],
      color: LIMIT_COLOR,
      unit,
      visible: true,
      hoverInfo: "skip",
      dash: "dash",
    }),
  ];
  const boundaryTrace = buildBoundaryTrace(
    options.segmentBoundariesMinutes ?? [],
    yRange,
  );
  if (boundaryTrace) traces.push(boundaryTrace);
  if (options.markerMinute !== null && options.markerMinute !== undefined) {
    traces.push(lineTrace({
      name: options.markerLabel ?? "First limiting criterion",
      x: [options.markerMinute / 60, options.markerMinute / 60],
      y: yRange,
      color: "#b45309",
      unit,
      visible: true,
      hoverInfo: "skip",
      dash: "dot",
      width: 2,
    }));
  }

  return {
    traces,
    layout: {
      title: options.title,
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
        range: yRange,
        gridcolor: "#e2e8f0",
        showgrid: true,
        zeroline: false,
      },
      legend: { orientation: "h", x: 0.5, y: -0.22 },
      height: 390,
    },
    annotations: [],
    source: result.source,
  };
}

function getSegmentPresentation(
  result: PhsSimulationResult,
  draft: PhsTimeSeriesDraft,
) {
  const segmentNamesById = Object.fromEntries(
    draft.segments.map(({ id, name }) => [id, name]),
  );
  const samples = requireHistory(result);
  const segmentBoundariesMinutes: number[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index - 1].segmentId !== samples[index].segmentId) {
      segmentBoundariesMinutes.push(samples[index - 1].minute);
    }
  }
  return { segmentNamesById, segmentBoundariesMinutes };
}

export function buildPhsTemperatureTimeSeriesChart(
  result: PhsSimulationResult,
  draft: PhsTimeSeriesDraft,
  unitSystem: UnitSystemType,
): PlotlyChartSpec {
  const presentation = getSegmentPresentation(result, draft);
  return buildPhsTemperatureHistoryChart(result, unitSystem, {
    title: "PHS temperature over time",
    thresholdC: PHS_RECTAL_TEMPERATURE_LIMIT_C,
    thresholdLabel: "Maximum rectal temperature",
    ...presentation,
  });
}

export function buildPhsWaterLossTimeSeriesChart(
  result: PhsSimulationResult,
  draft: PhsTimeSeriesDraft,
  unitSystem: UnitSystemType,
): PlotlyChartSpec {
  const { segmentBoundariesMinutes, segmentNamesById } = getSegmentPresentation(
    result,
    draft,
  );
  const samples = downsamplePhsHistorySamples(requireHistory(result), {
    temperatureThresholdsC: [PHS_RECTAL_TEMPERATURE_LIMIT_C],
    waterLossThresholdsG: [result.waterLossLimitG],
  });
  const x = samples.map(({ hours }) => hours);
  const segmentNames = samples.map(({ segmentId, segmentName }) => (
    segmentNamesById[segmentId] ?? segmentName
  ));
  const waterLoss = samples.map(({ sweatLossG }) => (
    convertModelOutputFromSi(ModelOutputKey.PhsWaterLoss, sweatLossG, unitSystem)
  ));
  const limit = convertModelOutputFromSi(
    ModelOutputKey.PhsWaterLoss,
    result.waterLossLimitG,
    unitSystem,
  );
  const unit = unitSystem === UnitSystem.IP ? "lb" : "kg";
  const maxHours = Math.max(result.totalDurationMinutes / 60, 1 / 60);
  const yRange: [number, number] = [0, Math.max(limit, ...waterLoss) * 1.08];
  const traces: PlotScatterLineTrace[] = [
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
      name: `${result.waterLossLimitPercent}% body-mass limit`,
      x: [0, maxHours],
      y: [limit, limit],
      color: LIMIT_COLOR,
      unit,
      visible: true,
      hoverInfo: "skip",
      dash: "dash",
    }),
  ];
  const boundaryTrace = buildBoundaryTrace(segmentBoundariesMinutes, yRange);
  if (boundaryTrace) traces.push(boundaryTrace);

  return {
    traces,
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
        range: yRange,
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
