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
import { ComfortModel, comfortModelOrder, type ComfortModel as ComfortModelType } from "../../models/comfortModels";
import { FieldKey, type FieldKey as FieldKeyType } from "../../models/fieldKeys";
import { allFieldOrder, fieldMetaByKey } from "../../models/inputFieldsMeta";
import type { InputControlId as InputControlIdType } from "../../models/inputControls";
import type { OptionKey as OptionKeyType } from "../../models/inputModes";
import { UnitSystem } from "../../models/units";
import type { BehaviorPatch, ControlBehaviorContext } from "../../services/comfort/controls/types";
import { deriveInputsDerivedState } from "../../services/comfort/syncState";
import { comfortModelConfigs, getComfortModelConfig } from "./modelConfigs";
import { createCalculationManager } from "./calculationManager.svelte";
import {
  applyShareSnapshotToState,
  createShareStateSnapshot,
  type ShareStateSnapshot,
} from "./shareState";
import type {
  CalculationCacheStatus,
  ComfortToolController,
  InputState,
  ModelCalculationCacheByModelState,
  ModelOptionsByModelState,
  SelectedChartByModelState,
  ComfortToolStateSlice,
} from "./types";

/**
 * Creates a default input state for a specific input ID.
 * @param inputId The ID of the input slot (e.g., Input1, Input2).
 * @returns A record of field keys mapping to their default numeric values.
 */
