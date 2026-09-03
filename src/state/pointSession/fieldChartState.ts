import type { ChartEngineRegistration } from "../../engines/comfort/charts/kinds/types";
import { PhysicalQuantityId } from "../../catalog/quantities";
import { InputId } from "../../catalog/inputSlots";
import { type Band, type ModelOutput, type NumericBand } from "../../catalog/modelCapabilities";
import {
  FieldChartProfileKind,
  type FieldChartProfile,
} from "../../catalog/fieldChartProfile";
import {
  SurfaceId,
  type SurfaceId as SurfaceIdType,
} from "../../catalog/surfaces";
import {
  cloneNumericBands,
  normalizeNumericBands,
  validateNumericBands,
} from "../../engines/comfort/charts/bands";
import type { RuntimeComfortModelDefinition } from "../modelRegistry/definition";
import {
  modelSupportsExplore,
  modelSupportsStandard,
} from "../modelRegistry/definition";
import type { ModelOutputSettings } from "./types";

export function getDeclaredExploreOutput(
  config: Pick<RuntimeComfortModelDefinition, "exploreOutputs">,
  outputKey: PhysicalQuantityId,
): ModelOutput | undefined {
  return config.exploreOutputs.find(({ key }) => key === outputKey);
}

export function getChartExploreOutputs(
  config: Pick<RuntimeComfortModelDefinition, "exploreOutputs">,
  chartRegistration?: ChartEngineRegistration<unknown, unknown>,
): readonly ModelOutput[] {
  const supported = chartRegistration?.supportedExploreOutputs;
  return supported
    ? supported.map((outputKey) => getDeclaredExploreOutput(config, outputKey)!).filter(Boolean)
    : config.exploreOutputs;
}

function getDefaultExploreOutput(
  config: Pick<RuntimeComfortModelDefinition, "exploreOutputs">,
  chartRegistration?: ChartEngineRegistration<unknown, unknown>,
): ModelOutput | undefined {
  const outputKey = chartRegistration?.defaultExploreOutput;
  return outputKey
    ? getDeclaredExploreOutput(config, outputKey)
    : getChartExploreOutputs(config, chartRegistration)[0];
}

export function normalizeExploreStateForChart(
  config: RuntimeComfortModelDefinition,
  settings: ModelOutputSettings,
  chartRegistration?: ChartEngineRegistration<unknown, unknown>,
): ModelOutputSettings {
  if (!modelSupportsExplore(config)) {
    return { ...settings, exploreOutput: null, exploreBands: null };
  }

  const outputs = getChartExploreOutputs(config, chartRegistration);
  if (
    settings.exploreOutput
    && outputs.some(({ key }) => key === settings.exploreOutput)
  ) {
    return settings;
  }

  const output = getDefaultExploreOutput(config, chartRegistration);
  return output
    ? {
        ...settings,
        exploreOutput: output.key,
        exploreBands: cloneNumericBands(output.defaultBands),
      }
    : { ...settings, exploreOutput: null, exploreBands: null };
}

export function seedExploreOutputSettings(
  config: RuntimeComfortModelDefinition,
  chartRegistration?: ChartEngineRegistration<unknown, unknown>,
): Pick<ModelOutputSettings, "exploreOutput" | "exploreBands"> {
  if (!modelSupportsExplore(config)) {
    return { exploreOutput: null, exploreBands: null };
  }

  const output = getDefaultExploreOutput(config, chartRegistration);
  return output
    ? {
        exploreOutput: output.key,
        exploreBands: cloneNumericBands(output.defaultBands),
      }
    : { exploreOutput: null, exploreBands: null };
}

export function seedModelOutputSettings(
  config: RuntimeComfortModelDefinition,
): ModelOutputSettings {
  const registration = config.chartEngineRegistrations.find(
    ({ instanceId }) => instanceId === config.chartInstances.defaultInstanceId,
  );

  return {
    xAxis: config.defaultDynamicAxes.xAxis,
    yAxis: config.defaultDynamicAxes.yAxis,
    baselineInputId: InputId.Input1,
    ...seedExploreOutputSettings(config, registration),
  };
}

export function selectExploreOutput(
  config: RuntimeComfortModelDefinition,
  settings: ModelOutputSettings,
  outputKey: PhysicalQuantityId,
  chartRegistration?: ChartEngineRegistration<unknown, unknown>,
): ModelOutputSettings | null {
  const output = getDeclaredExploreOutput(config, outputKey);
  if (
    !output
    || !modelSupportsExplore(config)
    || !getChartExploreOutputs(config, chartRegistration).some(({ key }) => key === outputKey)
  ) {
    return null;
  }
  if (settings.exploreOutput === output.key) {
    return settings;
  }
  return {
    ...settings,
    exploreOutput: output.key,
    exploreBands: cloneNumericBands(output.defaultBands),
  };
}

export function replaceExploreBands(
  config: RuntimeComfortModelDefinition,
  settings: ModelOutputSettings,
  bands: readonly NumericBand[],
): ModelOutputSettings | null {
  if (!settings.exploreOutput || !getDeclaredExploreOutput(config, settings.exploreOutput)) {
    return null;
  }

  const normalizedBands = normalizeNumericBands(bands);
  if (!validateNumericBands(normalizedBands).valid) {
    return null;
  }

  return {
    ...settings,
    exploreBands: cloneNumericBands(normalizedBands),
  };
}

export function buildFieldChartProfile<TComplianceBand extends Band>(
  config: RuntimeComfortModelDefinition,
  settings: ModelOutputSettings,
  workspace: SurfaceIdType,
): FieldChartProfile<TComplianceBand> {
  if (workspace === SurfaceId.Standard || workspace === SurfaceId.Explore) {
    if (workspace === SurfaceId.Standard && modelSupportsStandard(config)) {
      const profile = config.complianceProfile;
      if (!profile) {
        throw new Error(
          "Comfort model declaration is missing its compliance profile for Standard workspace.",
        );
      }
      return {
        kind: FieldChartProfileKind.Compliance,
        xField: settings.xAxis,
        yField: settings.yAxis,
        zOutput: profile.output,
        bands: profile.bands as readonly TComplianceBand[],
      };
    }

    if (workspace === SurfaceId.Explore && modelSupportsExplore(config)) {
      if (
        !settings.exploreOutput
        || !settings.exploreBands
        || !getDeclaredExploreOutput(config, settings.exploreOutput)
      ) {
        throw new Error(
          "Comfort model declaration is missing its Explore output settings.",
        );
      }
      return {
        kind: FieldChartProfileKind.Explore,
        xField: settings.xAxis,
        yField: settings.yAxis,
        zOutput: settings.exploreOutput,
        bands: settings.exploreBands,
      };
    }
  }

  throw new Error(
    `Comfort model ${config.id} does not support workspace ${workspace}.`,
  );
}
