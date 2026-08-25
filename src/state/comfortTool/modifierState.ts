import {
  inputModifierCatalogue,
  modifierOrder,
  type InputModifier,
  type ModifierId as ModifierIdType,
} from "../../models/inputModifiers";
import { InputId, inputOrder, type InputId as InputIdType } from "../../models/inputSlots";
import type { UnitSystem as UnitSystemType } from "../../models/units";
import {
  applyInputModifierChain,
  isModifierConfigurationComplete,
  isModifierFieldValueValid,
} from "../../services/comfort/inputModifiers";
import {
  convertModifierFieldValueFromSi,
  convertModifierFieldValueToSi,
  convertQuantityFromSi,
  formatDisplayValue,
  getModifierFieldDisplayMeta,
} from "../../services/units";
import type { RuntimeComfortModelDefinition } from "./modelConfigs/definition";
import {
  collectModifierInputsByModifier,
  collectModifierInputsForModifier,
  setSlotQuantity,
} from "../../services/comfort/quantityStateRouting";
import {
  getQuantityPresentationMeta,
  type PhysicalQuantityId as PhysicalQuantityIdType,
} from "../../models/physicalQuantities";
import type {
  ActiveModifiersByInputState,
  AuxiliaryQuantitiesByInputState,
  InputModifierDraftEntry,
  InputModifierControlViewModel,
  QuantitiesByInputState,
} from "./types";

export function createActiveModifiersByInput(): ActiveModifiersByInputState {
  return inputOrder.reduce((byInput, inputId) => {
    byInput[inputId] = modifierOrder.reduce((byModifier, modifierId) => {
      byModifier[modifierId] = false;
      return byModifier;
    }, {} as Record<ModifierIdType, boolean>);
    return byInput;
  }, {} as ActiveModifiersByInputState);
}

export function findModelModifier(
  config: RuntimeComfortModelDefinition,
  modifierId: ModifierIdType,
): InputModifier | undefined {
  return config.modifiers.find(({ id }) => id === modifierId);
}

function cloneActiveModifiers(
  activeModifiersByInput: ActiveModifiersByInputState,
): ActiveModifiersByInputState {
  return inputOrder.reduce((byInput, inputId) => {
    byInput[inputId] = modifierOrder.reduce((byModifier, modifierId) => {
      byModifier[modifierId] = activeModifiersByInput[inputId][modifierId];
      return byModifier;
    }, {} as Record<ModifierIdType, boolean>);
    return byInput;
  }, {} as ActiveModifiersByInputState);
}

function cloneAuxiliaryQuantities(
  auxiliaryQuantitiesByInput: AuxiliaryQuantitiesByInputState,
): AuxiliaryQuantitiesByInputState {
  return inputOrder.reduce((byInput, inputId) => {
    byInput[inputId] = { ...auxiliaryQuantitiesByInput[inputId] };
    return byInput;
  }, {} as AuxiliaryQuantitiesByInputState);
}

export function createInputModifierDraft(
  config: RuntimeComfortModelDefinition,
  activeModifiersByInput: ActiveModifiersByInputState,
  auxiliaryQuantitiesByInput: AuxiliaryQuantitiesByInputState,
  visibleInputIds: readonly InputIdType[],
): InputModifierDraftEntry[] {
  return visibleInputIds.flatMap((inputId) => config.modifiers.map((modifier) => ({
    inputId,
    modifierId: modifier.id,
    enabled: activeModifiersByInput[inputId][modifier.id],
    inputs: collectModifierInputsForModifier(
      auxiliaryQuantitiesByInput[inputId],
      modifier.id,
    ),
  })));
}

export function isInputModifierDraftValid(
  config: RuntimeComfortModelDefinition,
  visibleInputIds: readonly InputIdType[],
  draft: readonly InputModifierDraftEntry[],
): boolean {
  const expectedEntryCount = visibleInputIds.length * config.modifiers.length;
  if (draft.length !== expectedEntryCount) return false;

  const expectedKeys = new Set(visibleInputIds.flatMap((inputId) => (
    config.modifiers.map(({ id }) => `${inputId}:${id}`)
  )));
  const seenKeys = new Set<string>();

  for (const entry of draft) {
    const modifier = findModelModifier(config, entry.modifierId);
    const entryKey = `${entry.inputId}:${entry.modifierId}`;
    if (
      !modifier
      || !visibleInputIds.includes(entry.inputId)
      || !expectedKeys.has(entryKey)
      || seenKeys.has(entryKey)
      || typeof entry.enabled !== "boolean"
      || !entry.inputs
      || typeof entry.inputs !== "object"
      || Array.isArray(entry.inputs)
    ) {
      return false;
    }

    const inputKeys = Object.keys(entry.inputs) as PhysicalQuantityIdType[];
    if (
      !inputKeys.every((key) => modifier.extraInputs.includes(key))
      || inputKeys.some((key) => entry.inputs[key] === undefined)
    ) {
      return false;
    }

    for (const quantityId of modifier.extraInputs) {
      const value = entry.inputs[quantityId];
      if (value !== undefined && !isModifierFieldValueValid(quantityId, value)) {
        return false;
      }
    }

    if (entry.enabled && !isModifierConfigurationComplete(modifier, entry.inputs)) {
      return false;
    }
    seenKeys.add(entryKey);
  }

  return seenKeys.size === expectedKeys.size;
}

