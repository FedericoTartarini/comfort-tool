import { syncDerivedStateIntoAuxiliary } from "../../engines/comfort/syncState";
import type { ModelId as ModelIdType } from "../../catalog/modelIds";
import {
  createPointInputState,
  createPointOutputState,
  createPointSettingState,
  createCalculationCacheByModel,
} from "./initialPointSessionState";
import { createCalculationManager } from "./calculationManager.svelte";
import { createPointActions } from "./actions";
import { createPointInternals, type PointInternals } from "./pointInternals";
import {
  buildChartBuildResult,
  buildChartControlsProjection,
  buildInputControlsProjection,
  buildInputPanelProjection,
  buildResultSectionsProjection,
  chartLegendTitleFromBuild,
  chartLegendZonesFromBuild,
} from "./projections";
import type { InputPanelActionCallbacks } from "./inputPresentation";
import type {
  PointActions,
  InputModifierDraftEntry,
  PointSession as PointSessionContract,
  QuantitiesByInputState,
} from "./sessionTypes";
import type { ChartBuildResult } from "../../engines/comfort/charts/chartBuildResult";
import type { ChartControlsViewModel, InputPanelViewModel } from "./viewModels";

/**
 * Point session for Standard and Explore. Time-series stays a separate session.
 *
 * Three buckets: `input`, `setting`, `output`. Calculation cache belongs to the
 * output bucket but is stored as `$state.raw` so Plotly-sized objects are not
 * deeply proxied. View-model fields are `$derived` projections, not a second store.
 */
export class PointSession implements PointSessionContract {
  input = $state(createPointInputState());
  setting = $state(createPointSettingState());
  output = $state(createPointOutputState());
  calculationCacheByModel = $state.raw(createCalculationCacheByModel());

  readonly actions: PointActions;
  #internals: PointInternals;
  #inputPanelCallbacks: InputPanelActionCallbacks;

  #readProjectionSources() {
    const selectedModel = this.setting.selectedModel;
    const settings = this.setting.outputSettingsByModel[selectedModel];
    return {
      selectedModel,
      instanceId: this.setting.selectedChartInstanceByModel[selectedModel],
      activeSurface: this.setting.activeSurface,
      unitSystem: this.setting.unitSystem,
      compareEnabled: this.setting.compareEnabled,
      compareInputIds: this.setting.compareInputIds,
      xAxis: settings.xAxis,
      yAxis: settings.yAxis,
      baselineInputId: settings.baselineInputId,
      exploreOutput: settings.exploreOutput,
      exploreBands: settings.exploreBands,
      cache: this.calculationCacheByModel[selectedModel],
      quantities: this.input.quantitiesByInput,
      modifiers: this.input.activeModifiersByInput,
    };
  }

  visibleInputIds = $derived.by(() => {
    this.#readProjectionSources();
    return this.#internals.getVisibleInputIds();
  });
  inputControls = $derived.by(() => {
    this.#readProjectionSources();
    return buildInputControlsProjection(this, this.#internals);
  });
  resultSections = $derived.by(() => {
    this.#readProjectionSources();
    return buildResultSectionsProjection(this, this.#internals);
  });
  chartBuild: ChartBuildResult = $derived.by(() => {
    this.#readProjectionSources();
    return buildChartBuildResult(this, this.#internals);
  });
  chartInstance = $derived.by(() => {
    this.#readProjectionSources();
    return this.#internals.getCurrentChartInstance();
  });
  chartInstances = $derived.by(() => {
    this.#readProjectionSources();
    return this.#internals.getActiveModelConfig().chartInstances.entries;
  });
  chartInstanceId = $derived.by(() => {
    this.#readProjectionSources();
    return this.#internals.getCurrentSelectedChartInstanceId();
  });
  cacheStatus = $derived.by(() => {
    this.#readProjectionSources();
    return this.#internals.getCurrentModelCache().status;
  });
  chartLegendZones = $derived.by(() =>
    chartLegendZonesFromBuild(this.chartBuild),
  );
  chartLegendTitle = $derived.by(() =>
    chartLegendTitleFromBuild(this.chartBuild),
  );
  chartControls: ChartControlsViewModel = $derived.by(() => {
    this.#readProjectionSources();
    return buildChartControlsProjection(this, this.#internals, {
      onSelectBaseline: this.actions.setChartBaselineInputId,
      onSelectXAxis: this.actions.setDynamicXAxis,
      onSelectYAxis: this.actions.setDynamicYAxis,
      onSelectOutput: this.actions.setExploreOutput,
      onApplyBands: this.actions.setExploreBands,
    });
  });
  pendingModelSwitch = $derived.by(() => this.setting.pendingModelSwitch);
  isLoading = $derived.by(() => this.output.isLoading);
  #selectModelHandler = $state<(modelId: ModelIdType) => void>(() => {});
  inputPanel: InputPanelViewModel = $derived.by(() => {
    this.#readProjectionSources();
    const allowedModelIds = this.setting.allowedModelIds;
    const onSelectModel = this.#selectModelHandler;
    return buildInputPanelProjection(
      this,
      this.#internals,
      onSelectModel,
      this.#inputPanelCallbacks,
      allowedModelIds,
    );
  });

  constructor() {
    syncDerivedStateIntoAuxiliary(
      this.input.quantitiesByInput,
      this.input.auxiliaryQuantitiesByInput,
    );

    this.#internals = createPointInternals(this);
    const { scheduleCalculation: scheduleCalculationInternal } =
      createCalculationManager(
        this,
        () => this.#internals.getVisibleInputIds(),
        (modelId) => this.#internals.getEffectiveQuantitiesByInput(modelId),
      );

    this.actions = createPointActions(
      this,
      this.#internals,
      scheduleCalculationInternal,
    );
    this.#inputPanelCallbacks = {
      onSetCompareEnabled: this.actions.setCompareEnabled,
      onToggleUnitSystem: this.actions.toggleUnitSystem,
      onToggleCompareInputVisibility:
        this.actions.toggleCompareInputVisibility,
      onActivateInput: this.actions.setActiveInputId,
      onUpdateInput: this.actions.updateInput,
      onSetModelOption: this.actions.setModelOption,
      getInputModifierDraft: () => this.#internals.getInputModifierDraft(),
      projectInputModifierDraft: (draft) =>
        this.#internals.getInputModifierControls(draft),
      onApplyInputModifierDraft: this.actions.applyInputModifierDraft,
    };
  }

  get inputModifierDraft(): InputModifierDraftEntry[] {
    return this.#internals.getInputModifierDraft();
  }

  bindSelectModel(handler: (modelId: ModelIdType) => void) {
    this.#selectModelHandler = handler;
  }

  inputModifierControls(draft?: readonly InputModifierDraftEntry[]) {
    return this.#internals.getInputModifierControls(draft);
  }

  effectiveQuantities(modelId?: ModelIdType): QuantitiesByInputState {
    return this.#internals.getEffectiveQuantitiesByInput(modelId);
  }
}

export function createPointSession(): PointSession {
  return new PointSession();
}
