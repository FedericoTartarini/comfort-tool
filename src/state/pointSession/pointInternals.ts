import {
  InputId,
  inputOrder,
  type InputId as InputIdType,
} from "../../catalog/inputSlots";
import type { ChartInstanceDeclaration } from "../../catalog/chartTypes";
import type { ModelId as ModelIdType } from "../../catalog/modelIds";
import { type PhysicalQuantityId } from "../../catalog/quantities";
import {
  type ModifierId as ModifierIdType,
} from "../../catalog/inputModifiers";
import type { FieldChartProfile } from "../../catalog/fieldChartProfile";
import {
  createControlBehaviorContext,
  type BehaviorPatch,
  type ControlBehaviorContext,
} from "../../engines/comfort/controls/types";
import { syncDerivedStateForInput } from "../../engines/comfort/syncState";
import { applyQuantityPatch } from "../../engines/comfort/quantityStateRouting";
import { comfortModelConfigs, comfortModelOrder, getComfortModelConfig } from "../modelRegistry";
import type { RuntimeComfortModelDefinition } from "../modelRegistry/definition";
import { buildFieldChartProfile } from "./fieldChartState";
import {
  getEffectiveChartBaselineInputId as resolveChartBaselineInputId,
} from "./chartPresentation";
import {
  buildInputModifierControls,
  createInputModifierDraft,
  deriveEffectiveInputsByInput,
} from "./modifierState";
import { normalizeCompareInputIds } from "./compareState";
import type {
  ModelCalculationCacheByModelState,
  PointSessionBuckets,
  InputModifierDraftEntry,
  QuantitiesByInputState,
  PendingModelSwitch,
} from "./types";

export interface PointInternals {
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
  getCurrentModelCache: () => ModelCalculationCacheByModelState[ModelIdType];
  getCurrentOutputSettings: () => PointSessionBuckets["chart"]["outputSettingsByModel"][ModelIdType];
  getEffectiveChartBaselineInputId: () => InputIdType;
  applyBehaviorPatch: (modelId: ModelIdType, patch: BehaviorPatch) => void;
  getCurrentDynamicAxisPair: () => { xAxis: PhysicalQuantityId; yAxis: PhysicalQuantityId };
  getPendingModelSwitch: () => PendingModelSwitch | null;
  getCurrentFieldChartProfile: () => FieldChartProfile;
}

export function createPointInternals(
  session: PointSessionBuckets,
): PointInternals {
  function invalidateModel(
    modelId: ModelIdType,
    options?: { keepErrorMessage?: boolean },
  ) {
    if (!options?.keepErrorMessage) {
      session.output.errorMessage = "";
    }

    const cache = session.calculationCacheByModel[modelId];
    const nextStatus = cache.chartSource ? "stale" : "empty";
    session.calculationCacheByModel = {
      ...session.calculationCacheByModel,
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
    if (!session.input.compareEnabled) {
      return [InputId.Input1];
    }

    return normalizeCompareInputIds(session.input.compareInputIds);
  }

  function getModelContext(modelId: ModelIdType): ControlBehaviorContext {
    const modelConfig = getComfortModelConfig(modelId);
    const options = modelConfig.parseOptions(session.input.modelOptionsByModel[modelId]);
    if (!options) {
      throw new Error(`Invariant violation: invalid options state for ${modelId}.`);
    }
    return createControlBehaviorContext({
      quantitiesByInput: session.input.quantitiesByInput,
      options,
      unitSystem: session.input.unitSystem,
      visibleInputIds: getVisibleInputIds(),
    });
  }

  function getActiveModelConfig(): RuntimeComfortModelDefinition {
    return getComfortModelConfig(session.setting.selectedModel);
  }

  function getEffectiveQuantitiesByInput(
    modelId: ModelIdType = session.setting.selectedModel,
  ): QuantitiesByInputState {
    return deriveEffectiveInputsByInput(
      session.input.quantitiesByInput,
      session.input.activeModifiersByInput,
      getComfortModelConfig(modelId).modifiers,
    );
  }

  function getInputModifierDraft() {
    return createInputModifierDraft(
      getActiveModelConfig(),
      session.input.activeModifiersByInput,
      session.input.quantitiesByInput,
      getVisibleInputIds(),
    );
  }

  function getInputModifierControls(
    draft?: readonly InputModifierDraftEntry[],
  ) {
    return buildInputModifierControls({
      config: getActiveModelConfig(),
      quantitiesByInput: session.input.quantitiesByInput,
      activeModifiersByInput: session.input.activeModifiersByInput,
      visibleInputIds: getVisibleInputIds(),
      unitSystem: session.input.unitSystem,
      draft,
    });
  }

  function getCurrentSelectedChartInstanceId() {
    return session.chart.selectedChartInstanceByModel[session.setting.selectedModel];
  }

  function getCurrentChartInstance(): ChartInstanceDeclaration {
    const selectedInstanceId = getCurrentSelectedChartInstanceId();
    const instance = getActiveModelConfig().chartInstances.entries.find(
      ({ instanceId }) => instanceId === selectedInstanceId,
    );
    if (!instance) {
      throw new Error(
        `Invariant violation: model ${session.setting.selectedModel} does not declare chart instance ${selectedInstanceId}.`,
      );
    }
    return instance;
  }

  function getCurrentModelCache() {
    return session.calculationCacheByModel[session.setting.selectedModel];
  }

  function getCurrentOutputSettings() {
    return session.chart.outputSettingsByModel[session.setting.selectedModel];
  }

  function getEffectiveChartBaselineInputId(): InputIdType {
    return resolveChartBaselineInputId(
      getCurrentOutputSettings(),
      session.input.compareEnabled,
      getVisibleInputIds(),
    );
  }

  function applyBehaviorPatch(modelId: ModelIdType, patch: BehaviorPatch) {
    if (patch.optionsPatch) {
      const options = getComfortModelConfig(modelId).parseOptions({
        ...session.input.modelOptionsByModel[modelId],
        ...patch.optionsPatch,
      });
      if (!options) {
        throw new Error(`Invariant violation: invalid options patch for ${modelId}.`);
      }
      session.input.modelOptionsByModel[modelId] = options;
    }

    if (patch.quantitiesPatch) {
      for (const inputId of inputOrder) {
        const inputPatch = patch.quantitiesPatch[inputId];
        if (!inputPatch) {
          continue;
        }
        applyQuantityPatch(session.input.quantitiesByInput[inputId], inputPatch);
        syncDerivedStateForInput(inputId, session.input.quantitiesByInput);
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
    return session.setting.pendingModelSwitch;
  }

  function getCurrentFieldChartProfile(): FieldChartProfile {
    return buildFieldChartProfile(
      getActiveModelConfig(),
      getCurrentOutputSettings(),
      session.setting.activeSurface,
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
