import {
  InputId,
  inputDefaultsById,
  inputOrder,
  type InputId as InputIdType,
} from "../../models/inputSlots";
import type {
  ChartId as ChartIdType,
  ModelChartDefinition,
} from "../../models/chartOptions";
import { ComfortModel, type ComfortModel as ComfortModelType } from "../../models/comfortModels";
import type {
  FieldKey as FieldKeyType,
} from "../../models/fieldKeys";
import { canonicalInputFieldOrder } from "../../models/fieldKeys";
import type { InputControlId as InputControlIdType } from "../../models/inputControls";
import type { OptionKey as OptionKeyType } from "../../models/inputModes";
import {
  type ModifierFieldKey as ModifierFieldKeyType,
  type ModifierId as ModifierIdType,
} from "../../models/inputModifiers";
import { UnitSystem } from "../../models/units";
import {
  type ChartMode as ChartModeType,
  type FieldChartConfig,
  type ModelOutputKey,
  type NumericBand,
} from "../../models/modelCapabilities";
import type { BehaviorPatch, ControlBehaviorContext } from "../../services/comfort/controls/types";
import { deriveInputsDerivedState } from "../../services/comfort/syncState";
import { comfortModelConfigs, comfortModelOrder, getComfortModelConfig } from "./modelConfigs";
import type { RuntimeComfortModelDefinition } from "./modelConfigs/definition";
import { createCalculationManager } from "./calculationManager.svelte";
import {
  normalizeDynamicAxisPair,
  resolveDynamicAxisSelection,
} from "./dynamicAxes";
import {
  buildFieldChartConfig,
  replaceExploreBands,
  seedModelChartSettings,
  selectChartMode,
  selectExploreOutput,
} from "./fieldChartState";
import {
  buildChartControlsViewModel,
  getChartLegendTitle,
  getChartLegendZones,
  getEffectiveChartBaselineInputId as resolveChartBaselineInputId,
} from "./chartPresentation";
import {
  buildInputModifierControls,
  canEnableModifier,
  createActiveModifiersByInput,
  createInputModifierDraft,
  createModifierInputsByInput,
  deriveEffectiveInputsByInput,
  findModelModifier,
  isInputModifierDraftValid,
  parseModifierInputTransition,
} from "./modifierState";
import {
  buildModelSwitchClampPatches,
  findModelSwitchViolations,
} from "./modelSwitch";
import {
  applyShareSnapshotToState,
  createShareStateSnapshot,
  normalizeCompareInputIds,
  type ShareStateSnapshot,
} from "./shareState";
import type {
  ChartSettingsByModelState,
  ComfortToolController,
  InputModifierDraftEntry,
  InputState,
  InputsByInputState,
  ModelCalculationCacheByModelState,
  ModelCalculationCache,
  ModelOptionsByModelState,
  SelectedChartByModelState,
  ComfortToolStateSlice,
  PendingModelSwitch,
} from "./types";

function createInputState(inputId: InputIdType): InputState {
  return { ...inputDefaultsById[inputId] };
}

function createInputsByInput(): InputsByInputState {
  return {
    [InputId.Input1]: createInputState(InputId.Input1),
    [InputId.Input2]: createInputState(InputId.Input2),
    [InputId.Input3]: createInputState(InputId.Input3),
  };
}

function createDefaultCompareInputIds(): InputIdType[] {
  return [InputId.Input1, InputId.Input2];
}

function createSelectedChartByModel(): SelectedChartByModelState {
  return comfortModelOrder.reduce((accumulator, modelId) => {
    accumulator[modelId] = comfortModelConfigs[modelId].charts.defaultId;
    return accumulator;
  }, {} as SelectedChartByModelState);
}

function createModelOptionsByModel(): ModelOptionsByModelState {
  return comfortModelOrder.reduce((accumulator, modelId) => {
    accumulator[modelId] = { ...comfortModelConfigs[modelId].defaultOptions };
    return accumulator;
  }, {} as ModelOptionsByModelState);
}

