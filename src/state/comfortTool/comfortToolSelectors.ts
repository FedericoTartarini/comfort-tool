import type { ChartAxisQuantityId } from "../../models/physicalQuantities";
import type {
  ModelOutputKey,
  NumericBand,
} from "../../models/modelCapabilities";
import { ChartLegendKind } from "../../models/output/chartBuildResult";
import type { InputId as InputIdType } from "../../models/inputSlots";
import type { ComfortModel as ComfortModelType } from "../../models/comfortModels";
import { buildChartControlsViewModel } from "./chartPresentation";
import type { ComfortToolInternals } from "./comfortToolInternals";
import {
  buildInputControlViewModels,
  buildInputPanelViewModel,
  type InputPanelActionCallbacks,
} from "./inputPresentation";
import type {
  ComfortToolSelectors,
  ComfortToolStateSlice,
} from "./types";

export interface ChartControlCallbacks {
  onSelectBaseline: (inputId: InputIdType) => void;
  onSelectXAxis: (fieldKey: ChartAxisQuantityId) => void;
  onSelectYAxis: (fieldKey: ChartAxisQuantityId) => void;
  onSelectOutput: (outputKey: ModelOutputKey) => void;
  onApplyBands: (bands: readonly NumericBand[]) => boolean;
}

export function createComfortToolSelectors(
  state: ComfortToolStateSlice,
  internals: ComfortToolInternals,
  chartControlCallbacks: ChartControlCallbacks,
  inputPanelActionCallbacks: InputPanelActionCallbacks,
): ComfortToolSelectors {
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
        unitSystem: state.ui.unitSystem,
        baselineInputId: internals.getEffectiveChartBaselineInputId(),
        chartSourceVersion,
        modelInputs: state.modelInputsByModel[state.ui.selectedModel],
      },
    );
  }

  function getChartControlsViewModel() {
    return buildChartControlsViewModel({
      config: internals.getActiveModelConfig(),
      settings: internals.getCurrentOutputSettings(),
      workspace: state.ui.activeWorkspace,
      chartInstance: internals.getCurrentChartInstance(),
      cache: internals.getCurrentModelCache(),
      visibleInputIds: internals.getVisibleInputIds(),
      compareEnabled: state.ui.compareEnabled,
      unitSystem: state.ui.unitSystem,
      callbacks: chartControlCallbacks,
    });
  }

  return {
    getVisibleInputIds: internals.getVisibleInputIds,
    getInputControls: () => buildInputControlViewModels(
      internals.getActiveModelConfig(),
      internals.getModelContext(state.ui.selectedModel),
    ),
    getInputPanelViewModel: (
      allowedModelIds: readonly ComfortModelType[],
      onSelectModel: (modelId: ComfortModelType) => void,
    ) => {
      const config = internals.getActiveModelConfig();
      return buildInputPanelViewModel({
        selectedModel: state.ui.selectedModel,
        compareEnabled: state.ui.compareEnabled,
        unitSystem: state.ui.unitSystem,
        activeInputId: state.ui.activeInputId,
        visibleInputIds: internals.getVisibleInputIds(),
        allowedModelIds,
        config,
        context: internals.getModelContext(state.ui.selectedModel),
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
        state.ui.unitSystem,
      );
    },
    getCurrentChartResult: () => getCurrentChartBuildResult().plotly,
    getCurrentChartInstance: internals.getCurrentChartInstance,
    getCurrentChartInstances: () => internals.getActiveModelConfig().outputCharts.entries,
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
