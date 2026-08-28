import type { ModelId as ModelIdType } from "../../catalog/modelIds";
import type { InputControlKey as InputControlKeyType } from "../../catalog/inputControls";
import type { OptionKey as OptionKeyType } from "../../catalog/inputModes";
import {
  type ModifierId as ModifierIdType,
} from "../../catalog/inputModifiers";
import {
  InputId,
  inputOrder,
  type InputId as InputIdType,
} from "../../catalog/inputSlots";
import { type NumericBand } from "../../catalog/modelCapabilities";
import type { SurfaceId as SurfaceIdType } from "../../catalog/surfaces";
import { syncDerivedStateForInput } from "../../engines/comfort/syncState";
import { getComfortModelConfig } from "./modelConfigs";
import {
  applyPrimaryPatch,
  collectModifierInputsForModifier,
  setModelQuantity,
  setSlotQuantity,
} from "../../engines/comfort/quantityStateRouting";
import type { RuntimeComfortModelDefinition } from "./modelConfigs/definition";
import {
  normalizeDynamicAxisPair,
  resolveDynamicAxisSelection,
} from "./dynamicAxes";
import {
  findChartEngineRegistration,
  resolveChartInstanceCapabilities,
} from "./chartInstancePresentation";
import {
  normalizeExploreStateForChart,
  replaceExploreBands,
  selectExploreOutput,
} from "./fieldChartState";
import type { AnalysisInternals } from "./analysisInternals";
import {
  canEnableModifier,
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
import { UnitSystem } from "../../catalog/units";
import {
  createDefaultCompareInputIds,
} from "./initialAnalysisState";
import {
  QuantityState,
  getPhysicalQuantityMeta,
  resolveQuantityState,
  type ChartAxisQuantityId,
  type PhysicalQuantityId as PhysicalQuantityIdType,
} from "../../catalog/quantities";
import type {
  AnalysisActions,
  AnalysisStateSlice,
  InputModifierDraftEntry,
} from "./types";

export type ScheduleCalculation = (
  options?: { immediate?: boolean; force?: boolean },
) => void;

export function createAnalysisActions(
  state: AnalysisStateSlice,
  internals: AnalysisInternals,
  scheduleCalculation: ScheduleCalculation,
): AnalysisActions {
  function completeModelSelection(
    nextModel: ModelIdType,
    options?: { schedule?: boolean },
  ) {
    state.setting.selectedModel = nextModel;
    state.output.errorMessage = "";

    if (options?.schedule !== false) {
      scheduleCalculation({ immediate: true });
    }
  }

  function ensureValidDynamicAxes(
    config: Pick<
      RuntimeComfortModelDefinition,
      "dynamicAxisFields" | "defaultDynamicAxes"
    >,
  ) {
    const pair = normalizeDynamicAxisPair(config, internals.getCurrentDynamicAxisPair());
    const settings = internals.getCurrentOutputSettings();
    settings.xAxis = pair.xAxis;
    settings.yAxis = pair.yAxis;
  }

  function setSelectedModel(
    nextModel: ModelIdType,
    options?: { validateRanges?: boolean; schedule?: boolean },
  ) {
    if (state.setting.selectedModel === nextModel) {
      return;
    }

    const nextModelConfig = getComfortModelConfig(nextModel);
    const nextModelOptions = nextModelConfig.parseOptions(
      state.setting.modelOptionsByModel[nextModel],
    );
    if (!nextModelOptions) {
      throw new Error(`Invariant violation: invalid options state for ${nextModel}.`);
    }
    const violations = options?.validateRanges === false
      ? []
      : findModelSwitchViolations(nextModelConfig, internals.getModelContext(nextModel));

    if (violations.length > 0) {
      state.setting.pendingModelSwitch = {
        targetModel: nextModel,
        violations,
      };
      return;
    }

    completeModelSelection(nextModel, options);
  }

  function confirmModelSwitch(options?: { schedule?: boolean }) {
    if (!state.setting.pendingModelSwitch) {
      return;
    }

    const { targetModel, violations } = state.setting.pendingModelSwitch;

    const modelConfig = getComfortModelConfig(targetModel);
    const context = internals.getModelContext(targetModel);
    for (const patch of buildModelSwitchClampPatches(
      modelConfig,
      context,
      violations,
    )) {
      internals.applyBehaviorPatch(targetModel, patch);
    }

    state.setting.pendingModelSwitch = null;
    internals.invalidateAllModels();
    completeModelSelection(targetModel, options);
  }

  function cancelModelSwitch() {
    state.setting.pendingModelSwitch = null;
  }

  function setSelectedChartInstance(instanceId: string) {
    const config = internals.getActiveModelConfig();
    const nextInstance = config.chartInstances.entries.find(
      (entry) => entry.instanceId === instanceId,
    );
    if (!nextInstance) {
      return;
    }

    state.setting.selectedChartInstanceByModel[state.setting.selectedModel] = instanceId;

    const registration = findChartEngineRegistration(
      config.chartEngineRegistrations,
      instanceId,
    );
    const settings = internals.getCurrentOutputSettings();
    const normalized = normalizeExploreStateForChart(config, settings, registration);
    settings.exploreOutput = normalized.exploreOutput;
    settings.exploreBands = normalized.exploreBands;

    if (resolveChartInstanceCapabilities(nextInstance).allowsAxisSelection) {
      ensureValidDynamicAxes(config);
    }
  }

  function setModelOption(optionKey: OptionKeyType, nextValue: string) {
    const modelConfig = internals.getActiveModelConfig();
    const context = internals.getModelContext(state.setting.selectedModel);
    const patch = modelConfig.optionHandlersByKey[optionKey]?.(context, nextValue) ?? null;

    if (!patch) {
      return;
    }

    internals.applyBehaviorPatch(state.setting.selectedModel, patch);
    if (patch.quantitiesPatch) {
      internals.invalidateAllModels();
    } else {
      internals.invalidateModel(state.setting.selectedModel);
    }
    scheduleCalculation({ immediate: true });
  }

  function setCompareEnabled(enabled: boolean) {
    state.setting.compareEnabled = enabled;

    if (enabled) {
      state.setting.compareInputIds = normalizeCompareInputIds(state.setting.compareInputIds);
      if (state.setting.compareInputIds.length < 2) {
        state.setting.compareInputIds = createDefaultCompareInputIds();
      }
      if (!state.setting.compareInputIds.includes(state.setting.activeInputId)) {
        state.setting.activeInputId = state.setting.compareInputIds[0] ?? InputId.Input1;
      }
    } else {
      state.setting.activeInputId = InputId.Input1;
    }

    internals.invalidateAllModels();
    scheduleCalculation({ immediate: true });
  }

  function setActiveInputId(nextInputId: InputIdType) {
    state.setting.activeInputId = nextInputId;
  }

  function toggleCompareInputVisibility(inputId: InputIdType) {
    if (!state.setting.compareEnabled || inputId === InputId.Input1) {
      return;
    }

    if (state.setting.compareInputIds.includes(inputId)) {
      state.setting.compareInputIds = state.setting.compareInputIds.filter((visibleInputId) => visibleInputId !== inputId);
      if (state.setting.activeInputId === inputId) {
        state.setting.activeInputId = state.setting.compareInputIds[0] ?? InputId.Input1;
      }
    } else {
      state.setting.compareInputIds = normalizeCompareInputIds([...state.setting.compareInputIds, inputId]);
    }

    internals.invalidateAllModels();
    scheduleCalculation({ immediate: true });
  }

  function toggleUnitSystem() {
    state.setting.unitSystem = state.setting.unitSystem === UnitSystem.SI ? UnitSystem.IP : UnitSystem.SI;
  }

  function setActiveSurface(workspace: SurfaceIdType) {
    state.setting.activeSurface = workspace;
  }

  function setDynamicXAxis(fieldKey: ChartAxisQuantityId) {
    const pair = resolveDynamicAxisSelection(
      internals.getActiveModelConfig(),
      internals.getCurrentDynamicAxisPair(),
      "x",
      fieldKey,
    );
    if (!pair) {
      return;
    }

    const settings = internals.getCurrentOutputSettings();
    settings.xAxis = pair.xAxis;
    settings.yAxis = pair.yAxis;
  }

  function setDynamicYAxis(fieldKey: ChartAxisQuantityId) {
    const pair = resolveDynamicAxisSelection(
      internals.getActiveModelConfig(),
      internals.getCurrentDynamicAxisPair(),
      "y",
      fieldKey,
    );
    if (!pair) {
      return;
    }

    const settings = internals.getCurrentOutputSettings();
    settings.xAxis = pair.xAxis;
    settings.yAxis = pair.yAxis;
  }

  function setExploreOutput(outputKey: PhysicalQuantityIdType) {
    const config = internals.getActiveModelConfig();
    const registration = findChartEngineRegistration(
      config.chartEngineRegistrations,
      internals.getCurrentSelectedChartInstanceId(),
    );
    const nextSettings = selectExploreOutput(
      config,
      internals.getCurrentOutputSettings(),
      outputKey,
      registration,
    );
    if (nextSettings) {
      const settings = internals.getCurrentOutputSettings();
      settings.exploreOutput = nextSettings.exploreOutput;
      settings.exploreBands = nextSettings.exploreBands;
    }
  }

  function setExploreBands(bands: readonly NumericBand[]): boolean {
    const nextSettings = replaceExploreBands(
      internals.getActiveModelConfig(),
      internals.getCurrentOutputSettings(),
      bands,
    );
    if (!nextSettings) {
      return false;
    }

    const settings = internals.getCurrentOutputSettings();
    settings.exploreOutput = nextSettings.exploreOutput;
    settings.exploreBands = nextSettings.exploreBands;
    return true;
  }

  function setChartBaselineInputId(inputId: InputIdType) {
    if (!inputOrder.includes(inputId)) {
      return;
    }
    internals.getCurrentOutputSettings().baselineInputId = inputId;
  }

  function updateBuiltinQuantity(
    inputId: InputIdType,
    quantityId: PhysicalQuantityIdType,
    valueSi: number,
  ): boolean {
    const meta = getPhysicalQuantityMeta(quantityId);
    if (!Number.isFinite(valueSi) || valueSi < meta.minSi || valueSi > meta.maxSi) {
      return false;
    }

    const storage = resolveQuantityState(quantityId);
    if (storage === QuantityState.Primary) {
      applyPrimaryPatch(state.input.quantitiesByInput, inputId, { [quantityId]: valueSi });
      syncDerivedStateForInput(
        inputId,
        state.input.quantitiesByInput,
        state.input.auxiliaryQuantitiesByInput,
      );
    } else if (storage === QuantityState.Slot) {
      setSlotQuantity(state.input.auxiliaryQuantitiesByInput[inputId], quantityId, valueSi);
    } else {
      return false;
    }

    internals.invalidateAllModels();
    scheduleCalculation();
    return true;
  }

  function updateModelQuantity(
    modelId: ModelIdType,
    quantityId: PhysicalQuantityIdType,
    valueSi: number,
  ): boolean {
    const meta = getPhysicalQuantityMeta(quantityId);
    if (
      resolveQuantityState(quantityId) !== QuantityState.Extra
      || !getComfortModelConfig(modelId).extraQuantities.some((id) => id === quantityId)
      || !Number.isFinite(valueSi)
      || valueSi < meta.minSi
      || valueSi > meta.maxSi
    ) {
      return false;
    }

    setModelQuantity(state.input.modelInputsByModel[modelId], quantityId, valueSi);
    if (state.setting.selectedModel === modelId) {
      internals.invalidateAllModels();
      scheduleCalculation();
    }
    return true;
  }

  function updateInput(inputId: InputIdType, controlId: InputControlKeyType, rawValue: string) {
    const control = internals.getActiveModelConfig().controls.find((item) => item.id === controlId);
    if (!control?.behavior.applyInput) {
      return;
    }

    const patch = control.behavior.applyInput(
      internals.getModelContext(state.setting.selectedModel),
      inputId,
      rawValue,
    );
    if (!patch) {
      return;
    }

    internals.applyBehaviorPatch(state.setting.selectedModel, patch);

    internals.invalidateAllModels();
    scheduleCalculation();
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
    internals.invalidateModelsSupportingModifiers(modifierIds);
    if (internals.getActiveModelConfig().modifiers.some(({ id }) => modifierIdSet.has(id))) {
      scheduleCalculation({ immediate: options?.immediate });
    }
  }

  function updateModifierInput(
    inputId: InputIdType,
    modifierId: ModifierIdType,
    quantityId: PhysicalQuantityIdType,
    rawValue: string,
  ): boolean {
    const modifier = findModelModifier(internals.getActiveModelConfig(), modifierId);
    if (!modifier) return false;

    const auxiliary = state.input.auxiliaryQuantitiesByInput[inputId];
    const wasActive = state.input.activeModifiersByInput[inputId][modifierId];
    const transition = parseModifierInputTransition(
      modifier,
      quantityId,
      rawValue,
      state.setting.unitSystem,
      wasActive,
    );
    if (!transition.accepted) return false;

    setSlotQuantity(auxiliary, quantityId, transition.valueSi);
    if (transition.disableModifier) {
      state.input.activeModifiersByInput[inputId][modifierId] = false;
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
    const modifier = findModelModifier(internals.getActiveModelConfig(), modifierId);
    if (!modifier) return false;
    const currentEnabled = state.input.activeModifiersByInput[inputId][modifierId];
    if (currentEnabled === enabled) return true;
    if (
      enabled
      && !canEnableModifier(
        modifier,
        state.input.auxiliaryQuantitiesByInput[inputId],
      )
    ) {
      return false;
    }

    state.input.activeModifiersByInput[inputId][modifierId] = enabled;
    refreshAfterModifierChange(modifierId, { immediate: true });
    return true;
  }

  function applyInputModifierDraft(
    draft: readonly InputModifierDraftEntry[],
  ): boolean {
    const config = internals.getActiveModelConfig();
    const visibleInputIds = internals.getVisibleInputIds();
    if (!isInputModifierDraftValid(config, visibleInputIds, draft)) {
      return false;
    }

    const modifiersWithEffectiveChanges = new Set<ModifierIdType>();
    for (const entry of draft) {
      const modifier = findModelModifier(config, entry.modifierId);
      if (!modifier) return false;

      const wasEnabled = state.input.activeModifiersByInput[entry.inputId][entry.modifierId];
      const currentInputs = collectModifierInputsForModifier(
        state.input.auxiliaryQuantitiesByInput[entry.inputId],
        entry.modifierId,
      );
      const inputsChanged = modifier.extraInputs.some((quantityId) => (
        currentInputs[quantityId] !== entry.inputs[quantityId]
      ));
      if (wasEnabled !== entry.enabled || (inputsChanged && (wasEnabled || entry.enabled))) {
        modifiersWithEffectiveChanges.add(entry.modifierId);
      }
    }

    for (const entry of draft) {
      state.input.activeModifiersByInput[entry.inputId][entry.modifierId] = entry.enabled;
      for (const quantityId of config.modifiers
        .find(({ id }) => id === entry.modifierId)?.extraInputs ?? []) {
        setSlotQuantity(
          state.input.auxiliaryQuantitiesByInput[entry.inputId],
          quantityId,
          entry.inputs[quantityId],
        );
      }
    }

    refreshAfterModifierChanges(
      [...modifiersWithEffectiveChanges],
      { immediate: true },
    );
    return true;
  }

  return {
    setSelectedModel,
    setSelectedChartInstance,
    setModelOption,
    setCompareEnabled,
    setActiveInputId,
    toggleCompareInputVisibility,
    toggleUnitSystem,
    setActiveSurface,
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
      internals.invalidateAllModels();
      if (options?.schedule !== false) {
        scheduleCalculation({ immediate: true, force: true });
      }
    },
    updateInput,
    updateBuiltinQuantity,
    updateModelQuantity,
    updateModifierInput,
    setModifierEnabled,
    applyInputModifierDraft,
    scheduleCalculation,
    confirmModelSwitch,
    cancelModelSwitch,
  };
}
