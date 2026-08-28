import { type ChartAxisQuantityId, type PhysicalQuantityId as PhysicalQuantityIdType } from "../../catalog/quantities";
import { inputDisplayMetaById } from "../../catalog/inputSlotPresentation";
import { InputId, type InputId as InputIdType } from "../../catalog/inputSlots";
import { type NumericBand } from "../../catalog/modelCapabilities";
import {
  FieldChartProfileKind,
} from "../../catalog/output/fieldChartProfile";
import {
  SurfaceId,
  supportsExploreSurface,
  type SurfaceId as SurfaceIdType,
} from "../../catalog/surfaces";
import type { UnitSystem as UnitSystemType } from "../../catalog/units";
import { getDynamicAxisOptions } from "./dynamicAxes";
import {
  buildFieldChartProfile,
  getChartExploreOutputs,
  getDeclaredExploreOutput,
} from "./fieldChartState";
import {
  findChartEngineRegistration,
  resolveChartInstanceCapabilities,
} from "./chartInstancePresentation";
import type { RuntimeComfortModelDefinition } from "./modelConfigs/definition";
import type {
  ChartControlsViewModel,
  ModelCalculationCache,
  ModelOutputSettings,
} from "./types";
import type { ChartInstanceDeclaration } from "../../catalog/chartTypes";

export function getEffectiveChartBaselineInputId(
  settings: ModelOutputSettings,
  compareEnabled: boolean,
  visibleInputIds: readonly InputIdType[],
): InputIdType {
  return compareEnabled && visibleInputIds.includes(settings.baselineInputId)
    ? settings.baselineInputId
    : InputId.Input1;
}

function getExploreOutputs(
  config: RuntimeComfortModelDefinition,
  chartInstance: ChartInstanceDeclaration,
) {
  const registration = findChartEngineRegistration(
    config.chartEngineRegistrations,
    chartInstance.instanceId,
  );
  return supportsExploreSurface(config.workspaceCapabilities)
    ? getChartExploreOutputs(config, registration)
    : [];
}

function getExploreDefaultBands(
  config: RuntimeComfortModelDefinition,
  settings: ModelOutputSettings,
): readonly NumericBand[] {
  if (!settings.exploreOutput) {
    throw new Error(
      `Comfort model ${config.id} is missing its Explore output declaration.`,
    );
  }
  const output = getDeclaredExploreOutput(config, settings.exploreOutput);
  if (!output) {
    throw new Error(
      `Comfort model ${config.id} does not declare Explore output ${settings.exploreOutput}.`,
    );
  }
  return output.defaultBands;
}

interface ChartPresentationCallbacks {
  onSelectBaseline: (inputId: InputIdType) => void;
  onSelectXAxis: (field: ChartAxisQuantityId) => void;
  onSelectYAxis: (field: ChartAxisQuantityId) => void;
  onSelectOutput: (outputKey: PhysicalQuantityIdType) => void;
  onApplyBands: (bands: readonly NumericBand[]) => boolean;
}

interface BuildChartControlsOptions {
  config: RuntimeComfortModelDefinition;
  settings: ModelOutputSettings;
  workspace: SurfaceIdType;
  chartInstance: ChartInstanceDeclaration;
  cache: ModelCalculationCache<unknown, unknown>;
  visibleInputIds: InputIdType[];
  compareEnabled: boolean;
  unitSystem: UnitSystemType;
  callbacks: ChartPresentationCallbacks;
}

export function buildChartControlsViewModel({
  config,
  settings,
  workspace,
  chartInstance,
  cache,
  visibleInputIds,
  compareEnabled,
  unitSystem,
  callbacks,
}: BuildChartControlsOptions): ChartControlsViewModel {
  const profile = buildFieldChartProfile(config, settings, workspace);
  const capabilities = resolveChartInstanceCapabilities(chartInstance);
  const outputs = getExploreOutputs(config, chartInstance);
  const baselineInputId = getEffectiveChartBaselineInputId(
    settings,
    compareEnabled,
    visibleInputIds,
  );
  const complianceProfile = workspace === SurfaceId.Standard
    ? config.complianceProfile
    : undefined;
  if (workspace === SurfaceId.Standard && !complianceProfile) {
    throw new Error(
      `Comfort model ${config.id} declares Standard workspace without a compliance profile.`,
    );
  }
  const selectedOutput = workspace === SurfaceId.Explore
    ? getDeclaredExploreOutput(config, profile.zOutput)
    : undefined;
  if (workspace === SurfaceId.Explore && !selectedOutput) {
    throw new Error(
      `Comfort model ${config.id} does not declare Explore output ${profile.zOutput}.`,
    );
  }

  const caption = complianceProfile
    ? complianceProfile.caption
    : capabilities.allowsAxisSelection
      ? `Showing ${selectedOutput!.label} over the selected axes with editable thresholds.`
      : `Showing ${selectedOutput!.label} on this chart's fixed axes with editable thresholds.`;
  const baselineResult = cache.status === "ready"
    ? cache.resultsByInput[baselineInputId]
    : null;
  const feedback = complianceProfile && baselineResult !== null
    ? {
        ...complianceProfile.getFeedback(baselineResult),
        ...(compareEnabled
          ? { inputLabel: inputDisplayMetaById[baselineInputId].label }
          : {}),
      }
    : null;

  return {
    profileBadge: {
      profileKind: workspace === SurfaceId.Explore ? FieldChartProfileKind.Explore : FieldChartProfileKind.Compliance,
      caption,
      feedback,
    },
    baseline: compareEnabled && capabilities.allowsBaselineSelection
      ? {
          selectedInputId: baselineInputId,
          visibleInputIds,
          onSelect: callbacks.onSelectBaseline,
        }
      : null,
    axes: capabilities.allowsAxisSelection
      ? {
          x: {
            selectedField: settings.xAxis,
            options: getDynamicAxisOptions(config, settings, "x"),
            locked: false,
            onSelect: callbacks.onSelectXAxis,
          },
          y: {
            selectedField: settings.yAxis,
            options: getDynamicAxisOptions(config, settings, "y"),
            locked: capabilities.locksYAxis,
            onSelect: callbacks.onSelectYAxis,
          },
        }
      : null,
    explore: profile.kind === FieldChartProfileKind.Explore && outputs.length > 0
      ? {
          profile,
          outputs,
          defaultBands: getExploreDefaultBands(config, settings),
          unitSystem,
          onSelectOutput: callbacks.onSelectOutput,
          onApplyBands: callbacks.onApplyBands,
        }
      : null,
  };
}
