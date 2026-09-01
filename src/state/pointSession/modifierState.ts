import {
  inputModifierCatalogue,
  modifierOrder,
  type InputModifier,
  type ModifierId as ModifierIdType,
} from "../../catalog/inputModifiers";
import { InputId, inputOrder, type InputId as InputIdType } from "../../catalog/inputSlots";
import type { UnitSystem as UnitSystemType } from "../../catalog/units";
import {
  applyInputModifierChain,
  isModifierConfigurationComplete,
  isModifierFieldValueValid,
} from "../../engines/comfort/inputModifiers";
import {
  convertModifierFieldValueFromSi,
  convertModifierFieldValueToSi,
  convertQuantityFromSi,
  formatDisplayValue,
  getModifierFieldDisplayMeta,
  roundToDisplay,
} from "../../engines/units";
import type { RuntimeComfortModelDefinition } from "../modelRegistry/definition";
import {
  collectModifierInputsByModifier,
  collectModifierInputsForModifier,
  setQuantity,
} from "../../engines/comfort/quantityStateRouting";
import {
  getPhysicalQuantityMeta,
  type PhysicalQuantityId as PhysicalQuantityIdType,
} from "../../catalog/quantities";
import { unitLabel } from "../../catalog/units";
import type {
  ActiveModifiersByInputState,
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

function cloneQuantitiesByInput(
  quantitiesByInput: QuantitiesByInputState,
): QuantitiesByInputState {
  return inputOrder.reduce((byInput, inputId) => {
    byInput[inputId] = { ...quantitiesByInput[inputId] };
    return byInput;
  }, {} as QuantitiesByInputState);
}

export function createInputModifierDraft(
  config: RuntimeComfortModelDefinition,
  activeModifiersByInput: ActiveModifiersByInputState,
  quantitiesByInput: QuantitiesByInputState,
  visibleInputIds: readonly InputIdType[],
): InputModifierDraftEntry[] {
  return visibleInputIds.flatMap((inputId) => config.modifiers.map((modifier) => ({
    inputId,
    modifierId: modifier.id,
    enabled: activeModifiersByInput[inputId][modifier.id],
    inputs: collectModifierInputsForModifier(
      quantitiesByInput[inputId],
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
  quantitiesByInput: QuantitiesByInputState,
  draft: readonly InputModifierDraftEntry[],
) {
  const merged = {
    activeModifiersByInput: cloneActiveModifiers(activeModifiersByInput),
    quantitiesByInput: cloneQuantitiesByInput(quantitiesByInput),
  };

  for (const entry of draft) {
    merged.activeModifiersByInput[entry.inputId][entry.modifierId] = entry.enabled;
    const modifier = inputModifierCatalogue[entry.modifierId];
    for (const quantityId of modifier.extraInputs) {
      setQuantity(
        merged.quantitiesByInput[entry.inputId],
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
  modifiers: readonly InputModifier[],
): QuantitiesByInputState {
  const deriveInput = (inputId: InputIdType) => applyInputModifierChain(
    quantitiesByInput[inputId],
    modifiers,
    activeModifiersByInput[inputId],
    collectModifierInputsByModifier(quantitiesByInput[inputId]),
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
  visibleInputIds: InputIdType[];
  unitSystem: UnitSystemType;
  draft?: readonly InputModifierDraftEntry[];
}

export function buildInputModifierControls({
  config,
  quantitiesByInput,
  activeModifiersByInput,
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
        quantitiesByInput,
        draft,
      )
    : { activeModifiersByInput, quantitiesByInput };
  const effectiveInputs = deriveEffectiveInputsByInput(
    projectedState.quantitiesByInput,
    projectedState.activeModifiersByInput,
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
            projectedState.quantitiesByInput[inputId],
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
            const valueSi = projectedState.quantitiesByInput[inputId][quantityId];
            values[inputId] = valueSi === undefined
              ? ""
              : formatDisplayValue(
                  convertModifierFieldValueFromSi(quantityId, valueSi, unitSystem),
                );
            return values;
          }, {} as Record<InputIdType, string>),
        };
      }),
      affectedFields: modifier.affectedFields.map((fieldKey) => {
        const meta = getPhysicalQuantityMeta(fieldKey);
        return {
          key: fieldKey,
          label: `Effective ${meta.label.toLowerCase()}`,
          displayUnits: unitLabel(meta.siUnit, unitSystem),
          displayValuesByInput: visibleInputIds.reduce((values, inputId) => {
            const displayValue = convertQuantityFromSi(
              fieldKey,
              effectiveInputs[inputId][fieldKey] ?? 0,
              unitSystem,
            );
            values[inputId] = formatDisplayValue(displayValue);
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

  const displayValue = roundToDisplay(Number(rawValue));
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
  quantities: QuantitiesByInputState[InputIdType],
): boolean {
  return isModifierConfigurationComplete(
    modifier,
    collectModifierInputsForModifier(quantities, modifier.id),
  );
}
