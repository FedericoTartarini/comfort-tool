/**
 * Creates and manages the entire state for the comfort-tool application.
 * 
 * Orchestrates the following main areas:
 * - Input Management: Handles inputs for environmental parameters and personal settings.
 * - Model Options: Manages configuration for various comfort models (PMV, UTCI, etc.).
 * - UI State: Controls the layout, visibility, and selection of components (charts, panels).
 * - Calculations: Interfaces with the CalculationManager for model evaluations.
 * - Charting: Manages chart configurations and generation settings.
 * - Comparisons: Supports comparing multiple input scenarios.
 * - Sharing & Persistence: Handles sharing state via snapshots and URLs.
 * 
 * @returns A ComfortToolController object exposing state and derived selectors.
 */
import {
  InputId,
  inputDefaultsById,
  inputOrder,
  type InputId as InputIdType,
} from "../../models/inputSlots";
import { chartMetaById, type ChartId as ChartIdType } from "../../models/chartOptions";
import { ComfortModel, type ComfortModel as ComfortModelType } from "../../models/comfortModels";
import type { FieldKey as FieldKeyType } from "../../models/fieldKeys";
import { allFieldOrder, fieldMetaByKey } from "../../models/inputFieldsMeta";
import { inputDisplayMetaById } from "../../models/inputSlotPresentation";
import type { InputControlId as InputControlIdType } from "../../models/inputControls";
import type { OptionKey as OptionKeyType } from "../../models/inputModes";
import { UnitSystem } from "../../models/units";
import {
  ChartMode,
  type Band,
  type ChartMode as ChartModeType,
  type FieldChartConfig,
  type ModelOutputKey,
  type NumericBand,
} from "../../models/modelCapabilities";
import type { BehaviorPatch, ControlBehaviorContext } from "../../services/comfort/controls/types";
import { deriveInputsDerivedState } from "../../services/comfort/syncState";
import { comfortModelConfigs, comfortModelOrder, getComfortModelConfig, type ComfortModelDefinition } from "./modelConfigs";
import { createCalculationManager } from "./calculationManager.svelte";
import {
  getDynamicAxisOptions,
  normalizeDynamicAxisPair,
  resolveDynamicAxisSelection,
} from "./dynamicAxes";
import {
  buildFieldChartConfig,
  getDeclaredExploreOutput,
  replaceExploreBands,
  seedModelChartSettings,
  selectChartMode,
  selectExploreOutput,
} from "./fieldChartState";
import {
  applyShareSnapshotToState,
  createShareStateSnapshot,
  normalizeCompareInputIds,
  type ShareStateSnapshot,
} from "./shareState";
import type {
  ChartControlsViewModel,
  ChartSettingsByModelState,
  ComfortToolController,
  InputState,
  ModelCalculationCacheByModelState,
  ModelCalculationCache,
  ModelOptionsByModelState,
  SelectedChartByModelState,
  ComfortToolStateSlice,
  ModelSwitchViolation,
  PendingModelSwitch,
} from "./types";

/**
 * Creates a default input state for a specific input ID.
 * @param inputId The ID of the input slot (e.g., Input1, Input2).
 * @returns A record of field keys mapping to their default numeric values.
 */
function createInputState(inputId: InputIdType): InputState {
  return allFieldOrder.reduce((accumulator, fieldKey) => {
    const defaults = inputDefaultsById[inputId] as Partial<Record<FieldKeyType, number>>;
    accumulator[fieldKey] = defaults[fieldKey] ?? fieldMetaByKey[fieldKey].defaultValue;
    return accumulator;
  }, {} as InputState);
}

/**
 * Initializes the initial inputs for all available input slots.
 * @returns A record mapping each InputId to its default state.
 */
function createInputsByInput() {
  return inputOrder.reduce((accumulator, inputId) => {
    accumulator[inputId] = createInputState(inputId);
    return accumulator;
  }, {} as ComfortToolStateSlice["inputsByInput"]);
}

/**
 * Returns the default set of visible input IDs used for comparisons.
 * @returns Array containing Input1 and Input2.
 */
function createDefaultCompareInputIds(): InputIdType[] {
  return [InputId.Input1, InputId.Input2];
}

function selectLegendBands(
  bands: readonly Band[],
): Array<Pick<Band, "label" | "color">> {
  const selected: Array<Pick<Band, "label" | "color">> = [];
  for (const { label, color } of bands) {
    if (!selected.some((band) => band.label === label && band.color === color)) {
      selected.push({ label, color });
    }
  }
  return selected;
}