export function mergeInputModifierDraft(
  activeModifiersByInput: ActiveModifiersByInputState,
  auxiliaryQuantitiesByInput: AuxiliaryQuantitiesByInputState,
  draft: readonly InputModifierDraftEntry[],
) {
  const merged = {
    activeModifiersByInput: cloneActiveModifiers(activeModifiersByInput),
    auxiliaryQuantitiesByInput: cloneAuxiliaryQuantities(auxiliaryQuantitiesByInput),
  };

  for (const entry of draft) {
    merged.activeModifiersByInput[entry.inputId][entry.modifierId] = entry.enabled;
    const modifier = inputModifierCatalogue[entry.modifierId];
    for (const quantityId of modifier.extraInputs) {
      setSlotQuantity(
        merged.auxiliaryQuantitiesByInput[entry.inputId],
        quantityId,
        entry.inputs[quantityId],
      );
    }
  }

  return merged;
}

export function updateInputModifierDraftInput(
  draft: readonly InputModifierDraftEntry[],
  inputId: InputIdType,
  modifierId: ModifierIdType,
  quantityId: PhysicalQuantityIdType,
  rawValue: string,
  unitSystem: UnitSystemType,
): InputModifierDraftEntry[] | null {
  const entryIndex = draft.findIndex((entry) => (
    entry.inputId === inputId && entry.modifierId === modifierId
  ));
  if (entryIndex < 0) return null;

  const entry = draft[entryIndex];
  const transition = parseModifierInputTransition(
    inputModifierCatalogue[modifierId],
    quantityId,
    rawValue,
    unitSystem,
    entry.enabled,
  );
  if (!transition.accepted) return null;

  return draft.map((draftEntry, index) => index === entryIndex
    ? {
        ...draftEntry,
        enabled: transition.disableModifier ? false : draftEntry.enabled,
        inputs: transition.valueSi === undefined
          ? Object.fromEntries(
            Object.entries(draftEntry.inputs).filter(([key]) => key !== quantityId),
          )
          : {
              ...draftEntry.inputs,
              [quantityId]: transition.valueSi,
            },
      }
    : draftEntry);
}

export function setInputModifierDraftEnabled(
  draft: readonly InputModifierDraftEntry[],
  inputId: InputIdType,
  modifierId: ModifierIdType,
  enabled: boolean,
): InputModifierDraftEntry[] | null {
  const entryIndex = draft.findIndex((entry) => (
    entry.inputId === inputId && entry.modifierId === modifierId
  ));
  if (entryIndex < 0) return null;

  const entry = draft[entryIndex];
  if (
    enabled
    && !isModifierConfigurationComplete(
      inputModifierCatalogue[modifierId],
      entry.inputs,
    )
  ) {
    return null;
  }

  return draft.map((draftEntry, index) => index === entryIndex
    ? { ...draftEntry, enabled }
    : draftEntry);
}

export function deriveEffectiveInputsByInput(
  quantitiesByInput: QuantitiesByInputState,
  activeModifiersByInput: ActiveModifiersByInputState,
  auxiliaryQuantitiesByInput: AuxiliaryQuantitiesByInputState,
  modifiers: readonly InputModifier[],
): QuantitiesByInputState {
  const deriveInput = (inputId: InputIdType) => applyInputModifierChain(
    quantitiesByInput[inputId],
    modifiers,
    activeModifiersByInput[inputId],
    collectModifierInputsByModifier(auxiliaryQuantitiesByInput[inputId]),
  );
  return {
    [InputId.Input1]: deriveInput(InputId.Input1),
    [InputId.Input2]: deriveInput(InputId.Input2),
    [InputId.Input3]: deriveInput(InputId.Input3),
  };
}

