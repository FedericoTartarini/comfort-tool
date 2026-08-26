import {
  InputId,
  inputOrder,
  type InputId as InputIdType,
} from "../../models/inputSlots";
import type { ChartInstanceDeclaration } from "../../models/output/chartKinds";
import type { ModelId as ModelIdType } from "../../models/modelIds";
import { primaryInputOrder, type ChartAxisQuantityId } from "../../models/quantities";
import {
  type ModifierId as ModifierIdType,
} from "../../models/inputModifiers";
import type { FieldChartProfile } from "../../models/output/fieldChartProfile";
import {
  createControlBehaviorContext,
  type BehaviorPatch,
  type ControlBehaviorContext,
} from "../../services/comfort/controls/types";
import { syncDerivedStateForInput } from "../../services/comfort/syncState";
import { comfortModelConfigs, comfortModelOrder, getComfortModelConfig } from "./modelConfigs";
import type { RuntimeComfortModelDefinition } from "./modelConfigs/definition";
import { buildFieldChartProfile } from "./fieldChartState";
import {
  getEffectiveChartBaselineInputId as resolveChartBaselineInputId,
} from "./chartPresentation";
import {
  buildInputModifierControls,
  createInputModifierDraft,
  deriveEffectiveInputsByInput,
} from "./modifierState";
import { normalizeCompareInputIds } from "./shareState";
import type {
  AnalysisStateSlice,
  InputModifierDraftEntry,
  QuantitiesByInputState,
  PendingModelSwitch,
} from "./types";

export interface AnalysisInternals {
  invalidateModel: (
    modelId: ModelIdType,
    options?: { keepErrorMessage?: boolean },
  ) => void;
  invalidateAllModels: (options?: { keepErrorMessage?: boolean }) => void;
  invalidateModelsSupportingModifiers: (modifierIds: readonly ModifierIdType[]) => void;
  getVisibleInputIds: () => InputIdType[];
  getModelContext: (modelId: ModelIdType) => ControlBehaviorContext;
  getActiveModelConfig: () => RuntimeComfortModelDefinition;
  getEffectiveQuantitiesByInput: (modelId?: ModelIdType) => QuantitiesByInputState;
  getInputModifierDraft: () => InputModifierDraftEntry[];
  getInputModifierControls: (
    draft?: readonly InputModifierDraftEntry[],
  ) => ReturnType<typeof buildInputModifierControls>;
  getCurrentSelectedChartInstanceId: () => string;
  getCurrentChartInstance: () => ChartInstanceDeclaration;
  getCurrentModelCache: () => AnalysisStateSlice["ui"]["calculationCacheByModel"][ModelIdType];
  getCurrentOutputSettings: () => AnalysisStateSlice["ui"]["outputSettingsByModel"][ModelIdType];
  getEffectiveChartBaselineInputId: () => InputIdType;
  applyBehaviorPatch: (modelId: ModelIdType, patch: BehaviorPatch) => void;
  getCurrentDynamicAxisPair: () => { xAxis: ChartAxisQuantityId; yAxis: ChartAxisQuantityId };
  getPendingModelSwitch: () => PendingModelSwitch | null;
  getCurrentFieldChartProfile: () => FieldChartProfile;
}