/**
 * Initializes the default chart selection for each comfort model.
 * @returns A record mapping each model to its default chart ID.
 */
function createSelectedChartByModel(): SelectedChartByModelState {
  return comfortModelOrder.reduce((accumulator, modelId) => {
    accumulator[modelId] = comfortModelConfigs[modelId].defaultChartId;
    return accumulator;
  }, {} as SelectedChartByModelState);
}

/**
 * Initializes the default options (e.g., standards, limits) for each comfort model.
 * @returns A record mapping each model to its default options.
 */
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

/**
 * Creates an empty record of results for all available input slots.
 * @returns A record mapping each InputId to a null result.
 */
function createEmptyInputResultRecord<T>(): Record<InputIdType, T | null> {
  return inputOrder.reduce((accumulator, inputId) => {
    accumulator[inputId] = null;
    return accumulator;
  }, {} as Record<InputIdType, T | null>);
}

/**
 * Creates an empty calculation cache container for a comfort model.
 * @returns An initialized calculation cache object.
 */
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

/**
 * Initializes the calculation cache registry for all available comfort models by looping through comfort model order.
 * @returns A record mapping each model to an empty calculation cache.
 */
function createCalculationCacheByModel(): ModelCalculationCacheByModelState {
  return comfortModelOrder.reduce((accumulator, modelId) => {
    accumulator[modelId] = createEmptyCalculationCache<unknown, unknown>();
    return accumulator;
  }, {} as ModelCalculationCacheByModelState);
}

/**
 * Creates and initializes the root state for the comfort-tool by initializing all the state variables.
 * @returns A ComfortToolController containing the core state and action methods.
 */
