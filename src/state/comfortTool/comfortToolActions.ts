import type { ModelId as ModelIdType } from "../../models/comfortModels";
import type { InputControlKey as InputControlKeyType } from "../../models/inputControls";
import type { OptionKey as OptionKeyType } from "../../models/inputModes";
import {
  type ModifierId as ModifierIdType,
} from "../../models/inputModifiers";
import {
  InputId,
  inputOrder,
  type InputId as InputIdType,
} from "../../models/inputSlots";
import {
  type ModelOutputKey,
  type NumericBand,
} from "../../models/modelCapabilities";
import type { WorkspaceId as WorkspaceIdType } from "../../models/workspaces";
import { syncDerivedStateForInput } from "../../services/comfort/syncState";
import { getComfortModelConfig } from "./modelConfigs";
import {
  applyPrimaryPatch,
  collectModifierInputsForModifier,
  setModelQuantity,
  setSlotQuantity,
} from "../../services/comfort/quantityStateRouting";
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
import type { ComfortToolInternals } from "./comfortToolInternals";
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
import { UnitSystem } from "../../models/units";
import {
  createDefaultCompareInputIds,
} from "./initialComfortToolState";
import {
  QuantityState,
  getPhysicalQuantityMeta,
  resolveQuantityState,
  type ChartAxisQuantityId,
  type PhysicalQuantityId as PhysicalQuantityIdType,
} from "../../models/physicalQuantities";
import type {
  ComfortToolActions,
  ComfortToolStateSlice,
  InputModifierDraftEntry,
} from "./types";

export type ScheduleCalculation = (
  options?: { immediate?: boolean; force?: boolean },
) => void;

export function createComfortToolActions(
  state: ComfortToolStateSlice,
  internals: ComfortToolInternals,
  scheduleCalculation: ScheduleCalculation,
): ComfortToolActions {
  function completeModelSelection(
    nextModel: ModelIdType,
    options?: { schedule?: boolean },
  ) {
    state.ui.selectedModel = nextModel;
    state.ui.errorMessage = "";

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
      : findModelSwitchViolations(nextModelConfig, internals.getModelContext(nextModel));

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
    const context = internals.getModelContext(targetModel);
    for (const patch of buildModelSwitchClampPatches(
      modelConfig,
      context,
      violations,
    )) {
      internals.applyBehaviorPatch(targetModel, patch);
    }

    state.ui.pendingModelSwitch = null;
    internals.invalidateAllModels();
    completeModelSelection(targetModel, options);
  }

  function cancelModelSwitch() {
    state.ui.pendingModelSwitch = null;
  }

  function setSelectedChartInstance(instanceId: string) {
    const config = internals.getActiveModelConfig();
    const nextInstance = config.chartInstances.entries.find(
      (entry) => entry.instanceId === instanceId,
    );
    if (!nextInstance) {
      return;
    }

    state.ui.selectedChartInstanceByModel[state.ui.selectedModel] = instanceId;

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
    const context = internals.getModelContext(state.ui.selectedModel);
    const patch = modelConfig.optionHandlersByKey[optionKey]?.(context, nextValue) ?? null;

    if (!patch) {
      return;
    }

    internals.applyBehaviorPatch(state.ui.selectedModel, patch);
    if (patch.quantitiesPatch) {
      internals.invalidateAllModels();
    } else {
      internals.invalidateModel(state.ui.selectedModel);
    }
    scheduleCalculation({ immediate: true });
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

    internals.invalidateAllModels();
    scheduleCalculation({ immediate: true });
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

    internals.invalidateAllModels();
    scheduleCalculation({ immediate: true });
  }

  function toggleUnitSystem() {
    state.ui.unitSystem = state.ui.unitSystem === UnitSystem.SI ? UnitSystem.IP : UnitSystem.SI;
  }

  function setActiveWorkspace(workspace: WorkspaceIdType) {
    state.ui.activeWorkspace = workspace;
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

  function setExploreOutput(outputKey: ModelOutputKey) {
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
      applyPrimaryPatch(state.quantitiesByInput, inputId, { [quantityId]: valueSi });
      syncDerivedStateForInput(
        inputId,
        state.quantitiesByInput,
        state.auxiliaryQuantitiesByInput,
      );
    } else if (storage === QuantityState.Slot) {
      setSlotQuantity(state.auxiliaryQuantitiesByInput[inputId], quantityId, valueSi);
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
      resolveQuantityState(quantityId) !== QuantityState.Model
      || meta.ownerModelId !== modelId
      || !Number.isFinite(valueSi)
      || valueSi < meta.minSi
      || valueSi > meta.maxSi
    ) {
      return false;
    }

    setModelQuantity(state.modelInputsByModel[modelId], quantityId, valueSi);
    if (state.ui.selectedModel === modelId) {
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
      internals.getModelContext(state.ui.selectedModel),
      inputId,
      rawValue,
    );
    if (!patch) {
      return;
    }

    internals.applyBehaviorPatch(state.ui.selectedModel, patch);

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

    const auxiliary = state.auxiliaryQuantitiesByInput[inputId];
    const wasActive = state.activeModifiersByInput[inputId][modifierId];
    const transition = parseModifierInputTransition(
      modifier,
      quantityId,
      rawValue,
      state.ui.unitSystem,
      wasActive,
    );
    if (!transition.accepted) return false;

    setSlotQuantity(auxiliary, quantityId, transition.valueSi);
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
    const modifier = findModelModifier(internals.getActiveModelConfig(), modifierId);
    if (!modifier) return false;
    const currentEnabled = state.activeModifiersByInput[inputId][modifierId];
    if (currentEnabled === enabled) return true;
    if (
      enabled
      && !canEnableModifier(
        modifier,
        state.auxiliaryQuantitiesByInput[inputId],
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
    const config = internals.getActiveModelConfig();
    const visibleInputIds = internals.getVisibleInputIds();
    if (!isInputModifierDraftValid(config, visibleInputIds, draft)) {
      return false;
    }

    const modifiersWithEffectiveChanges = new Set<ModifierIdType>();
    for (const entry of draft) {
      const modifier = findModelModifier(config, entry.modifierId);
      if (!modifier) return false;

      const wasEnabled = state.activeModifiersByInput[entry.inputId][entry.modifierId];
      const currentInputs = collectModifierInputsForModifier(
        state.auxiliaryQuantitiesByInput[entry.inputId],
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
      state.activeModifiersByInput[entry.inputId][entry.modifierId] = entry.enabled;
      for (const quantityId of config.modifiers
        .find(({ id }) => id === entry.modifierId)?.extraInputs ?? []) {
        setSlotQuantity(
          state.auxiliaryQuantitiesByInput[entry.inputId],
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
    setActiveWorkspace,
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
