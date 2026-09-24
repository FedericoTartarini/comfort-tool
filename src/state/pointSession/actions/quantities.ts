import type { ModelId as ModelIdType } from "../../../catalog/modelIds";
import type { InputControlKey as InputControlKeyType } from "../../../catalog/inputControls";
import {
  rangeSiForModifierInput,
  type ModifierId as ModifierIdType,
} from "../../../catalog/inputModifiers";
import { inputOrder, type InputId as InputIdType } from "../../../catalog/inputSlots";
import { phsPersonQuantityIds, phsPersonRangeSi } from "../../../catalog/phs";
import {
  isValueInQuantityRange,
  type PhysicalQuantityId as PhysicalQuantityIdType,
  type QuantityRangeSi,
} from "../../../catalog/quantities";
import { syncDerivedStateForInput } from "../../../engines/comfort/syncState";
import {
  collectModifierInputsForModifier,
  isWritableQuantityId,
  setQuantity,
} from "../../../engines/comfort/quantityStateRouting";
import {
  declaredSiRangeForInputField,
  primaryQuantityIdsForInputField,
} from "../../../engines/comfort/controls/fieldInputBehaviors";
import { getComfortModelConfig } from "../../modelRegistry";
import {
  canEnableModifier,
  findModelModifier,
  isInputModifierDraftValid,
  parseModifierInputTransition,
} from "../modifierState";
import type { PointActions, InputModifierDraftEntry } from "../sessionTypes";
import type { PointActionContext } from "./context";

function writeRangeForQuantity(
  modelId: ModelIdType,
  quantityId: PhysicalQuantityIdType,
): QuantityRangeSi | undefined {
  const model = getComfortModelConfig(modelId);
  for (const spec of model.inputFields) {
    if (primaryQuantityIdsForInputField(spec).includes(quantityId)) {
      const { minSi, maxSi } = declaredSiRangeForInputField(spec, quantityId);
      return { min: minSi, max: maxSi };
    }
  }
  if (phsPersonQuantityIds.includes(quantityId as typeof phsPersonQuantityIds[number])) {
    return phsPersonRangeSi[quantityId as typeof phsPersonQuantityIds[number]];
  }
  const modifierInputRange = rangeSiForModifierInput(quantityId);
  if (modifierInputRange) {
    return modifierInputRange;
  }
  return undefined;
}

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
  function writeQuantity(
    inputId: InputIdType,
    quantityId: PhysicalQuantityIdType,
    valueSi: number,
  ): boolean {
    const range = writeRangeForQuantity(session.setting.selectedModel, quantityId);
    if (
      !isWritableQuantityId(quantityId)
      || range === undefined
      || !isValueInQuantityRange(valueSi, range)
    ) {
      return false;
    }

    setQuantity(session.input.quantitiesByInput[inputId], quantityId, valueSi);
    syncDerivedStateForInput(inputId, session.input.quantitiesByInput);
    return true;
  }

  function updateBuiltinQuantity(
    inputId: InputIdType,
    quantityId: PhysicalQuantityIdType,
    valueSi: number,
  ): boolean {
    if (!writeQuantity(inputId, quantityId, valueSi)) {
      return false;
    }
    internals.invalidateAllModels();
    scheduleCalculation();
    return true;
  }

  function updateModelQuantity(
    _modelId: ModelIdType,
    quantityId: PhysicalQuantityIdType,
    valueSi: number,
  ): boolean {
    let wrote = false;
    for (const inputId of inputOrder) {
      if (writeQuantity(inputId, quantityId, valueSi)) {
        wrote = true;
      }
    }
    if (!wrote) {
      return false;
    }
    internals.invalidateAllModels();
    scheduleCalculation();
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

    const quantities = session.input.quantitiesByInput[inputId];
    const wasActive = session.input.activeModifiersByInput[inputId][modifierId];
    const transition = parseModifierInputTransition(
      modifier,
      quantityId,
      rawValue,
      session.input.unitSystem,
      wasActive,
    );
    if (!transition.accepted) return false;

    setQuantity(quantities, quantityId, transition.valueSi);
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
        session.input.quantitiesByInput[inputId],
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
        session.input.quantitiesByInput[entry.inputId],
        entry.modifierId,
      );
      const inputsChanged = modifier.modifierInputs.some((quantityId) => (
        currentInputs[quantityId] !== entry.inputs[quantityId]
      ));
      if (wasEnabled !== entry.enabled || (inputsChanged && (wasEnabled || entry.enabled))) {
        modifiersWithEffectiveChanges.add(entry.modifierId);
      }
    }

    for (const entry of draft) {
      session.input.activeModifiersByInput[entry.inputId][entry.modifierId] = entry.enabled;
      for (const quantityId of config.modifiers
        .find(({ id }) => id === entry.modifierId)?.modifierInputs ?? []) {
        setQuantity(
          session.input.quantitiesByInput[entry.inputId],
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