function createInputState(inputId: InputIdType): InputState {
  return allFieldOrder.reduce((accumulator, fieldKey) => {
    accumulator[fieldKey] = inputDefaultsById[inputId][fieldKey] ?? fieldMetaByKey[fieldKey].defaultValue;
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

/**
 * Sorts and enforces a data contract for input IDs. 
 * It filters dirty input IDs and sequences them rigidly against the main application layout index.
 * @param inputIds The unsorted or incomplete list of input IDs.
 * @returns A normalized array of input IDs.
 */
function normalizeCompareInputIds(inputIds: InputIdType[]): InputIdType[] {
  return inputOrder.filter((inputId) => inputId === InputId.Input1 || inputIds.includes(inputId));
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
function createEmptyCalculationCache<ResultType>(): {
  status: CalculationCacheStatus;
  lastVisibleInputIds: InputIdType[];
  resultsByInput: Record<InputIdType, ResultType | null>;
  chartSource: null;
} {
  return {
    status: "empty",
    lastVisibleInputIds: [InputId.Input1],
    resultsByInput: createEmptyInputResultRecord(),
    chartSource: null,
  };
}

/**
 * Initializes the calculation cache registry for all available comfort models.
 * @returns A record mapping each model to an empty calculation cache.
 */
function createCalculationCacheByModel(): ModelCalculationCacheByModelState {
  return {
    [ComfortModel.Pmv]: createEmptyCalculationCache(),
    [ComfortModel.Utci]: createEmptyCalculationCache(),
    [ComfortModel.AdaptiveAshrae]: createEmptyCalculationCache(),
    [ComfortModel.AdaptiveEn]: createEmptyCalculationCache(),
    [ComfortModel.HeatIndex]: createEmptyCalculationCache(),
    [ComfortModel.Humidex]: createEmptyCalculationCache(),
    [ComfortModel.WindChill]: createEmptyCalculationCache(),
  //   todo see my other comments about having to update this manually. I'm quite concerned here because I don't know exactly what the code is doing but in many parts of the codes we need to create an empty cache and then define all the different models. This is going to be very hard to maintain. we should have one central source of truth which tells us which models are included in the tool.
  } as ModelCalculationCacheByModelState;
}

/**
 * Creates and initializes the root state for the comfort-tool.
 * @returns A ComfortToolController containing the core state and action methods.
 */
export function createComfortToolState(): ComfortToolController {
  const inputsByInput = $state(createInputsByInput());
  const derivedByInput = $derived.by(() => deriveInputsDerivedState(inputsByInput));
  const ui = $state({
    selectedModel: ComfortModel.Pmv,
    selectedChartByModel: createSelectedChartByModel(),
    modelOptionsByModel: createModelOptionsByModel(),
    compareEnabled: false,
    compareInputIds: createDefaultCompareInputIds(),
    activeInputId: InputId.Input1,
    unitSystem: UnitSystem.SI,
    dynamicXAxis: FieldKey.DryBulbTemperature,
    dynamicYAxis: FieldKey.RelativeHumidity,
    chartBaselineInputId: InputId.Input1,
    isLoading: false,
    errorMessage: "",
    calculationCacheByModel: createCalculationCacheByModel(),
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
    // todo AI The "as any" cast here is a symptom of the per-model cache types. If ModelCalculationCache were a single generic type, this assignment would type-check without casting.
    state.ui.calculationCacheByModel[modelId] = {
      ...cache,
      status: nextStatus,
    } as any;
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

  function getActiveModelConfig() {
    return getComfortModelConfig(state.ui.selectedModel);
  }

  function getCurrentSelectedChartId() {
    return state.ui.selectedChartByModel[state.ui.selectedModel];
  }

  function getCurrentModelCache() {
    return state.ui.calculationCacheByModel[state.ui.selectedModel];
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
          state.inputsByInput[inputId as InputIdType][fieldKey] = value;
        });
      });
    }
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

      // todo AI Same problem: the generic type parameters are lost here so we cast to any. A generic ModelCalculationCache would fix this.
      return (getActiveModelConfig() as any).buildResultSections(
        cache.resultsByInput,
        getVisibleInputIds(),
        state.ui.unitSystem,
        state.ui.modelOptionsByModel[state.ui.selectedModel],
        getCurrentSelectedChartId(),
      );
    },
    getCurrentChartResult: () => {
      const cache = getCurrentModelCache();
      // todo AI Same problem as above.
      return (getActiveModelConfig() as any).buildChartResult(
        getCurrentSelectedChartId(),
        cache.chartSource,
        cache.resultsByInput,
        state.ui.unitSystem,
      );
    },
    getCurrentBaselineInputId: () => state.ui.chartBaselineInputId,
    getCurrentChartEmptyMessage: () => chartMetaById[getCurrentSelectedChartId()].emptyMessage,
    getCurrentChartOptions: () => getActiveModelConfig().chartIds.map((chartId) => ({
      name: chartMetaById[chartId].name,
      value: chartId,
    })),
    getCurrentSelectedChart: () => getCurrentSelectedChartId(),
    getCurrentChartHeightClass: () => chartMetaById[getCurrentSelectedChartId()].heightClass,
    getCurrentCacheStatus: () => getCurrentModelCache().status,
    getDynamicAxisOptions: () => getActiveModelConfig().dynamicAxisFields || [],
  };

  const calculationManager = createCalculationManager(state, getVisibleInputIds);

  /**
   * Schedules a calculation to run after a short debounce period.
   * @param options Configuration for the calculation (immediate or forced).
   */
  function scheduleCalculationInternal(options?: { immediate?: boolean; force?: boolean }) {
    calculationManager.scheduleCalculation(options);
  }

  /**
   * Switches the active comfort model (e.g., PMV, UTCI) and triggers a re-calculation.
   * @param nextModel The ID of the model to select.
   */
  function setSelectedModel(nextModel: ComfortModelType) {
    state.ui.selectedModel = nextModel;
    state.ui.errorMessage = "";

    // Ensure dynamic axes are valid for the new model.
    const config = getComfortModelConfig(nextModel);
    if (config.dynamicAxisFields && config.dynamicAxisFields.length >= 2) {
      if (!config.dynamicAxisFields.includes(state.ui.dynamicXAxis as any)) {
        state.ui.dynamicXAxis = config.dynamicAxisFields[0];
      }
      if (!config.dynamicAxisFields.includes(state.ui.dynamicYAxis as any)) {
        state.ui.dynamicYAxis = config.dynamicAxisFields[config.dynamicAxisFields.length - 1];
      }
    }

    scheduleCalculationInternal({ immediate: true });
  }

  /**
   * Updates the selected chart for the current model.
   * @param nextChart The ID of the chart to display.
   */
  function setSelectedChart(nextChart: ChartIdType) {
    if (!getActiveModelConfig().chartIds.includes(nextChart)) {
      return;
    }

    state.ui.selectedChartByModel[state.ui.selectedModel] = nextChart;
    invalidateModel(state.ui.selectedModel);
    scheduleCalculationInternal({ immediate: true });
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
    invalidateModel(state.ui.selectedModel);
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
      state.ui.chartBaselineInputId = InputId.Input1;
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

  function setDynamicXAxis(fieldKey: FieldKeyType) {
    const prevX = state.ui.dynamicXAxis;
    state.ui.dynamicXAxis = fieldKey;

    // Auto-swap if the newly selected X-axis is the same as the current Y-axis
    if (fieldKey === state.ui.dynamicYAxis) {
      state.ui.dynamicYAxis = prevX;
    }

    invalidateAllModels();
    scheduleCalculationInternal({ immediate: true });
  }

  function setDynamicYAxis(fieldKey: FieldKeyType) {
    const prevY = state.ui.dynamicYAxis;
    state.ui.dynamicYAxis = fieldKey;

    // Auto-swap if the newly selected Y-axis is the same as the current X-axis
    if (fieldKey === state.ui.dynamicXAxis) {
      state.ui.dynamicXAxis = prevY;
    }

    invalidateAllModels();
    scheduleCalculationInternal({ immediate: true });
  }

  function setChartBaselineInputId(inputId: InputIdType) {
    state.ui.chartBaselineInputId = inputId;
    invalidateAllModels();
    scheduleCalculationInternal({ immediate: true });
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
    setDynamicXAxis,
    setDynamicYAxis,
    setChartBaselineInputId,
    exportShareSnapshot: () => createShareStateSnapshot(state),
    applyShareSnapshot: (snapshot: ShareStateSnapshot) => {
      applyShareSnapshotToState(state, snapshot);
      invalidateAllModels();
      scheduleCalculationInternal({ immediate: true, force: true });
    },
    updateInput,
    scheduleCalculation: (scheduleOptions) => scheduleCalculationInternal(scheduleOptions),
  };

  return {
    state,
    actions,
    selectors,
  };
}
