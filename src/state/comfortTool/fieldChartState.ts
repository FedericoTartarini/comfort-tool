import type { FieldKey as FieldKeyType } from "../../models/fieldKeys";
import type { ModelChartDefinition } from "../../models/chartOptions";
import { InputId } from "../../models/inputSlots";
import {
  ChartMode,
  type Band,
  type ChartMode as ChartModeType,
  type FieldChartConfig,
  type ModelOutput,
  type ModelOutputKey,
  type NumericBand,
} from "../../models/modelCapabilities";
import {
  cloneNumericBands,
  normalizeNumericBands,
  validateNumericBands,
} from "../../services/comfort/charts/bands";
import type { ExploreChartState, ModelChartSettings } from "./types";

interface FieldChartModelCapabilities<TComplianceBand extends Band = Band> {
  modes: readonly ChartModeType[];
  chartableOutputs: readonly ModelOutput[];
  complianceSpec?: {
    readonly output: ModelOutputKey;
    readonly bands: readonly TComplianceBand[];
  };
  dynamicAxisFields: readonly FieldKeyType[];
  defaultDynamicAxes: {
    readonly xAxis: FieldKeyType;
    readonly yAxis: FieldKeyType;
  };
  charts?: {
    readonly defaultId: string;
    readonly entries: readonly ModelChartDefinition[];
  };
}

export function getDefaultChartMode(config: FieldChartModelCapabilities): ChartModeType {
  if (config.modes.includes(ChartMode.Compliance)) {
    return ChartMode.Compliance;
  }
  if (config.modes.includes(ChartMode.Explore)) {
    return ChartMode.Explore;
  }
  throw new Error("Comfort model declarations require at least one chart mode.");
}

export function getDeclaredExploreOutput(
  config: FieldChartModelCapabilities,
  outputKey: ModelOutputKey,
): ModelOutput | undefined {
  return config.chartableOutputs.find(({ key }) => key === outputKey);
}

export function getChartExploreOutputs(
  config: FieldChartModelCapabilities,
  chartDefinition?: ModelChartDefinition,
): readonly ModelOutput[] {
  const supported = chartDefinition?.supportedExploreOutputs;
  return supported
    ? supported.map((outputKey) => getDeclaredExploreOutput(config, outputKey)!).filter(Boolean)
    : config.chartableOutputs;
}

function getDefaultExploreOutput(
  config: FieldChartModelCapabilities,
  chartDefinition?: ModelChartDefinition,
): ModelOutput | undefined {
  const outputKey = chartDefinition?.defaultExploreOutput;
  return outputKey
    ? getDeclaredExploreOutput(config, outputKey)
    : getChartExploreOutputs(config, chartDefinition)[0];
}

export function normalizeExploreStateForChart(
  config: FieldChartModelCapabilities,
  state: ExploreChartState | null,
  chartDefinition?: ModelChartDefinition,
): ExploreChartState | null {
  if (!config.modes.includes(ChartMode.Explore)) return null;

  const outputs = getChartExploreOutputs(config, chartDefinition);
  if (state && outputs.some(({ key }) => key === state.zOutput)) {
    return state;
  }

  const output = getDefaultExploreOutput(config, chartDefinition);
  return output
    ? { zOutput: output.key, bands: cloneNumericBands(output.defaultBands) }
    : null;
}

export function seedExploreChartState(
  config: FieldChartModelCapabilities,
): ExploreChartState | null {
  if (!config.modes.includes(ChartMode.Explore)) {
    return null;
  }

  const defaultChart = config.charts?.entries.find(
    ({ id }) => id === config.charts?.defaultId,
  );
  const output = getDefaultExploreOutput(config, defaultChart);
  return output
    ? { zOutput: output.key, bands: cloneNumericBands(output.defaultBands) }
    : null;
}

export function seedModelChartSettings(
  config: FieldChartModelCapabilities,
): ModelChartSettings {
  return {
    mode: getDefaultChartMode(config),
    xAxis: config.defaultDynamicAxes.xAxis,
    yAxis: config.defaultDynamicAxes.yAxis,
    explore: seedExploreChartState(config),
    baselineInputId: InputId.Input1,
  };
}

export function selectChartMode(
  config: FieldChartModelCapabilities,
  settings: ModelChartSettings,
  mode: ChartModeType,
): ModelChartSettings | null {
  if (!config.modes.includes(mode)) {
    return null;
  }
  return settings.mode === mode ? settings : { ...settings, mode };
}

export function selectExploreOutput(
  config: FieldChartModelCapabilities,
  state: ExploreChartState | null,
  outputKey: ModelOutputKey,
  chartDefinition?: ModelChartDefinition,
): ExploreChartState | null {
  const output = getDeclaredExploreOutput(config, outputKey);
  if (
    !output
    || !config.modes.includes(ChartMode.Explore)
    || !getChartExploreOutputs(config, chartDefinition).some(({ key }) => key === outputKey)
  ) {
    return null;
  }
  if (state?.zOutput === output.key) {
    return state;
  }
  return { zOutput: output.key, bands: cloneNumericBands(output.defaultBands) };
}

export function replaceExploreBands(
  config: FieldChartModelCapabilities,
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

export function buildFieldChartConfig<TComplianceBand extends Band>(
  config: FieldChartModelCapabilities<TComplianceBand>,
  settings: ModelChartSettings,
  chartDefinition?: ModelChartDefinition,
): FieldChartConfig<TComplianceBand> {
  if (settings.mode === ChartMode.Compliance) {
    const spec = config.complianceSpec;
    if (!spec) {
      throw new Error(
        "Comfort model declaration selected Compliance mode without a compliance specification.",
      );
    }
    return {
      mode: ChartMode.Compliance,
      xField: settings.xAxis,
      yField: settings.yAxis,
      zOutput: spec.output,
      bands: spec.bands,
    };
  }

  const explore = settings.explore;
  if (
    !explore
    || !getChartExploreOutputs(config, chartDefinition).some(
      ({ key }) => key === explore.zOutput,
    )
  ) {
    throw new Error(
      "Comfort model declaration selected Explore mode without its declared output.",
    );
  }
  return {
    mode: ChartMode.Explore,
    xField: settings.xAxis,
    yField: settings.yAxis,
    zOutput: explore.zOutput,
    bands: explore.bands,
  };
}
