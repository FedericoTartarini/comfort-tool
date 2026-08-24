import type { ChartKindRegistration } from "../../services/comfort/charts/kinds/types";
import { InputId } from "../../models/inputSlots";
import {
  type Band,
  type ModelOutput,
  type ModelOutputKey,
  type NumericBand,
} from "../../models/modelCapabilities";
import {
  FieldChartProfileKind,
  type FieldChartProfile,
} from "../../models/output/fieldChartProfile";
import {
  supportsExploreWorkspace,
  supportsStandardWorkspace,
} from "../../models/output/workspaceCapabilities";
import { WorkspaceId, type WorkspaceId as WorkspaceIdType } from "../../models/workspaces";
import {
  cloneNumericBands,
  normalizeNumericBands,
  validateNumericBands,
} from "../../services/comfort/charts/bands";
import type { RuntimeComfortModelDefinition } from "./modelConfigs/definition";
import type { ModelOutputSettings } from "./types";

export function getDeclaredExploreOutput(
  config: Pick<RuntimeComfortModelDefinition, "exploreOutputs">,
  outputKey: ModelOutputKey,
): ModelOutput | undefined {
  return config.exploreOutputs.find(({ key }) => key === outputKey);
}

export function getChartExploreOutputs(
  config: Pick<RuntimeComfortModelDefinition, "exploreOutputs">,
  chartRegistration?: ChartKindRegistration<unknown, unknown>,
): readonly ModelOutput[] {
  const supported = chartRegistration?.supportedExploreOutputs;
  return supported
    ? supported.map((outputKey) => getDeclaredExploreOutput(config, outputKey)!).filter(Boolean)
    : config.exploreOutputs;
}

function getDefaultExploreOutput(
  config: Pick<RuntimeComfortModelDefinition, "exploreOutputs">,
  chartRegistration?: ChartKindRegistration<unknown, unknown>,
): ModelOutput | undefined {
  const outputKey = chartRegistration?.defaultExploreOutput;
  return outputKey
    ? getDeclaredExploreOutput(config, outputKey)
    : getChartExploreOutputs(config, chartRegistration)[0];
}

export function normalizeExploreStateForChart(
  config: RuntimeComfortModelDefinition,
  settings: ModelOutputSettings,
  chartRegistration?: ChartKindRegistration<unknown, unknown>,
): ModelOutputSettings {
  if (!supportsExploreWorkspace(config.workspaceCapabilities)) {
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
  chartRegistration?: ChartKindRegistration<unknown, unknown>,
): Pick<ModelOutputSettings, "exploreOutput" | "exploreBands"> {
  if (!supportsExploreWorkspace(config.workspaceCapabilities)) {
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
  const registration = config.chartKindRegistrations.find(
    ({ instanceId }) => instanceId === config.outputCharts.defaultInstanceId,
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
  outputKey: ModelOutputKey,
  chartRegistration?: ChartKindRegistration<unknown, unknown>,
): ModelOutputSettings | null {
  const output = getDeclaredExploreOutput(config, outputKey);
  if (
    !output
    || !supportsExploreWorkspace(config.workspaceCapabilities)
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
  workspace: WorkspaceIdType,
): FieldChartProfile<TComplianceBand> {
  if (workspace === WorkspaceId.Standard || workspace === WorkspaceId.Explore) {
    if (workspace === WorkspaceId.Standard && supportsStandardWorkspace(config.workspaceCapabilities)) {
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

    if (workspace === WorkspaceId.Explore && supportsExploreWorkspace(config.workspaceCapabilities)) {
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
