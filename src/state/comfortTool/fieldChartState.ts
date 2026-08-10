import type { FieldKey as FieldKeyType } from "../../models/fieldKeys";
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

export function seedExploreChartState(
  config: FieldChartModelCapabilities,
): ExploreChartState | null {
  if (!config.modes.includes(ChartMode.Explore)) {
    return null;
  }

  const output = config.chartableOutputs[0];
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
): ExploreChartState | null {
  const output = getDeclaredExploreOutput(config, outputKey);
  if (!output || !config.modes.includes(ChartMode.Explore)) {
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
  if (!explore || !getDeclaredExploreOutput(config, explore.zOutput)) {
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
