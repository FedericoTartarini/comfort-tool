import type { ModelId as ModelIdType } from "../../../catalog/modelIds";
import type { InputControlKey as InputControlKeyType } from "../../../catalog/inputControls";
import {
  type ModifierId as ModifierIdType,
} from "../../../catalog/inputModifiers";
import { type InputId as InputIdType } from "../../../catalog/inputSlots";
import { syncDerivedStateForInput } from "../../../engines/comfort/syncState";
import { getComfortModelConfig } from "../../modelRegistry";
import {
  applyPrimaryPatch,
  collectModifierInputsForModifier,
  setModelQuantity,
  setSlotQuantity,
} from "../../../engines/comfort/quantityStateRouting";
import {
  canEnableModifier,
  findModelModifier,
  isInputModifierDraftValid,
  parseModifierInputTransition,
} from "../modifierState";
import { getPhysicalQuantityMeta, isPrimaryQuantityId, type PhysicalQuantityId as PhysicalQuantityIdType } from "../../../catalog/quantities";
import { isAllowedExtraQuantityId, isSlotQuantityId } from "../../../engines/comfort/quantityStateRouting";
import type { PointActions, InputModifierDraftEntry } from "../sessionTypes";
import type { PointActionContext } from "./context";

export function createQuantityActions({
  session,
  internals,
  scheduleCalculation,
}: PointActionContext): Pick<
  PointActions,
  | "updateInput"
  | "updateBuiltinQuantity"
  | "updateModelQuantity"
  | "updateModifierInput"
  | "setModifierEnabled"
  | "applyInputModifierDraft"
> {
  function updateBuiltinQuantity(
    inputId: InputIdType,
    quantityId: PhysicalQuantityIdType,
    valueSi: number,
  ): boolean {
    const meta = getPhysicalQuantityMeta(quantityId);
    if (!Number.isFinite(valueSi) || valueSi < meta.minSi || valueSi > meta.maxSi) {
      return false;
    }

    if (isPrimaryQuantityId(quantityId)) {
      applyPrimaryPatch(session.input.quantitiesByInput, inputId, { [quantityId]: valueSi });
      syncDerivedStateForInput(
        inputId,
        session.input.quantitiesByInput,
        session.input.auxiliaryQuantitiesByInput,
      );
    } else if (isSlotQuantityId(quantityId)) {
      setSlotQuantity(session.input.auxiliaryQuantitiesByInput[inputId], quantityId, valueSi);
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
      !isAllowedExtraQuantityId(quantityId)
      || !getComfortModelConfig(modelId).extraQuantities.some((id) => id === quantityId)
      || !Number.isFinite(valueSi)
      || valueSi < meta.minSi
      || valueSi > meta.maxSi
    ) {
      return false;
    }

    setModelQuantity(session.input.modelInputsByModel[modelId], quantityId, valueSi);
    if (session.setting.selectedModel === modelId) {
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
      internals.getModelContext(session.setting.selectedModel),
      inputId,
      rawValue,
    );
    if (!patch) {
      return;
    }

    internals.applyBehaviorPatch(session.setting.selectedModel, patch);

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

    const auxiliary = session.input.auxiliaryQuantitiesByInput[inputId];
    const wasActive = session.input.activeModifiersByInput[inputId][modifierId];
    const transition = parseModifierInputTransition(
      modifier,
      quantityId,
      rawValue,
      session.setting.unitSystem,
      wasActive,
    );
    if (!transition.accepted) return false;

    setSlotQuantity(auxiliary, quantityId, transition.valueSi);
    if (transition.disableModifier) {
      session.input.activeModifiersByInput[inputId][modifierId] = false;
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
    const currentEnabled = session.input.activeModifiersByInput[inputId][modifierId];
    if (currentEnabled === enabled) return true;
    if (
      enabled
      && !canEnableModifier(
        modifier,
        session.input.auxiliaryQuantitiesByInput[inputId],
      )
    ) {
      return false;
    }

    session.input.activeModifiersByInput[inputId][modifierId] = enabled;
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

      const wasEnabled = session.input.activeModifiersByInput[entry.inputId][entry.modifierId];
      const currentInputs = collectModifierInputsForModifier(
        session.input.auxiliaryQuantitiesByInput[entry.inputId],
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
      session.input.activeModifiersByInput[entry.inputId][entry.modifierId] = entry.enabled;
      for (const quantityId of config.modifiers
        .find(({ id }) => id === entry.modifierId)?.extraInputs ?? []) {
        setSlotQuantity(
          session.input.auxiliaryQuantitiesByInput[entry.inputId],
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
    updateInput,
    updateBuiltinQuantity,
    updateModelQuantity,
    updateModifierInput,
    setModifierEnabled,
    applyInputModifierDraft,
  };
}
