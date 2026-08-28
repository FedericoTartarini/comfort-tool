import type { ModelId as ModelIdType } from "../../catalog/modelIds";
import type { InputId as InputIdType } from "../../catalog/inputSlots";
import type { NumericBand } from "../../catalog/modelCapabilities";
import { ChartLegendKind } from "../../engines/comfort/charts/chartBuildResult";
import { buildChartControlsViewModel } from "./chartPresentation";
import type { AnalysisInternals } from "./analysisInternals";
import {
  buildInputControlViewModels,
  buildInputPanelViewModel,
  type InputPanelActionCallbacks,
} from "./inputPresentation";
import type {
  AnalysisSelectors,
  AnalysisStateSlice,
} from "./types";
import type {
  ChartAxisQuantityId,
  PhysicalQuantityId as PhysicalQuantityIdType,
} from "../../catalog/quantities";

export interface ChartControlCallbacks {
  onSelectBaseline: (inputId: InputIdType) => void;
  onSelectXAxis: (fieldKey: ChartAxisQuantityId) => void;
  onSelectYAxis: (fieldKey: ChartAxisQuantityId) => void;
  onSelectOutput: (outputKey: PhysicalQuantityIdType) => void;
  onApplyBands: (bands: readonly NumericBand[]) => boolean;
}

export function createAnalysisSelectors(
  state: AnalysisStateSlice,
  internals: AnalysisInternals,
  chartControlCallbacks: ChartControlCallbacks,
  inputPanelActionCallbacks: InputPanelActionCallbacks,
): AnalysisSelectors {
  function getCurrentChartBuildResult() {
    const cache = internals.getCurrentModelCache();
    const config = internals.getActiveModelConfig();
    const chartSourceVersion = cache.buildGeneration;
    return config.buildChart(
      internals.getCurrentSelectedChartInstanceId(),
      cache.chartSource,
      cache.resultsByInput,
      internals.getCurrentFieldChartProfile(),
      {
        unitSystem: state.setting.unitSystem,
        baselineInputId: internals.getEffectiveChartBaselineInputId(),
        chartSourceVersion,
        modelInputs: state.input.modelInputsByModel[state.setting.selectedModel],
      },
    );
  }

  function getChartControlsViewModel() {
    return buildChartControlsViewModel({
      config: internals.getActiveModelConfig(),
      settings: internals.getCurrentOutputSettings(),
      workspace: state.setting.activeSurface,
      chartInstance: internals.getCurrentChartInstance(),
      cache: internals.getCurrentModelCache(),
      visibleInputIds: internals.getVisibleInputIds(),
      compareEnabled: state.setting.compareEnabled,
      unitSystem: state.setting.unitSystem,
      callbacks: chartControlCallbacks,
    });
  }

  return {
    getVisibleInputIds: internals.getVisibleInputIds,
    getInputControls: () => buildInputControlViewModels(
      internals.getActiveModelConfig(),
      internals.getModelContext(state.setting.selectedModel),
    ),
    getInputPanelViewModel: (
      allowedModelIds: readonly ModelIdType[],
      onSelectModel: (modelId: ModelIdType) => void,
    ) => {
      const config = internals.getActiveModelConfig();
      return buildInputPanelViewModel({
        selectedModel: state.setting.selectedModel,
        compareEnabled: state.setting.compareEnabled,
        unitSystem: state.setting.unitSystem,
        activeInputId: state.setting.activeInputId,
        visibleInputIds: internals.getVisibleInputIds(),
        allowedModelIds,
        config,
        context: internals.getModelContext(state.setting.selectedModel),
        committedModifierControls: internals.getInputModifierControls(),
        callbacks: inputPanelActionCallbacks,
        onSelectModel,
      });
    },
    getInputModifierDraft: internals.getInputModifierDraft,
    getInputModifierControls: internals.getInputModifierControls,
    getEffectiveQuantitiesByInput: internals.getEffectiveQuantitiesByInput,
    getResultSections: () => {
      const cache = internals.getCurrentModelCache();
      if (cache.status === "empty") {
        return [];
      }

      return internals.getActiveModelConfig().buildTable(
        cache.resultsByInput,
        internals.getVisibleInputIds(),
        state.setting.unitSystem,
      );
    },
    getCurrentChartResult: () => getCurrentChartBuildResult().payload,
    getCurrentChartInstance: internals.getCurrentChartInstance,
    getCurrentChartInstances: () => internals.getActiveModelConfig().chartInstances.entries,
    getCurrentChartInstanceId: () => internals.getCurrentSelectedChartInstanceId(),
    getCurrentCacheStatus: () => internals.getCurrentModelCache().status,
    getCurrentChartLegendZones: () => {
      const buildResult = getCurrentChartBuildResult();
      if (buildResult.legend?.kind === ChartLegendKind.Bands) {
        return buildResult.legend.items;
      }
      return null;
    },
    getCurrentChartLegendTitle: () => (
      getCurrentChartBuildResult().legend?.title ?? ""
    ),
    getChartControlsViewModel,
    getPendingModelSwitch: internals.getPendingModelSwitch,
  };
}
