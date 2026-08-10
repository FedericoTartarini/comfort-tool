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
import { fieldMetaByKey } from "../../models/inputFieldsMeta";
import { inputDisplayMetaById } from "../../models/inputSlotPresentation";
import type { InputControlId as InputControlIdType } from "../../models/inputControls";
import type { OptionKey as OptionKeyType } from "../../models/inputModes";
import {
  modifierOrder,
  type ModifierFieldKey as ModifierFieldKeyType,
  type ModifierId as ModifierIdType,
} from "../../models/inputModifiers";
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
import {
  applyInputModifierChain,
  inputModifierById,
  isModifierConfigurationComplete,
  isModifierFieldValueValid,
} from "../../services/comfort/inputModifiers";
import {
  convertFieldValueFromSi,
  convertModifierFieldValueFromSi,
  convertModifierFieldValueToSi,
  formatDisplayValue,
  getModifierFieldDisplayMeta,
} from "../../services/units";
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
  ActiveModifiersByInputState,
  InputState,
  InputModifierControlViewModel,
  InputsByInputState,
  ModifierInputsByInputState,
  ModelCalculationCacheByModelState,
  ModelCalculationCache,
  ModelOptionsByModelState,
  SelectedChartByModelState,
  ComfortToolStateSlice,
  ModelSwitchViolation,
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

function createActiveModifiersByInput(): ActiveModifiersByInputState {
  return inputOrder.reduce((byInput, inputId) => {
    byInput[inputId] = modifierOrder.reduce((byModifier, modifierId) => {
      byModifier[modifierId] = false;
      return byModifier;
    }, {} as Record<ModifierIdType, boolean>);
    return byInput;
  }, {} as ActiveModifiersByInputState);
}

