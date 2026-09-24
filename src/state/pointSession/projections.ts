import type { ModelId as ModelIdType } from "../../catalog/modelIds";
import { ChartLegendKind } from "../../engines/comfort/charts/chartBuildResult";
import type { ChartBuildResult } from "../../engines/comfort/charts/chartBuildResult";
import { buildChartControlsViewModel } from "./chartPresentation";
import type { PointInternals } from "./pointInternals";
import {
  buildInputControlViewModels,
  buildInputPanelViewModel,
  type InputPanelActionCallbacks,
} from "./inputPresentation";
import type { PointSessionBuckets } from "./sessionTypes";
import type { ChartControlsViewModel, InputPanelViewModel } from "./viewModels";
import type { ChartControlCallbacks } from "./chartControlCallbacks";
import { extrasByInputFromChartSource } from "../../catalog/chartSource";

export type { ChartControlCallbacks } from "./chartControlCallbacks";

export function buildChartBuildResult(
  session: PointSessionBuckets,
  internals: PointInternals,
): ChartBuildResult {
  const cache = internals.getCurrentModelCache();
  const config = internals.getActiveModelConfig();
  const chartSourceVersion = cache.buildGeneration;
  return config.buildChart(
    internals.getCurrentSelectedChartInstanceId(),
    cache.chartSource,
    cache.valuesByInput,
    internals.getCurrentFieldChartProfile(),
    {
      unitSystem: session.input.unitSystem,
      baselineInputId: internals.getEffectiveChartBaselineInputId(),
      chartSourceVersion,
      modelInputs: session.input.quantitiesByInput[internals.getEffectiveChartBaselineInputId()],
    },
  );
}

export function buildChartControlsProjection(
  session: PointSessionBuckets,
  internals: PointInternals,
  callbacks: ChartControlCallbacks,
): ChartControlsViewModel {
  return buildChartControlsViewModel({
    config: internals.getActiveModelConfig(),
    settings: internals.getCurrentOutputSettings(),
    workspace: session.setting.activeSurface,
    chartInstance: internals.getCurrentChartInstance(),
    cache: internals.getCurrentModelCache(),
    visibleInputIds: internals.getVisibleInputIds(),
    compareEnabled: session.input.compareEnabled,
    unitSystem: session.input.unitSystem,
    callbacks,
  });
}

export function buildInputPanelProjection(
  session: PointSessionBuckets,
  internals: PointInternals,
  onSelectModel: (modelId: ModelIdType) => void,
  callbacks: InputPanelActionCallbacks,
  allowedModelIds: readonly ModelIdType[],
): InputPanelViewModel {
  const config = internals.getActiveModelConfig();
  return buildInputPanelViewModel({
    selectedModel: session.setting.selectedModel,
    compareEnabled: session.input.compareEnabled,
    unitSystem: session.input.unitSystem,
    activeInputId: session.input.activeInputId,
    visibleInputIds: internals.getVisibleInputIds(),
    allowedModelIds,
    config,
    context: internals.getModelContext(session.setting.selectedModel),
    committedModifierControls: internals.getInputModifierControls(),
    callbacks,
    onSelectModel,
  });
}

export function buildResultSectionsProjection(
  session: PointSessionBuckets,
  internals: PointInternals,
) {
  const cache = internals.getCurrentModelCache();
  if (cache.status === "empty") {
    return [];
  }

  return internals.getActiveModelConfig().buildTable(
    cache.valuesByInput,
    internals.getVisibleInputIds(),
    session.input.unitSystem,
    {
      quantitiesByInput: session.input.quantitiesByInput,
      extrasByInput: extrasByInputFromChartSource(cache.chartSource),
    },
  );
}

export function chartLegendZonesFromBuild(buildResult: ChartBuildResult) {
  if (buildResult.legend?.kind === ChartLegendKind.Bands) {
    return buildResult.legend.items;
  }
  return null;
}

export function chartLegendTitleFromBuild(buildResult: ChartBuildResult) {
  return buildResult.legend?.title ?? "";
}

export function buildInputControlsProjection(
  session: PointSessionBuckets,
  internals: PointInternals,
) {
  return buildInputControlViewModels(
    internals.getActiveModelConfig(),
    internals.getModelContext(session.setting.selectedModel),
  );
}