interface ModifierControlsOptions {
  config: RuntimeComfortModelDefinition;
  quantitiesByInput: QuantitiesByInputState;
  activeModifiersByInput: ActiveModifiersByInputState;
  auxiliaryQuantitiesByInput: AuxiliaryQuantitiesByInputState;
  visibleInputIds: InputIdType[];
  unitSystem: UnitSystemType;
  draft?: readonly InputModifierDraftEntry[];
}

export function buildInputModifierControls({
  config,
  quantitiesByInput,
  activeModifiersByInput,
  auxiliaryQuantitiesByInput,
  visibleInputIds,
  unitSystem,
  draft,
}: ModifierControlsOptions): InputModifierControlViewModel[] {
  if (draft && !isInputModifierDraftValid(config, visibleInputIds, draft)) {
    throw new Error("Invariant violation: invalid input modifier draft.");
  }
  const projectedState = draft
    ? mergeInputModifierDraft(
        activeModifiersByInput,
        auxiliaryQuantitiesByInput,
        draft,
      )
    : { activeModifiersByInput, auxiliaryQuantitiesByInput };
  const effectiveInputs = deriveEffectiveInputsByInput(
    quantitiesByInput,
    projectedState.activeModifiersByInput,
    projectedState.auxiliaryQuantitiesByInput,
    config.modifiers,
  );

  return config.modifiers.map((modifier) => {
    const modifierId = modifier.id;
    return {
      id: modifierId,
      label: modifier.label,
      description: modifier.description,
      activeByInput: visibleInputIds.reduce((values, inputId) => {
        values[inputId] = projectedState.activeModifiersByInput[inputId][modifierId];
        return values;
      }, {} as InputModifierControlViewModel["activeByInput"]),
      completeByInput: visibleInputIds.reduce((values, inputId) => {
        values[inputId] = isModifierConfigurationComplete(
          modifier,
          collectModifierInputsForModifier(
            projectedState.auxiliaryQuantitiesByInput[inputId],
            modifierId,
          ),
        );
        return values;
      }, {} as InputModifierControlViewModel["completeByInput"]),
      extraInputs: modifier.extraInputs.map((quantityId) => {
        const displayMeta = getModifierFieldDisplayMeta(quantityId, unitSystem);
        return {
          key: quantityId,
          ...displayMeta,
          displayValuesByInput: visibleInputIds.reduce((values, inputId) => {
            const valueSi = projectedState.auxiliaryQuantitiesByInput[inputId][quantityId];
            values[inputId] = valueSi === undefined
              ? ""
              : formatDisplayValue(
                  convertModifierFieldValueFromSi(quantityId, valueSi, unitSystem),
                  displayMeta.decimals,
                );
            return values;
          }, {} as Record<InputIdType, string>),
        };
      }),
      affectedFields: modifier.affectedFields.map((fieldKey) => {
        const meta = getQuantityPresentationMeta(fieldKey, unitSystem);
        return {
          key: fieldKey,
          label: `Effective ${meta.label.toLowerCase()}`,
          displayUnits: meta.displayUnits,
          displayValuesByInput: visibleInputIds.reduce((values, inputId) => {
            const displayValue = convertQuantityFromSi(
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

export interface ModifierInputTransition {
  accepted: boolean;
  valueSi?: number;
  disableModifier: boolean;
}

export function parseModifierInputTransition(
  modifier: Pick<InputModifier, "extraInputs">,
  quantityId: PhysicalQuantityIdType,
  rawValue: string,
  unitSystem: UnitSystemType,
  wasActive: boolean,
): ModifierInputTransition {
  if (!modifier.extraInputs.includes(quantityId)) {
    return { accepted: false, disableModifier: false };
  }
  if (rawValue.trim() === "") {
    return { accepted: true, valueSi: undefined, disableModifier: wasActive };
  }

  const displayValue = Number(rawValue);
  if (!Number.isFinite(displayValue)) {
    return { accepted: false, disableModifier: false };
  }
  const valueSi = convertModifierFieldValueToSi(quantityId, displayValue, unitSystem);
  return isModifierFieldValueValid(quantityId, valueSi)
    ? { accepted: true, valueSi, disableModifier: false }
    : { accepted: false, disableModifier: false };
}

export function canEnableModifier(
  modifier: Pick<InputModifier, "extraInputs" | "id">,
  auxiliary: AuxiliaryQuantitiesByInputState[InputIdType],
): boolean {
  return isModifierConfigurationComplete(
    modifier,
    collectModifierInputsForModifier(auxiliary, modifier.id),
  );
}
