import type { FieldKey as FieldKeyType } from "../../models/fieldKeys";
import {
  ChartMode,
  type ChartMode as ChartModeType,
  type ExploreFieldChartConfig,
  type ModelOutput,
  type ModelOutputKey,
  type NumericBand,
} from "../../models/modelCapabilities";
import {
  cloneNumericBands,
  normalizeNumericBands,
  validateNumericBands,
} from "../../services/comfort/charts/bands";
import { isDynamicAxisPairValid } from "./dynamicAxes";
import type { ExploreChartState } from "./types";

interface ExploreModelCapabilities {
  modes: readonly ChartModeType[];
  chartableOutputs: readonly ModelOutput[];
  dynamicAxisFields: readonly FieldKeyType[];
  defaultDynamicAxes: {
    readonly xAxis: FieldKeyType;
    readonly yAxis: FieldKeyType;
  };
}

export function getDeclaredExploreOutput(
  config: ExploreModelCapabilities,
  outputKey: ModelOutputKey,
): ModelOutput | undefined {
  return config.chartableOutputs.find(({ key }) => key === outputKey);
}

export function seedExploreChartState(
  config: ExploreModelCapabilities,
): ExploreChartState | null {
  if (!config.modes.includes(ChartMode.Explore)) {
    return null;
  }

  const output = config.chartableOutputs[0];
  if (!output) {
    return null;
  }

  return {
    zOutput: output.key,
    bands: cloneNumericBands(output.defaultBands),
  };
}

export function selectExploreOutput(
  config: ExploreModelCapabilities,
  state: ExploreChartState | null,
  outputKey: ModelOutputKey,
): ExploreChartState | null {
  const output = getDeclaredExploreOutput(config, outputKey);
  if (!output || !config.modes.includes(ChartMode.Explore)) {
    return null;
  }

  if (state?.zOutput === output.key) {
    return state;
  }

  return {
    zOutput: output.key,
    bands: cloneNumericBands(output.defaultBands),
  };
}

export function replaceExploreBands(
  config: ExploreModelCapabilities,
  state: ExploreChartState | null,
  bands: readonly NumericBand[],
): ExploreChartState | null {
  if (!state || !getDeclaredExploreOutput(config, state.zOutput)) {
    return null;
  }

  const normalizedBands = normalizeNumericBands(bands);
  if (!validateNumericBands(normalizedBands).valid) {
    return null;
  }

  return {
    zOutput: state.zOutput,
    bands: cloneNumericBands(normalizedBands),
  };
}

export function buildExploreFieldChartConfig(
  config: ExploreModelCapabilities,
  state: ExploreChartState | null,
  xField: FieldKeyType,
  yField: FieldKeyType,
): ExploreFieldChartConfig | null {
  if (
    !state ||
    !config.modes.includes(ChartMode.Explore) ||
    !getDeclaredExploreOutput(config, state.zOutput) ||
    !isDynamicAxisPairValid(config, { xAxis: xField, yAxis: yField })
  ) {
    return null;
  }

  return {
    mode: ChartMode.Explore,
    xField,
    yField,
    zOutput: state.zOutput,
    bands: state.bands,
  };
}
