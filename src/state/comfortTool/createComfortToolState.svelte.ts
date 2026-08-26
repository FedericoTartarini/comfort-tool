import { InputId } from "../../models/inputSlots";
import { ModelId } from "../../models/comfortModels";
import { UnitSystem } from "../../models/units";
import { syncDerivedStateIntoAuxiliary } from "../../services/comfort/syncState";
import {
  createAuxiliaryQuantitiesByInput,
  createDefaultCompareInputIds,
  createCalculationCacheByModel,
  createOutputSettingsByModel,
  createModelInputsByModel,
  createModelOptionsByModel,
  createQuantitiesByInput,
  createSelectedChartInstanceByModel,
  defaultActiveWorkspace,
} from "./initialComfortToolState";
import {
  createActiveModifiersByInput,
} from "./modifierState";
import { createCalculationManager } from "./calculationManager.svelte";
import { createComfortToolActions } from "./comfortToolActions";
import { createComfortToolInternals } from "./comfortToolInternals";
import { createComfortToolSelectors } from "./comfortToolSelectors";
import type { ComfortToolController, ComfortToolStateSlice } from "./types";

export function createComfortToolState(): ComfortToolController {
  const quantitiesByInput = $state(createQuantitiesByInput());
  const auxiliaryQuantitiesByInput = $state(createAuxiliaryQuantitiesByInput());
  const modelInputsByModel = $state(createModelInputsByModel());
  syncDerivedStateIntoAuxiliary(quantitiesByInput, auxiliaryQuantitiesByInput);
  const activeModifiersByInput = $state(createActiveModifiersByInput());
  const ui = $state({
    selectedModel: ModelId.PmvAshrae,
    selectedChartInstanceByModel: createSelectedChartInstanceByModel(),
    modelOptionsByModel: createModelOptionsByModel(),
    compareEnabled: false,
    compareInputIds: createDefaultCompareInputIds(),
    activeInputId: InputId.Input1,
    unitSystem: UnitSystem.SI,
    activeWorkspace: defaultActiveWorkspace,
    outputSettingsByModel: createOutputSettingsByModel(),
    isLoading: false,
    errorMessage: "",
    calculationCacheByModel: createCalculationCacheByModel(),
    pendingModelSwitch: null,
  });

  const state: ComfortToolStateSlice = {
    quantitiesByInput,
    auxiliaryQuantitiesByInput,
    modelInputsByModel,
    activeModifiersByInput,
    ui,
  };

  const internals = createComfortToolInternals(state);

  const { scheduleCalculation: scheduleCalculationInternal } = createCalculationManager(
    state,
    internals.getVisibleInputIds,
    internals.getEffectiveQuantitiesByInput,
  );

  const actions = createComfortToolActions(
    state,
    internals,
    scheduleCalculationInternal,
  );

  const selectors = createComfortToolSelectors(state, internals, {
    onSelectBaseline: actions.setChartBaselineInputId,
    onSelectXAxis: actions.setDynamicXAxis,
    onSelectYAxis: actions.setDynamicYAxis,
    onSelectOutput: actions.setExploreOutput,
    onApplyBands: actions.setExploreBands,
  }, {
    onSetCompareEnabled: actions.setCompareEnabled,
    onToggleUnitSystem: actions.toggleUnitSystem,
    onToggleCompareInputVisibility: actions.toggleCompareInputVisibility,
    onActivateInput: actions.setActiveInputId,
    onUpdateInput: actions.updateInput,
    onSetModelOption: actions.setModelOption,
    getInputModifierDraft: internals.getInputModifierDraft,
    projectInputModifierDraft: internals.getInputModifierControls,
    onApplyInputModifierDraft: actions.applyInputModifierDraft,
  });

  return {
    state,
    actions,
    selectors,
  };
}