function createChartSettingsByModel(): ChartSettingsByModelState {
  return comfortModelOrder.reduce((accumulator, modelId) => {
    accumulator[modelId] = seedModelChartSettings(comfortModelConfigs[modelId]);
    return accumulator;
  }, {} as ChartSettingsByModelState);
}

function createEmptyInputResultRecord<T>(): Record<InputIdType, T | null> {
  return {
    [InputId.Input1]: null,
    [InputId.Input2]: null,
    [InputId.Input3]: null,
  };
}

function createEmptyCalculationCache<
  ResultType,
  ChartSourceType,
>(): ModelCalculationCache<ResultType, ChartSourceType> {
  return {
    status: "empty",
    lastVisibleInputIds: [InputId.Input1],
    resultsByInput: createEmptyInputResultRecord(),
    chartSource: null,
  };
}

function createCalculationCacheByModel(): ModelCalculationCacheByModelState {
  return comfortModelOrder.reduce((accumulator, modelId) => {
    accumulator[modelId] = createEmptyCalculationCache<unknown, unknown>();
    return accumulator;
  }, {} as ModelCalculationCacheByModelState);
}

export function createComfortToolState(): ComfortToolController {
  const inputsByInput = $state(createInputsByInput());
  const activeModifiersByInput = $state(createActiveModifiersByInput());
  const modifierInputsByInput = $state(createModifierInputsByInput());
  const derivedByInput = $derived.by(() => deriveInputsDerivedState(inputsByInput));
  const ui = $state({
    selectedModel: ComfortModel.PmvAshrae,
    selectedChartByModel: createSelectedChartByModel(),
    modelOptionsByModel: createModelOptionsByModel(),
    compareEnabled: false,
    compareInputIds: createDefaultCompareInputIds(),
    activeInputId: InputId.Input1,
    unitSystem: UnitSystem.SI,
    chartSettingsByModel: createChartSettingsByModel(),
    isLoading: false,
    errorMessage: "",
    calculationCacheByModel: createCalculationCacheByModel(),
    pendingModelSwitch: null,
  });

  const state: ComfortToolStateSlice = {
    inputsByInput,
    activeModifiersByInput,
    modifierInputsByInput,
    ui,
  };

  function invalidateModel(modelId: ComfortModelType, options?: { keepErrorMessage?: boolean }) {
    if (!options?.keepErrorMessage) {
      state.ui.errorMessage = "";
    }

    const cache = state.ui.calculationCacheByModel[modelId];
    const nextStatus = cache.chartSource ? "stale" : "empty";
    state.ui.calculationCacheByModel[modelId] = {
      ...cache,
      status: nextStatus,
    };
  }

  function invalidateAllModels(options?: { keepErrorMessage?: boolean }) {
    comfortModelOrder.forEach((modelId, index) => {
      invalidateModel(modelId, {
        keepErrorMessage: options?.keepErrorMessage || index !== 0,
      });
    });
  }

  function invalidateModelsSupportingModifiers(
    modifierIds: readonly ModifierIdType[],
  ) {
    const modifierIdSet = new Set(modifierIds);
    let keptErrorMessage = false;
    for (const modelId of comfortModelOrder) {
      if (!comfortModelConfigs[modelId].modifiers.some(({ id }) => modifierIdSet.has(id))) {
        continue;
      }
      invalidateModel(modelId, { keepErrorMessage: keptErrorMessage });
      keptErrorMessage = true;
    }
  }

  function getVisibleInputIds(): InputIdType[] {
    if (!state.ui.compareEnabled) {
      return [InputId.Input1];
    }

    return normalizeCompareInputIds(state.ui.compareInputIds);
  }

  function getModelContext(modelId: ComfortModelType): ControlBehaviorContext {
    const modelConfig = getComfortModelConfig(modelId);
    const options = modelConfig.parseOptions(state.ui.modelOptionsByModel[modelId]);
    if (!options) {
      throw new Error(`Invariant violation: invalid options state for ${modelId}.`);
    }
    return {
      inputsByInput: state.inputsByInput,
      derivedByInput,
      options,
      unitSystem: state.ui.unitSystem,
      visibleInputIds: getVisibleInputIds(),
    };
  }

  function getActiveModelConfig(): RuntimeComfortModelDefinition {
    return getComfortModelConfig(state.ui.selectedModel);
  }

  function getEffectiveInputsByInput(
    modelId: ComfortModelType = state.ui.selectedModel,
  ): InputsByInputState {
    return deriveEffectiveInputsByInput(
      state.inputsByInput,
      state.activeModifiersByInput,
      state.modifierInputsByInput,
      getComfortModelConfig(modelId).modifiers,
    );
  }

  function getInputModifierDraft() {
    return createInputModifierDraft(
      getActiveModelConfig(),
      state.activeModifiersByInput,
      state.modifierInputsByInput,
      getVisibleInputIds(),
    );
  }

  function getInputModifierControls(
    draft?: readonly InputModifierDraftEntry[],
  ) {
    return buildInputModifierControls({
      config: getActiveModelConfig(),
      inputsByInput: state.inputsByInput,
      activeModifiersByInput: state.activeModifiersByInput,
      modifierInputsByInput: state.modifierInputsByInput,
      visibleInputIds: getVisibleInputIds(),
      unitSystem: state.ui.unitSystem,
      draft,
    });
  }

  function getCurrentSelectedChartId() {
    return state.ui.selectedChartByModel[state.ui.selectedModel];
  }

  function getCurrentChartDefinition(): ModelChartDefinition {
    const selectedChartId = getCurrentSelectedChartId();
    const definition = getActiveModelConfig().charts.entries.find(
      ({ id }) => id === selectedChartId,
    );
    if (!definition) {
      throw new Error(
        `Invariant violation: model ${state.ui.selectedModel} does not declare chart ${selectedChartId}.`,
      );
    }
    return definition;
  }

  function getCurrentModelCache() {
    return state.ui.calculationCacheByModel[state.ui.selectedModel];
  }

  function getCurrentChartSettings() {
    return state.ui.chartSettingsByModel[state.ui.selectedModel];
  }

  function getEffectiveChartBaselineInputId(): InputIdType {
    return resolveChartBaselineInputId(
      getCurrentChartSettings(),
      state.ui.compareEnabled,
      getVisibleInputIds(),
    );
  }

  function applyBehaviorPatch(modelId: ComfortModelType, patch: BehaviorPatch) {
    if (patch.optionsPatch) {
      const options = getComfortModelConfig(modelId).parseOptions({
        ...state.ui.modelOptionsByModel[modelId],
        ...patch.optionsPatch,
      });
      if (!options) {
        throw new Error(`Invariant violation: invalid options patch for ${modelId}.`);
      }
      state.ui.modelOptionsByModel[modelId] = options;
    }

    if (patch.inputsPatch) {
      for (const inputId of inputOrder) {
        const inputPatch = patch.inputsPatch[inputId];
        if (!inputPatch) {
          continue;
        }

        for (const fieldKey of canonicalInputFieldOrder) {
          const value = inputPatch[fieldKey];
          if (value !== undefined) {
            state.inputsByInput[inputId][fieldKey] = value;
          }
        }
      }
    }
  }

  function getCurrentDynamicAxisPair() {
    const settings = getCurrentChartSettings();
    return {
      xAxis: settings.xAxis,
      yAxis: settings.yAxis,
    };
  }

  function getPendingModelSwitch(): PendingModelSwitch | null {
    return state.ui.pendingModelSwitch;
  }

  function getCurrentFieldChartConfig(): FieldChartConfig {
    return buildFieldChartConfig(
      getActiveModelConfig(),
      getCurrentChartSettings(),
    );
  }

  function getChartControlsViewModel() {
    return buildChartControlsViewModel({
      config: getActiveModelConfig(),
      settings: getCurrentChartSettings(),
      chartDefinition: getCurrentChartDefinition(),
      cache: getCurrentModelCache(),
      visibleInputIds: getVisibleInputIds(),
      compareEnabled: state.ui.compareEnabled,
      unitSystem: state.ui.unitSystem,
      callbacks: {
        onSelectBaseline: setChartBaselineInputId,
        onSelectXAxis: setDynamicXAxis,
        onSelectYAxis: setDynamicYAxis,
        onSelectOutput: setExploreOutput,
        onApplyBands: setExploreBands,
      },
    });
  }
  const selectors = {
    getVisibleInputIds,
    getInputControls: () => {
      const context = getModelContext(state.ui.selectedModel);
      return getActiveModelConfig().controls
        .map((control) => control.behavior.buildViewModel(context))
        .filter((control) => !control.hidden);
    },
    getInputModifierDraft,
    getInputModifierControls,
    getEffectiveInputsByInput,
    getResultSections: () => {
      const cache = getCurrentModelCache();
      if (cache.status === "empty") {
        return [];
      }

      return getActiveModelConfig().buildResultSections(
        cache.resultsByInput,
        getVisibleInputIds(),
        state.ui.unitSystem,
      );
    },
    getCurrentChartResult: () => {
      const cache = getCurrentModelCache();
      return getActiveModelConfig().buildChartResult(
        getCurrentSelectedChartId(),
        cache.chartSource,
        cache.resultsByInput,
        {
          unitSystem: state.ui.unitSystem,
          baselineInputId: getEffectiveChartBaselineInputId(),
          fieldChartConfig: getCurrentFieldChartConfig(),
        },
      );
    },
    getCurrentChartDefinition,
    getCurrentChartOptions: () => getActiveModelConfig().charts.entries,
    getCurrentSelectedChart: () => getCurrentSelectedChartId(),
    getCurrentCacheStatus: () => getCurrentModelCache().status,
    getCurrentChartLegendZones: () => getChartLegendZones(
      getActiveModelConfig(),
      getCurrentChartSettings(),
      getCurrentChartDefinition(),
    ),
    getCurrentChartLegendTitle: () => getChartLegendTitle(
      getActiveModelConfig(),
      getCurrentChartSettings(),
      getCurrentChartDefinition(),
    ),
    getChartControlsViewModel,
    getPendingModelSwitch,
  };

  const { scheduleCalculation: scheduleCalculationInternal } = createCalculationManager(
    state,
    getVisibleInputIds,
    getEffectiveInputsByInput,
  );

  function completeModelSelection(
    nextModel: ComfortModelType,
    options?: { schedule?: boolean },
  ) {
    state.ui.selectedModel = nextModel;
    state.ui.errorMessage = "";

    if (options?.schedule !== false) {
      scheduleCalculationInternal({ immediate: true });
    }
  }

  function ensureValidDynamicAxes(
    config: Pick<
      RuntimeComfortModelDefinition,
      "dynamicAxisFields" | "defaultDynamicAxes"
    >,
  ) {
    const pair = normalizeDynamicAxisPair(config, getCurrentDynamicAxisPair());
    const settings = getCurrentChartSettings();
    settings.xAxis = pair.xAxis;
    settings.yAxis = pair.yAxis;
  }

  function setSelectedModel(
    nextModel: ComfortModelType,
    options?: { validateRanges?: boolean; schedule?: boolean },
  ) {
    if (state.ui.selectedModel === nextModel) {
      return;
    }

    const nextModelConfig = getComfortModelConfig(nextModel);
    const nextModelOptions = nextModelConfig.parseOptions(
      state.ui.modelOptionsByModel[nextModel],
    );
    if (!nextModelOptions) {
      throw new Error(`Invariant violation: invalid options state for ${nextModel}.`);
    }
    const violations = options?.validateRanges === false
      ? []
      : findModelSwitchViolations(nextModelConfig, {
          inputsByInput: state.inputsByInput,
          derivedByInput,
          options: nextModelOptions,
          unitSystem: state.ui.unitSystem,
          visibleInputIds: getVisibleInputIds(),
        });

    if (violations.length > 0) {
      state.ui.pendingModelSwitch = {
        targetModel: nextModel,
        violations,
      };
      return;
    }

    completeModelSelection(nextModel, options);
  }

  function confirmModelSwitch(options?: { schedule?: boolean }) {
    if (!state.ui.pendingModelSwitch) {
      return;
    }

    const { targetModel, violations } = state.ui.pendingModelSwitch;

    const modelConfig = getComfortModelConfig(targetModel);
    const context = getModelContext(targetModel);
    for (const patch of buildModelSwitchClampPatches(
      modelConfig,
      context,
      violations,
    )) {
      applyBehaviorPatch(targetModel, patch);
    }

    state.ui.pendingModelSwitch = null;
    // The clamped values live in shared canonical input state, so every model
    // cache must be invalidated before the target model schedules its refresh.
    invalidateAllModels();
    completeModelSelection(targetModel, options);
  }

  function cancelModelSwitch() {
    state.ui.pendingModelSwitch = null;
  }

  function setSelectedChart(nextChart: ChartIdType) {
    const nextDefinition = getActiveModelConfig().charts.entries.find(
      ({ id }) => id === nextChart,
    );
    if (!nextDefinition) {
      return;
    }

    state.ui.selectedChartByModel[state.ui.selectedModel] = nextChart;

    if (nextDefinition.allowsAxisSelection) {
      ensureValidDynamicAxes(getActiveModelConfig());
    }
  }

  function setModelOption(optionKey: OptionKeyType, nextValue: string) {
    const modelConfig = getActiveModelConfig();
    const context = getModelContext(state.ui.selectedModel);
    const patch = modelConfig.optionHandlersByKey[optionKey]?.(context, nextValue) ?? null;

    if (!patch) {
      return;
    }

    applyBehaviorPatch(state.ui.selectedModel, patch);
    // Canonical inputs are shared across models, so patches that touch them
    // invalidate every model cache even when the option belongs to one model.
    if (patch.inputsPatch) {
      invalidateAllModels();
    } else {
      invalidateModel(state.ui.selectedModel);
    }
    scheduleCalculationInternal({ immediate: true });
  }

  function setCompareEnabled(enabled: boolean) {
    state.ui.compareEnabled = enabled;

    if (enabled) {
      state.ui.compareInputIds = normalizeCompareInputIds(state.ui.compareInputIds);
      if (state.ui.compareInputIds.length < 2) {
        state.ui.compareInputIds = createDefaultCompareInputIds();
      }
      if (!state.ui.compareInputIds.includes(state.ui.activeInputId)) {
        state.ui.activeInputId = state.ui.compareInputIds[0] ?? InputId.Input1;
      }
    } else {
      state.ui.activeInputId = InputId.Input1;
    }

    invalidateAllModels();
    scheduleCalculationInternal({ immediate: true });
  }

  function setActiveInputId(nextInputId: InputIdType) {
    state.ui.activeInputId = nextInputId;
  }

  function toggleCompareInputVisibility(inputId: InputIdType) {
    if (!state.ui.compareEnabled || inputId === InputId.Input1) {
      return;
    }

    if (state.ui.compareInputIds.includes(inputId)) {
      state.ui.compareInputIds = state.ui.compareInputIds.filter((visibleInputId) => visibleInputId !== inputId);
      if (state.ui.activeInputId === inputId) {
        state.ui.activeInputId = state.ui.compareInputIds[0] ?? InputId.Input1;
      }
    } else {
      state.ui.compareInputIds = normalizeCompareInputIds([...state.ui.compareInputIds, inputId]);
    }

    invalidateAllModels();
    scheduleCalculationInternal({ immediate: true });
  }

  function toggleUnitSystem() {
    state.ui.unitSystem = state.ui.unitSystem === UnitSystem.SI ? UnitSystem.IP : UnitSystem.SI;
  }

  function setChartMode(mode: ChartModeType) {
    const nextSettings = selectChartMode(
      getActiveModelConfig(),
      getCurrentChartSettings(),
      mode,
    );
    if (nextSettings) {
      state.ui.chartSettingsByModel[state.ui.selectedModel] = nextSettings;
    }
  }

  function setDynamicXAxis(fieldKey: FieldKeyType) {
    const pair = resolveDynamicAxisSelection(
      getActiveModelConfig(),
      getCurrentDynamicAxisPair(),
      "x",
      fieldKey,
    );
    if (!pair) {
      return;
    }

    const settings = getCurrentChartSettings();
    settings.xAxis = pair.xAxis;
    settings.yAxis = pair.yAxis;
  }

  function setDynamicYAxis(fieldKey: FieldKeyType) {
    const pair = resolveDynamicAxisSelection(
      getActiveModelConfig(),
      getCurrentDynamicAxisPair(),
      "y",
      fieldKey,
    );
    if (!pair) {
      return;
    }

    const settings = getCurrentChartSettings();
    settings.xAxis = pair.xAxis;
    settings.yAxis = pair.yAxis;
  }

  function setExploreOutput(outputKey: ModelOutputKey) {
    const nextState = selectExploreOutput(
      getActiveModelConfig(),
      getCurrentChartSettings().explore,
      outputKey,
    );
    if (nextState) {
      getCurrentChartSettings().explore = nextState;
    }
  }

  function setExploreBands(bands: readonly NumericBand[]): boolean {
    const nextState = replaceExploreBands(
      getActiveModelConfig(),
      getCurrentChartSettings().explore,
      bands,
    );
    if (!nextState) {
      return false;
    }

    getCurrentChartSettings().explore = nextState;
    return true;
  }

  function setChartBaselineInputId(inputId: InputIdType) {
    if (!inputOrder.includes(inputId)) {
      return;
    }
    getCurrentChartSettings().baselineInputId = inputId;
  }

  function updateInput(inputId: InputIdType, controlId: InputControlIdType, rawValue: string) {
    const control = getActiveModelConfig().controls.find((item) => item.id === controlId);
    if (!control?.behavior.applyInput) {
      return;
    }

    const patch = control.behavior.applyInput(getModelContext(state.ui.selectedModel), inputId, rawValue);
    if (!patch) {
      return;
    }

    applyBehaviorPatch(state.ui.selectedModel, patch);

    invalidateAllModels();
    scheduleCalculationInternal();
  }

  function refreshAfterModifierChange(
    modifierId: ModifierIdType,
    options?: { immediate?: boolean },
  ) {
    refreshAfterModifierChanges([modifierId], options);
  }

  function refreshAfterModifierChanges(
    modifierIds: readonly ModifierIdType[],
    options?: { immediate?: boolean },
  ) {
    if (modifierIds.length === 0) return;
    const modifierIdSet = new Set(modifierIds);
    invalidateModelsSupportingModifiers(modifierIds);
    if (getActiveModelConfig().modifiers.some(({ id }) => modifierIdSet.has(id))) {
      scheduleCalculationInternal({ immediate: options?.immediate });
    }
  }

  function updateModifierInput(
    inputId: InputIdType,
    modifierId: ModifierIdType,
    fieldKey: ModifierFieldKeyType,
    rawValue: string,
  ): boolean {
    const modifier = findModelModifier(getActiveModelConfig(), modifierId);
    if (!modifier) return false;

    const currentInputs = state.modifierInputsByInput[inputId][modifierId];
    const wasActive = state.activeModifiersByInput[inputId][modifierId];
    const transition = parseModifierInputTransition(
      modifier,
      fieldKey,
      rawValue,
      state.ui.unitSystem,
      wasActive,
    );
    if (!transition.accepted) return false;

    currentInputs[fieldKey] = transition.valueSi ?? null;
    if (transition.disableModifier) {
      state.activeModifiersByInput[inputId][modifierId] = false;
      refreshAfterModifierChange(modifierId, { immediate: true });
    } else if (wasActive) {
      refreshAfterModifierChange(modifierId);
    }
    return true;
  }

  function setModifierEnabled(
    inputId: InputIdType,
    modifierId: ModifierIdType,
    enabled: boolean,
  ): boolean {
    const modifier = findModelModifier(getActiveModelConfig(), modifierId);
    if (!modifier) return false;
    const currentEnabled = state.activeModifiersByInput[inputId][modifierId];
    if (currentEnabled === enabled) return true;
    if (
      enabled
      && !canEnableModifier(
        modifier,
        state.modifierInputsByInput[inputId][modifierId],
      )
    ) {
      return false;
    }

    state.activeModifiersByInput[inputId][modifierId] = enabled;
    refreshAfterModifierChange(modifierId, { immediate: true });
    return true;
  }

  function applyInputModifierDraft(
    draft: readonly InputModifierDraftEntry[],
  ): boolean {
    const config = getActiveModelConfig();
    const visibleInputIds = getVisibleInputIds();
    if (!isInputModifierDraftValid(config, visibleInputIds, draft)) {
      return false;
    }

    const modifiersWithEffectiveChanges = new Set<ModifierIdType>();
    for (const entry of draft) {
      const modifier = findModelModifier(config, entry.modifierId);
      if (!modifier) return false;

      const wasEnabled = state.activeModifiersByInput[entry.inputId][entry.modifierId];
      const inputsChanged = modifier.extraInputs.some((fieldKey) => (
        state.modifierInputsByInput[entry.inputId][entry.modifierId][fieldKey]
          !== entry.inputs[fieldKey]
      ));
      if (wasEnabled !== entry.enabled || (inputsChanged && (wasEnabled || entry.enabled))) {
        modifiersWithEffectiveChanges.add(entry.modifierId);
      }
    }

    for (const entry of draft) {
      state.activeModifiersByInput[entry.inputId][entry.modifierId] = entry.enabled;
      state.modifierInputsByInput[entry.inputId][entry.modifierId] = {
        ...entry.inputs,
      };
    }

    refreshAfterModifierChanges(
      [...modifiersWithEffectiveChanges],
      { immediate: true },
    );
    return true;
  }

  const actions = {
    setSelectedModel,
    setSelectedChart,
    setModelOption,
    setCompareEnabled,
    setActiveInputId,
    toggleCompareInputVisibility,
    toggleUnitSystem,
    setChartMode,
    setDynamicXAxis,
    setDynamicYAxis,
    setExploreOutput,
    setExploreBands,
    setChartBaselineInputId,
    exportShareSnapshot: () => createShareStateSnapshot(state),
    applyShareSnapshot: (
      snapshot: ShareStateSnapshot,
      options?: { schedule?: boolean },
    ) => {
      applyShareSnapshotToState(state, snapshot);
      invalidateAllModels();
      if (options?.schedule !== false) {
        scheduleCalculationInternal({ immediate: true, force: true });
      }
    },
    updateInput,
    updateModifierInput,
    setModifierEnabled,
    applyInputModifierDraft,
    scheduleCalculation: (scheduleOptions?: { immediate?: boolean; force?: boolean }) => scheduleCalculationInternal(scheduleOptions),
    confirmModelSwitch,
    cancelModelSwitch,
  };

  return {
    state,
    actions,
    selectors,
  };
}