export function createAnalysisInternals(
  state: AnalysisStateSlice,
): AnalysisInternals {
  function invalidateModel(
    modelId: ModelIdType,
    options?: { keepErrorMessage?: boolean },
  ) {
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

  function getModelContext(modelId: ModelIdType): ControlBehaviorContext {
    const modelConfig = getComfortModelConfig(modelId);
    const options = modelConfig.parseOptions(state.ui.modelOptionsByModel[modelId]);
    if (!options) {
      throw new Error(`Invariant violation: invalid options state for ${modelId}.`);
    }
    return createControlBehaviorContext({
      quantitiesByInput: state.quantitiesByInput,
      auxiliaryQuantitiesByInput: state.auxiliaryQuantitiesByInput,
      modelInputs: state.modelInputsByModel[modelId],
      options,
      unitSystem: state.ui.unitSystem,
      visibleInputIds: getVisibleInputIds(),
    });
  }

  function getActiveModelConfig(): RuntimeComfortModelDefinition {
    return getComfortModelConfig(state.ui.selectedModel);
  }

  function getEffectiveQuantitiesByInput(
    modelId: ModelIdType = state.ui.selectedModel,
  ): QuantitiesByInputState {
    return deriveEffectiveInputsByInput(
      state.quantitiesByInput,
      state.activeModifiersByInput,
      state.auxiliaryQuantitiesByInput,
      getComfortModelConfig(modelId).modifiers,
    );
  }

  function getInputModifierDraft() {
    return createInputModifierDraft(
      getActiveModelConfig(),
      state.activeModifiersByInput,
      state.auxiliaryQuantitiesByInput,
      getVisibleInputIds(),
    );
  }

  function getInputModifierControls(
    draft?: readonly InputModifierDraftEntry[],
  ) {
    return buildInputModifierControls({
      config: getActiveModelConfig(),
      quantitiesByInput: state.quantitiesByInput,
      activeModifiersByInput: state.activeModifiersByInput,
      auxiliaryQuantitiesByInput: state.auxiliaryQuantitiesByInput,
      visibleInputIds: getVisibleInputIds(),
      unitSystem: state.ui.unitSystem,
      draft,
    });
  }

  function getCurrentSelectedChartInstanceId() {
    return state.ui.selectedChartInstanceByModel[state.ui.selectedModel];
  }

  function getCurrentChartInstance(): ChartInstanceDeclaration {
    const selectedInstanceId = getCurrentSelectedChartInstanceId();
    const instance = getActiveModelConfig().chartInstances.entries.find(
      ({ instanceId }) => instanceId === selectedInstanceId,
    );
    if (!instance) {
      throw new Error(
        `Invariant violation: model ${state.ui.selectedModel} does not declare chart instance ${selectedInstanceId}.`,
      );
    }
    return instance;
  }

  function getCurrentModelCache() {
    return state.ui.calculationCacheByModel[state.ui.selectedModel];
  }

  function getCurrentOutputSettings() {
    return state.ui.outputSettingsByModel[state.ui.selectedModel];
  }

  function getEffectiveChartBaselineInputId(): InputIdType {
    return resolveChartBaselineInputId(
      getCurrentOutputSettings(),
      state.ui.compareEnabled,
      getVisibleInputIds(),
    );
  }

  function applyBehaviorPatch(modelId: ModelIdType, patch: BehaviorPatch) {
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

    if (patch.quantitiesPatch) {
      for (const inputId of inputOrder) {
        const inputPatch = patch.quantitiesPatch[inputId];
        if (!inputPatch) {
          continue;
        }

        for (const fieldKey of primaryInputOrder) {
          const value = inputPatch[fieldKey];
          if (value !== undefined) {
            state.quantitiesByInput[inputId][fieldKey] = value;
          }
        }
        syncDerivedStateForInput(
          inputId,
          state.quantitiesByInput,
          state.auxiliaryQuantitiesByInput,
        );
      }
    }

    if (patch.modelInputsPatch) {
      const modelInputs = state.modelInputsByModel[modelId];
      for (const [quantityId, value] of Object.entries(patch.modelInputsPatch)) {
        if (value !== undefined) {
          modelInputs[quantityId as keyof typeof modelInputs] = value;
        }
      }
    }
  }

  function getCurrentDynamicAxisPair() {
    const settings = getCurrentOutputSettings();
    return {
      xAxis: settings.xAxis,
      yAxis: settings.yAxis,
    };
  }

  function getPendingModelSwitch(): PendingModelSwitch | null {
    return state.ui.pendingModelSwitch;
  }

  function getCurrentFieldChartProfile(): FieldChartProfile {
    return buildFieldChartProfile(
      getActiveModelConfig(),
      getCurrentOutputSettings(),
      state.ui.activeWorkspace,
    );
  }


  return {
    invalidateModel,
    invalidateAllModels,
    invalidateModelsSupportingModifiers,
    getVisibleInputIds,
    getModelContext,
    getActiveModelConfig,
    getEffectiveQuantitiesByInput,
    getInputModifierDraft,
    getInputModifierControls,
    getCurrentSelectedChartInstanceId,
    getCurrentChartInstance,
    getCurrentModelCache,
    getCurrentOutputSettings,
    getEffectiveChartBaselineInputId,
    applyBehaviorPatch,
    getCurrentDynamicAxisPair,
    getPendingModelSwitch,
    getCurrentFieldChartProfile,
  };
}