function createModifierInputsByInput(): ModifierInputsByInputState {
  return inputOrder.reduce((byInput, inputId) => {
    byInput[inputId] = modifierOrder.reduce((byModifier, modifierId) => {
      byModifier[modifierId] = inputModifierById[modifierId].extraInputs.reduce(
        (values, fieldKey) => {
          values[fieldKey] = null;
          return values;
        },
        {} as ModifierInputsByInputState[typeof inputId][typeof modifierId],
      );
      return byModifier;
    }, {} as ModifierInputsByInputState[typeof inputId]);
    return byInput;
  }, {} as ModifierInputsByInputState);
}

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

  function invalidateModelsSupportingModifier(modifierId: ModifierIdType) {
    let keptErrorMessage = false;
    for (const modelId of comfortModelOrder) {
      if (!comfortModelConfigs[modelId].supportedModifiers.includes(modifierId)) continue;
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

  function getActiveModelConfig(): ComfortModelDefinition<unknown, unknown, Band> {
    return getComfortModelConfig(state.ui.selectedModel) as unknown as ComfortModelDefinition<
      unknown,
      unknown,
      Band
    >;
  }

  function getEffectiveInputsByInput(
    modelId: ComfortModelType = state.ui.selectedModel,
  ): InputsByInputState {
    const supportedModifiers = getComfortModelConfig(modelId).supportedModifiers;
    const getEffectiveInput = (inputId: InputIdType) => applyInputModifierChain(
      state.inputsByInput[inputId],
      supportedModifiers,
      state.activeModifiersByInput[inputId],
      state.modifierInputsByInput[inputId],
    );
    return {
      [InputId.Input1]: getEffectiveInput(InputId.Input1),
      [InputId.Input2]: getEffectiveInput(InputId.Input2),
      [InputId.Input3]: getEffectiveInput(InputId.Input3),
    };
  }

  function getInputModifierControls(): InputModifierControlViewModel[] {
    const unitSystem = state.ui.unitSystem;
    const visibleInputIds = getVisibleInputIds();
    const effectiveInputs = getEffectiveInputsByInput();

    return getActiveModelConfig().supportedModifiers.map((modifierId) => {
      const modifier = inputModifierById[modifierId];
      return {
        id: modifier.id,
        label: modifier.label,
        description: modifier.description,
        activeByInput: visibleInputIds.reduce((values, inputId) => {
          values[inputId] = state.activeModifiersByInput[inputId][modifierId];
          return values;
        }, {} as InputModifierControlViewModel["activeByInput"]),
        completeByInput: visibleInputIds.reduce((values, inputId) => {
          values[inputId] = isModifierConfigurationComplete(
            modifierId,
            state.modifierInputsByInput[inputId][modifierId],
          );
          return values;
        }, {} as InputModifierControlViewModel["completeByInput"]),
        extraInputs: modifier.extraInputs.map((fieldKey) => {
          const displayMeta = getModifierFieldDisplayMeta(fieldKey, unitSystem);
          return {
            key: fieldKey,
            ...displayMeta,
            displayValuesByInput: visibleInputIds.reduce((values, inputId) => {
              const valueSi = state.modifierInputsByInput[inputId][modifierId][fieldKey];
              values[inputId] = valueSi === null || valueSi === undefined
                ? ""
                : formatDisplayValue(
                    convertModifierFieldValueFromSi(fieldKey, valueSi, unitSystem),
                    displayMeta.decimals,
                  );
              return values;
            }, {} as Record<InputIdType, string>),
          };
        }),
        affectedFields: modifier.affectedFields.map((fieldKey) => {
          const meta = fieldMetaByKey[fieldKey];
          return {
            key: fieldKey,
            label: `Effective ${meta.label.toLowerCase()}`,
            displayUnits: meta.displayUnits[unitSystem],
            displayValuesByInput: visibleInputIds.reduce((values, inputId) => {
              const displayValue = convertFieldValueFromSi(
                fieldKey,
                effectiveInputs[inputId][fieldKey],
                unitSystem,
              );
              values[inputId] = formatDisplayValue(displayValue, meta.decimals);
              return values;
            }, {} as Record<InputIdType, string>),
          };
        }),
      };
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
    const remembered = getCurrentChartSettings().baselineInputId;
    return state.ui.compareEnabled && getVisibleInputIds().includes(remembered)
      ? remembered
      : InputId.Input1;
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
    const chartDefinition = getCurrentChartDefinition();
    const supportsAxisSelection = chartDefinition.allowsAxisSelection;
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
              locked: chartDefinition.locksYAxis,
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
    getCurrentChartDefinition,
    getCurrentChartOptions: () => getActiveModelConfig().charts.entries,
    getCurrentSelectedChart: () => getCurrentSelectedChartId(),
    getCurrentCacheStatus: () => getCurrentModelCache().status,
    getCurrentChartLegendZones: () => {
      return getCurrentChartDefinition().showsLegend
        ? selectLegendBands(getCurrentFieldChartConfig().bands)
        : null;
    },
    getCurrentChartLegendTitle: () => {
      const fieldChartConfig = getCurrentFieldChartConfig();
      const modelConfig = getActiveModelConfig();
      if (!getCurrentChartDefinition().showsLegend) return "";
      if (fieldChartConfig.mode === ChartMode.Compliance) {
        if (!modelConfig.complianceSpec) {
          throw new Error(
            `Comfort model ${modelConfig.id} is missing its Compliance legend declaration.`,
          );
        }
        return modelConfig.complianceSpec.legendTitle;
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

  const { scheduleCalculation: scheduleCalculationInternal } = createCalculationManager(
    state,
    getVisibleInputIds,
    getEffectiveInputsByInput,
  );

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

  function setSelectedModel(nextModel: ComfortModelType) {
    if (state.ui.selectedModel === nextModel) {
      return;
    }

    const violations: ModelSwitchViolation[] = [];
    const nextModelConfig = getComfortModelConfig(nextModel);
    const nextModelOptions = nextModelConfig.parseOptions(
      state.ui.modelOptionsByModel[nextModel],
    );
    if (!nextModelOptions) {
      throw new Error(`Invariant violation: invalid options state for ${nextModel}.`);
    }
    const visibleInputIds = getVisibleInputIds();

    visibleInputIds.forEach((inputId) => {
      const context: ControlBehaviorContext = {
        inputsByInput: state.inputsByInput,
        derivedByInput,
        options: nextModelOptions,
        unitSystem: state.ui.unitSystem,
        visibleInputIds: [inputId],
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
    invalidateModelsSupportingModifier(modifierId);
    if (getActiveModelConfig().supportedModifiers.includes(modifierId)) {
      scheduleCalculationInternal({ immediate: options?.immediate });
    }
  }

  function updateModifierInput(
    inputId: InputIdType,
    modifierId: ModifierIdType,
    fieldKey: ModifierFieldKeyType,
    rawValue: string,
  ): boolean {
    const modifier = inputModifierById[modifierId];
    if (
      !getActiveModelConfig().supportedModifiers.includes(modifierId)
      || !modifier.extraInputs.includes(fieldKey)
    ) {
      return false;
    }

    const currentInputs = state.modifierInputsByInput[inputId][modifierId];
    const wasActive = state.activeModifiersByInput[inputId][modifierId];
    if (rawValue.trim() === "") {
      currentInputs[fieldKey] = null;
      if (wasActive) {
        state.activeModifiersByInput[inputId][modifierId] = false;
        refreshAfterModifierChange(modifierId, { immediate: true });
      }
      return true;
    }

    const displayValue = Number(rawValue);
    if (!Number.isFinite(displayValue)) return false;
    const valueSi = convertModifierFieldValueToSi(
      fieldKey,
      displayValue,
      state.ui.unitSystem,
    );
    if (!isModifierFieldValueValid(fieldKey, valueSi)) return false;

    currentInputs[fieldKey] = valueSi;
    if (wasActive) refreshAfterModifierChange(modifierId);
    return true;
  }

  function setModifierEnabled(
    inputId: InputIdType,
    modifierId: ModifierIdType,
    enabled: boolean,
  ): boolean {
    if (!getActiveModelConfig().supportedModifiers.includes(modifierId)) return false;
    const currentEnabled = state.activeModifiersByInput[inputId][modifierId];
    if (currentEnabled === enabled) return true;
    if (
      enabled
      && !isModifierConfigurationComplete(
        modifierId,
        state.modifierInputsByInput[inputId][modifierId],
      )
    ) {
      return false;
    }

    state.activeModifiersByInput[inputId][modifierId] = enabled;
    refreshAfterModifierChange(modifierId, { immediate: true });
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
    applyShareSnapshot: (snapshot: ShareStateSnapshot) => {
      applyShareSnapshotToState(state, snapshot);
      invalidateAllModels();
      scheduleCalculationInternal({ immediate: true, force: true });
    },
    updateInput,
    updateModifierInput,
    setModifierEnabled,
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
