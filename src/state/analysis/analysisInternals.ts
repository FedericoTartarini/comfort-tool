import {
  InputId,
  inputOrder,
  type InputId as InputIdType,
} from "../../catalog/inputSlots";
import type { ChartInstanceDeclaration } from "../../catalog/chartTypes";
import type { ModelId as ModelIdType } from "../../catalog/modelIds";
import { primaryInputOrder, type ChartAxisQuantityId } from "../../catalog/quantities";
import {
  type ModifierId as ModifierIdType,
} from "../../catalog/inputModifiers";
import type { FieldChartProfile } from "../../catalog/output/fieldChartProfile";
import {
  createControlBehaviorContext,
  type BehaviorPatch,
  type ControlBehaviorContext,
} from "../../engines/comfort/controls/types";
import { syncDerivedStateForInput } from "../../engines/comfort/syncState";
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
  getCurrentModelCache: () => AnalysisStateSlice["output"]["calculationCacheByModel"][ModelIdType];
  getCurrentOutputSettings: () => AnalysisStateSlice["setting"]["outputSettingsByModel"][ModelIdType];
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
      state.output.errorMessage = "";
    }

    const cache = state.output.calculationCacheByModel[modelId];
    const nextStatus = cache.chartSource ? "stale" : "empty";
    state.output.calculationCacheByModel = {
      ...state.output.calculationCacheByModel,
      [modelId]: {
        ...cache,
        status: nextStatus,
      },
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
    if (!state.setting.compareEnabled) {
      return [InputId.Input1];
    }

    return normalizeCompareInputIds(state.setting.compareInputIds);
  }

  function getModelContext(modelId: ModelIdType): ControlBehaviorContext {
    const modelConfig = getComfortModelConfig(modelId);
    const options = modelConfig.parseOptions(state.setting.modelOptionsByModel[modelId]);
    if (!options) {
      throw new Error(`Invariant violation: invalid options state for ${modelId}.`);
    }
    return createControlBehaviorContext({
      quantitiesByInput: state.input.quantitiesByInput,
      auxiliaryQuantitiesByInput: state.input.auxiliaryQuantitiesByInput,
      modelInputs: state.input.modelInputsByModel[modelId],
      options,
      unitSystem: state.setting.unitSystem,
      visibleInputIds: getVisibleInputIds(),
    });
  }

  function getActiveModelConfig(): RuntimeComfortModelDefinition {
    return getComfortModelConfig(state.setting.selectedModel);
  }

  function getEffectiveQuantitiesByInput(
    modelId: ModelIdType = state.setting.selectedModel,
  ): QuantitiesByInputState {
    return deriveEffectiveInputsByInput(
      state.input.quantitiesByInput,
      state.input.activeModifiersByInput,
      state.input.auxiliaryQuantitiesByInput,
      getComfortModelConfig(modelId).modifiers,
    );
  }

  function getInputModifierDraft() {
    return createInputModifierDraft(
      getActiveModelConfig(),
      state.input.activeModifiersByInput,
      state.input.auxiliaryQuantitiesByInput,
      getVisibleInputIds(),
    );
  }

  function getInputModifierControls(
    draft?: readonly InputModifierDraftEntry[],
  ) {
    return buildInputModifierControls({
      config: getActiveModelConfig(),
      quantitiesByInput: state.input.quantitiesByInput,
      activeModifiersByInput: state.input.activeModifiersByInput,
      auxiliaryQuantitiesByInput: state.input.auxiliaryQuantitiesByInput,
      visibleInputIds: getVisibleInputIds(),
      unitSystem: state.setting.unitSystem,
      draft,
    });
  }

  function getCurrentSelectedChartInstanceId() {
    return state.setting.selectedChartInstanceByModel[state.setting.selectedModel];
  }

  function getCurrentChartInstance(): ChartInstanceDeclaration {
    const selectedInstanceId = getCurrentSelectedChartInstanceId();
    const instance = getActiveModelConfig().chartInstances.entries.find(
      ({ instanceId }) => instanceId === selectedInstanceId,
    );
    if (!instance) {
      throw new Error(
        `Invariant violation: model ${state.setting.selectedModel} does not declare chart instance ${selectedInstanceId}.`,
      );
    }
    return instance;
  }

  function getCurrentModelCache() {
    return state.output.calculationCacheByModel[state.setting.selectedModel];
  }

  function getCurrentOutputSettings() {
    return state.setting.outputSettingsByModel[state.setting.selectedModel];
  }

  function getEffectiveChartBaselineInputId(): InputIdType {
    return resolveChartBaselineInputId(
      getCurrentOutputSettings(),
      state.setting.compareEnabled,
      getVisibleInputIds(),
    );
  }

  function applyBehaviorPatch(modelId: ModelIdType, patch: BehaviorPatch) {
    if (patch.optionsPatch) {
      const options = getComfortModelConfig(modelId).parseOptions({
        ...state.setting.modelOptionsByModel[modelId],
        ...patch.optionsPatch,
      });
      if (!options) {
        throw new Error(`Invariant violation: invalid options patch for ${modelId}.`);
      }
      state.setting.modelOptionsByModel[modelId] = options;
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
            state.input.quantitiesByInput[inputId][fieldKey] = value;
          }
        }
        syncDerivedStateForInput(
          inputId,
          state.input.quantitiesByInput,
          state.input.auxiliaryQuantitiesByInput,
        );
      }
    }

    if (patch.modelInputsPatch) {
      const modelInputs = state.input.modelInputsByModel[modelId];
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
    return state.setting.pendingModelSwitch;
  }

  function getCurrentFieldChartProfile(): FieldChartProfile {
    return buildFieldChartProfile(
      getActiveModelConfig(),
      getCurrentOutputSettings(),
      state.setting.activeSurface,
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