export function createComfortToolState(): ComfortToolController {
  const inputsByInput = $state(createInputsByInput());
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
    ui,
  };

  /**
   * Invalidates the calculation cache for a specific model, marking it as stale or empty.
   * @param modelId The ID of the model to invalidate.
   * @param options Configuration for invalidation (e.g., whether to keep error messages).
   */
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

  /**
   * Invalidates the calculation cache for all comfort models.
   * @param options Configuration for invalidation.
   */
  function invalidateAllModels(options?: { keepErrorMessage?: boolean }) {
    comfortModelOrder.forEach((modelId, index) => {
      invalidateModel(modelId, {
        keepErrorMessage: options?.keepErrorMessage || index !== 0,
      });
    });
  }

  /**
   * Returns the IDs of the input slots that should currently be visible in the UI.
   * @returns Array of Input IDs.
   */
  function getVisibleInputIds(): InputIdType[] {
    if (!state.ui.compareEnabled) {
      return [InputId.Input1];
    }

    return normalizeCompareInputIds(state.ui.compareInputIds);
  }

  function getModelContext(modelId: ComfortModelType): ControlBehaviorContext {
    return {
      inputsByInput: state.inputsByInput,
      derivedByInput,
      options: state.ui.modelOptionsByModel[modelId],
      unitSystem: state.ui.unitSystem,
      visibleInputIds: getVisibleInputIds(),
      selectedChartId: state.ui.selectedChartByModel[modelId],
    };
  }

  function getActiveModelConfig(): ComfortModelDefinition<unknown, unknown, Band> {
    return getComfortModelConfig(state.ui.selectedModel) as unknown as ComfortModelDefinition<
      unknown,
      unknown,
      Band
    >;
  }

  function getCurrentSelectedChartId() {
    return state.ui.selectedChartByModel[state.ui.selectedModel];
  }

  function getCurrentModelCache() {
    return state.ui.calculationCacheByModel[state.ui.selectedModel];
  }

  function getCurrentChartSettings() {
    return state.ui.chartSettingsByModel[state.ui.selectedModel];
  }

  function getEffectiveChartBaselineInputId(): InputIdType {
    const remembered = getCurrentChartSettings().baselineInputId;
    return state.ui.compareEnabled && getVisibleInputIds().includes(remembered)
      ? remembered
      : InputId.Input1;
  }

  /**
   * Applies a state patch calculated by a control behavior to the canonical state.
   * @param modelId The model context for the patch.
   * @param patch The state changes to apply.
   */
  function applyBehaviorPatch(modelId: ComfortModelType, patch: BehaviorPatch) {
    if (patch.optionsPatch) {
      state.ui.modelOptionsByModel[modelId] = {
        ...state.ui.modelOptionsByModel[modelId],
        ...patch.optionsPatch,
      };
    }

    if (patch.inputsPatch) {
      Object.entries(patch.inputsPatch).forEach(([inputId, inputPatch]) => {
        if (!inputPatch) {
          return;
        }

        Object.entries(inputPatch).forEach(([fieldKey, value]) => {
          state.inputsByInput[inputId as InputIdType][fieldKey as FieldKeyType] = value;
        });
      });
    }
  }

  function getCurrentDynamicAxisPair() {
    const settings = getCurrentChartSettings();
    return {
      xAxis: settings.xAxis,
      yAxis: settings.yAxis,
    };
  }

  function getDynamicXAxisOptions(): FieldKeyType[] {
    return getDynamicAxisOptions(
      getActiveModelConfig(),
      getCurrentDynamicAxisPair(),
      "x",
    );
  }

  function getDynamicYAxisOptions(): FieldKeyType[] {
    return getDynamicAxisOptions(
      getActiveModelConfig(),
      getCurrentDynamicAxisPair(),
      "y",
    );
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

  function getCurrentChartableOutputs() {
    const config = getActiveModelConfig();
    return config.modes.includes(ChartMode.Explore) ? config.chartableOutputs : [];
  }

  function getCurrentExploreDefaultBands() {
    const exploreState = getCurrentChartSettings().explore;
    if (!exploreState) {
      throw new Error(
        `Comfort model ${state.ui.selectedModel} is missing its Explore state declaration.`,
      );
    }

    const output = getDeclaredExploreOutput(
      getActiveModelConfig(),
      exploreState.zOutput,
    );
    if (!output) {
      throw new Error(
        `Comfort model ${state.ui.selectedModel} does not declare Explore output ${exploreState.zOutput}.`,
      );
    }
    return output.defaultBands;
  }

  function getChartControlsViewModel(): ChartControlsViewModel {
    const modelConfig = getActiveModelConfig();
    const settings = getCurrentChartSettings();
    const selectedChart = getCurrentSelectedChartId();
    const supportsAxisSelection = chartMetaById[selectedChart].supportsAxisSelection;
    const fieldChartConfig = getCurrentFieldChartConfig();
    const chartableOutputs = getCurrentChartableOutputs();
    const effectiveBaselineInputId = getEffectiveChartBaselineInputId();
    const complianceSpec = settings.mode === ChartMode.Compliance
      ? modelConfig.complianceSpec
      : undefined;
    if (settings.mode === ChartMode.Compliance && !complianceSpec) {
      throw new Error(
        `Comfort model ${modelConfig.id} declares Compliance mode without a compliance specification.`,
      );
    }
    const selectedOutput = settings.mode === ChartMode.Explore
      ? getDeclaredExploreOutput(modelConfig, fieldChartConfig.zOutput)
      : undefined;
    if (settings.mode === ChartMode.Explore && !selectedOutput) {
      throw new Error(
        `Comfort model ${modelConfig.id} does not declare Explore output ${fieldChartConfig.zOutput}.`,
      );
    }
    const caption = complianceSpec
      ? complianceSpec.caption
      : supportsAxisSelection
        ? `Showing ${selectedOutput!.label} over the selected axes with editable thresholds.`
        : `Showing ${selectedOutput!.label} on this chart's fixed axes with editable thresholds.`;
    const baselineResult = getCurrentModelCache().status === "ready"
      ? getCurrentModelCache().resultsByInput[effectiveBaselineInputId]
      : null;
    const feedback = complianceSpec
      && baselineResult !== null
      ? {
          ...complianceSpec.getFeedback(baselineResult),
          ...(state.ui.compareEnabled
            ? { inputLabel: inputDisplayMetaById[effectiveBaselineInputId].label }
            : {}),
        }
      : null;
    const mode: ChartControlsViewModel["mode"] = {
      modes: modelConfig.modes,
      selectedMode: settings.mode,
      caption,
      feedback,
      onSelect: setChartMode,
    };

    return {
      mode,
      baseline: state.ui.compareEnabled
        ? {
            selectedInputId: effectiveBaselineInputId,
            visibleInputIds: getVisibleInputIds(),
            onSelect: setChartBaselineInputId,
          }
        : null,
      axes: supportsAxisSelection
        ? {
            x: {
              selectedField: settings.xAxis,
              options: getDynamicXAxisOptions(),
              locked: false,
              onSelect: setDynamicXAxis,
            },
            y: {
              selectedField: settings.yAxis,
              options: getDynamicYAxisOptions(),
              locked: getActiveModelConfig().lockYAxisChartIds.includes(selectedChart),
              onSelect: setDynamicYAxis,
            },
          }
        : null,
      explore: fieldChartConfig.mode === ChartMode.Explore
        && chartableOutputs.length > 0
        ? {
            config: fieldChartConfig,
            outputs: chartableOutputs,
            defaultBands: getCurrentExploreDefaultBands(),
            unitSystem: state.ui.unitSystem,
            onSelectOutput: setExploreOutput,
            onApplyBands: setExploreBands,
          }
        : null,
    };
  }

  const selectors = {
    getVisibleInputIds,
    getInputControls: () => {
      const context = getModelContext(state.ui.selectedModel);
      return getActiveModelConfig().controls
        .map((control) => control.behavior.buildViewModel(context))
        .filter((control) => !control.hidden);
    },
    getResultSections: () => {
      const cache = getCurrentModelCache();
      if (cache.status === "empty") {
        return [];
      }

      return getActiveModelConfig().buildResultSections(
        cache.resultsByInput,
        getVisibleInputIds(),
        state.ui.unitSystem,
        state.ui.modelOptionsByModel[state.ui.selectedModel],
        getCurrentSelectedChartId(),
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
    getCurrentChartEmptyMessage: () => chartMetaById[getCurrentSelectedChartId()].emptyMessage,
    getCurrentChartOptions: () => getActiveModelConfig().chartIds.map((chartId) => ({
      name: chartMetaById[chartId].name,
      value: chartId,
    })),
    getCurrentSelectedChart: () => getCurrentSelectedChartId(),
    getCurrentChartHeightClass: () => chartMetaById[getCurrentSelectedChartId()].heightClass,
    getCurrentCacheStatus: () => getCurrentModelCache().status,
    getCurrentChartLegendZones: () => {
      const config = getActiveModelConfig();
      return config.legendChartIds.includes(getCurrentSelectedChartId())
        ? selectLegendBands(getCurrentFieldChartConfig().bands)
        : null;
    },
    getCurrentChartLegendTitle: () => {
      const fieldChartConfig = getCurrentFieldChartConfig();
      const modelConfig = getActiveModelConfig();
      if (fieldChartConfig.mode === ChartMode.Compliance) {
        if (!modelConfig.complianceSpec || !modelConfig.legendTitle) {
          throw new Error(
            `Comfort model ${modelConfig.id} is missing its Compliance legend declaration.`,
          );
        }
        return modelConfig.legendTitle;
      }

      const output = getDeclaredExploreOutput(modelConfig, fieldChartConfig.zOutput);
      if (!output) {
        throw new Error(
          `Comfort model ${modelConfig.id} does not declare Explore output ${fieldChartConfig.zOutput}.`,
        );
      }
      return output.legendTitle ?? output.label;
    },
    getChartControlsViewModel,
    getPendingModelSwitch,
  };

  const { scheduleCalculation: scheduleCalculationInternal } = createCalculationManager(state, getVisibleInputIds);

  /**
   * Performs the final state updates for a model selection.
   */
  function completeModelSelection(nextModel: ComfortModelType) {
    state.ui.selectedModel = nextModel;
    state.ui.errorMessage = "";

    scheduleCalculationInternal({ immediate: true });
  }

  function ensureValidDynamicAxes(
    config: Pick<
      ComfortModelDefinition<never, never>,
      "dynamicAxisFields" | "defaultDynamicAxes"
    >,
  ) {
    const pair = normalizeDynamicAxisPair(config, getCurrentDynamicAxisPair());
    const settings = getCurrentChartSettings();
    settings.xAxis = pair.xAxis;
    settings.yAxis = pair.yAxis;
  }

  /**
   * Switches the active comfort model (e.g., PMV, UTCI) and triggers a re-calculation.
   * Performs a boundary check and interrupts with a confirmation if violations are found.
   * @param nextModel The ID of the model to select.
   */
  function setSelectedModel(nextModel: ComfortModelType) {
    if (state.ui.selectedModel === nextModel) {
      return;
    }

    const violations: ModelSwitchViolation[] = [];
    const nextModelConfig = getComfortModelConfig(nextModel);
    const visibleInputIds = getVisibleInputIds();

    visibleInputIds.forEach((inputId) => {
      const context: ControlBehaviorContext = {
        inputsByInput: state.inputsByInput,
        derivedByInput,
        options: state.ui.modelOptionsByModel[nextModel],
        unitSystem: state.ui.unitSystem,
        visibleInputIds: [inputId],
        selectedChartId: state.ui.selectedChartByModel[nextModel],
      };

      nextModelConfig.controls.forEach((control) => {
        const vm = control.behavior.buildViewModel(context);
        if (vm.hidden) return;

        const currentValue = vm.numericValuesByInput[inputId];
        if (currentValue === undefined) return;

        // Use a small epsilon for float comparisons to avoid precision issues.
        const epsilon = 0.0001;
        const underMin = vm.minValue !== undefined && currentValue < vm.minValue - epsilon;
        const overMax = vm.maxValue !== undefined && currentValue > vm.maxValue + epsilon;
        if (underMin || overMax) {
          violations.push({
            inputId,
            controlId: control.id,
            label: vm.label,
            currentValue,
            minAllowed: vm.minValue ?? -Infinity,
            maxAllowed: vm.maxValue ?? Infinity,
            displayUnits: vm.displayUnits,
          });
        }
      });
    });

    if (violations.length > 0) {
      state.ui.pendingModelSwitch = {
        targetModel: nextModel,
        violations,
      };
      return;
    }

    completeModelSelection(nextModel);
  }

  function confirmModelSwitch() {
    if (!state.ui.pendingModelSwitch) {
      return;
    }

    const { targetModel, violations } = state.ui.pendingModelSwitch;

    // Fix violating values by clamping them to the closest legal boundary.
    violations.forEach((v) => {
      const modelConfig = getComfortModelConfig(targetModel);
      const control = modelConfig.controls.find((c) => c.id === v.controlId);
      if (!control) return;

      const context = getModelContext(targetModel);
      const vm = control.behavior.buildViewModel(context);

      const min = vm.minValue ?? -Infinity;
      const max = vm.maxValue ?? Infinity;
      const clampedValue = Math.max(min, Math.min(max, v.currentValue));

      if (control.behavior.applyInput) {
        const patch = control.behavior.applyInput(context, v.inputId, clampedValue.toString());
        if (patch) {
          applyBehaviorPatch(targetModel, patch);
        }
      }
    });

    state.ui.pendingModelSwitch = null;
    // The clamped values live in shared canonical input state, so every model
    // cache must be invalidated before the target model schedules its refresh.
    invalidateAllModels();
    completeModelSelection(targetModel);
  }

  function cancelModelSwitch() {
    state.ui.pendingModelSwitch = null;
  }

  function setSelectedChart(nextChart: ChartIdType) {
    if (!getActiveModelConfig().chartIds.includes(nextChart)) {
      return;
    }

    state.ui.selectedChartByModel[state.ui.selectedModel] = nextChart;

    if (chartMetaById[nextChart].supportsAxisSelection) {
      ensureValidDynamicAxes(getActiveModelConfig());
    }
  }

  /**
   * Updates a specific model configuration option and triggers a re-calculation.
   * @param optionKey The key of the option to change.
   * @param nextValue The new string value for the option.
   */
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

  /**
   * Enables or disables multi-input comparison mode.
   * @param enabled Whether comparison mode is active.
   */
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

  /**
   * Sets the currently active input slot for editing.
   * @param nextInputId The ID of the input to activate.
   */
  function setActiveInputId(nextInputId: InputIdType) {
    state.ui.activeInputId = nextInputId;
  }

  /**
   * Toggles the visibility of a specific input slot in comparison mode.
   * @param inputId The ID of the input slot to toggle.
   */
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

  /**
   * Toggles the global unit system (SI vs IP).
   */
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

  /**
   * Updates a specific environmental or personal input variable.
   * @param inputId The ID of the input slot being modified.
   * @param controlId The ID of the control behavior producing the update.
   * @param rawValue The new string value from the UI control.
   */
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
    applyShareSnapshot: (snapshot: ShareStateSnapshot) => {
      applyShareSnapshotToState(state, snapshot);
      invalidateAllModels();
      scheduleCalculationInternal({ immediate: true, force: true });
    },
    updateInput,
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
