import { fieldMetaByKey } from "../../models/inputFieldsMeta";
import {
  inputModifierCatalogue,
  modifierOrder,
  type InputModifier,
  type ModifierFieldKey as ModifierFieldKeyType,
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
  convertFieldValueFromSi,
  convertModifierFieldValueFromSi,
  convertModifierFieldValueToSi,
  formatDisplayValue,
  getModifierFieldDisplayMeta,
} from "../../services/units";
import type { RuntimeComfortModelDefinition } from "./modelConfigs/definition";
import type {
  ActiveModifiersByInputState,
  InputModifierDraftEntry,
  InputModifierControlViewModel,
  InputsByInputState,
  ModifierInputsByInputState,
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

export function createModifierInputsByInput(): ModifierInputsByInputState {
  return inputOrder.reduce((byInput, inputId) => {
    byInput[inputId] = modifierOrder.reduce((byModifier, modifierId) => {
      byModifier[modifierId] = inputModifierCatalogue[modifierId].extraInputs.reduce(
        (values, fieldKey) => {
          values[fieldKey] = null;
          return values;
        },
        {} as ModifierInputsByInputState[typeof inputId][typeof modifierId],
      );
      return byModifier;
    }, {} as ModifierInputsByInputState[typeof inputId]);
    return byInput;
  }, {} as ModifierInputsByInputState);
}

export function findModelModifier(
  config: RuntimeComfortModelDefinition,
  modifierId: ModifierIdType,
): InputModifier | undefined {
  return config.modifiers.find(({ id }) => id === modifierId);
}

function cloneModifierState(
  activeModifiersByInput: ActiveModifiersByInputState,
  modifierInputsByInput: ModifierInputsByInputState,
): {
  activeModifiersByInput: ActiveModifiersByInputState;
  modifierInputsByInput: ModifierInputsByInputState;
} {
  return {
    activeModifiersByInput: inputOrder.reduce((byInput, inputId) => {
      byInput[inputId] = modifierOrder.reduce((byModifier, modifierId) => {
        byModifier[modifierId] = activeModifiersByInput[inputId][modifierId];
        return byModifier;
      }, {} as Record<ModifierIdType, boolean>);
      return byInput;
    }, {} as ActiveModifiersByInputState),
    modifierInputsByInput: inputOrder.reduce((byInput, inputId) => {
      byInput[inputId] = modifierOrder.reduce((byModifier, modifierId) => {
        byModifier[modifierId] = {
          ...modifierInputsByInput[inputId][modifierId],
        };
        return byModifier;
      }, {} as ModifierInputsByInputState[typeof inputId]);
      return byInput;
    }, {} as ModifierInputsByInputState),
  };
}

export function createInputModifierDraft(
  config: RuntimeComfortModelDefinition,
  activeModifiersByInput: ActiveModifiersByInputState,
  modifierInputsByInput: ModifierInputsByInputState,
  visibleInputIds: readonly InputIdType[],
): InputModifierDraftEntry[] {
  return visibleInputIds.flatMap((inputId) => config.modifiers.map((modifier) => ({
    inputId,
    modifierId: modifier.id,
    enabled: activeModifiersByInput[inputId][modifier.id],
    inputs: modifier.extraInputs.reduce((values, fieldKey) => {
      values[fieldKey] = modifierInputsByInput[inputId][modifier.id][fieldKey] ?? null;
      return values;
    }, {} as InputModifierDraftEntry["inputs"]),
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

    const inputKeys = Object.keys(entry.inputs);
    if (
      inputKeys.length !== modifier.extraInputs.length
      || !modifier.extraInputs.every((fieldKey) => inputKeys.includes(fieldKey))
    ) {
      return false;
    }

    for (const fieldKey of modifier.extraInputs) {
      const value = entry.inputs[fieldKey];
      if (value !== null && !isModifierFieldValueValid(fieldKey, value)) {
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
  modifierInputsByInput: ModifierInputsByInputState,
  draft: readonly InputModifierDraftEntry[],
) {
  const merged = cloneModifierState(
    activeModifiersByInput,
    modifierInputsByInput,
  );

  for (const entry of draft) {
    merged.activeModifiersByInput[entry.inputId][entry.modifierId] = entry.enabled;
    merged.modifierInputsByInput[entry.inputId][entry.modifierId] = {
      ...entry.inputs,
    };
  }

  return merged;
}

export function updateInputModifierDraftInput(
  draft: readonly InputModifierDraftEntry[],
  inputId: InputIdType,
  modifierId: ModifierIdType,
  fieldKey: ModifierFieldKeyType,
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
    fieldKey,
    rawValue,
    unitSystem,
    entry.enabled,
  );
  if (!transition.accepted) return null;

  return draft.map((draftEntry, index) => index === entryIndex
    ? {
        ...draftEntry,
        enabled: transition.disableModifier ? false : draftEntry.enabled,
        inputs: {
          ...draftEntry.inputs,
          [fieldKey]: transition.valueSi ?? null,
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
  inputsByInput: InputsByInputState,
  activeModifiersByInput: ActiveModifiersByInputState,
  modifierInputsByInput: ModifierInputsByInputState,
  modifiers: readonly InputModifier[],
): InputsByInputState {
  const deriveInput = (inputId: InputIdType) => applyInputModifierChain(
    inputsByInput[inputId],
    modifiers,
    activeModifiersByInput[inputId],
    modifierInputsByInput[inputId],
  );
  return {
    [InputId.Input1]: deriveInput(InputId.Input1),
    [InputId.Input2]: deriveInput(InputId.Input2),
    [InputId.Input3]: deriveInput(InputId.Input3),
  };
}

interface ModifierControlsOptions {
  config: RuntimeComfortModelDefinition;
  inputsByInput: InputsByInputState;
  activeModifiersByInput: ActiveModifiersByInputState;
  modifierInputsByInput: ModifierInputsByInputState;
  visibleInputIds: InputIdType[];
  unitSystem: UnitSystemType;
  draft?: readonly InputModifierDraftEntry[];
}

export function buildInputModifierControls({
  config,
  inputsByInput,
  activeModifiersByInput,
  modifierInputsByInput,
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
        modifierInputsByInput,
        draft,
      )
    : { activeModifiersByInput, modifierInputsByInput };
  const effectiveInputs = deriveEffectiveInputsByInput(
    inputsByInput,
    projectedState.activeModifiersByInput,
    projectedState.modifierInputsByInput,
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
          projectedState.modifierInputsByInput[inputId][modifierId],
        );
        return values;
      }, {} as InputModifierControlViewModel["completeByInput"]),
      extraInputs: modifier.extraInputs.map((fieldKey) => {
        const displayMeta = getModifierFieldDisplayMeta(fieldKey, unitSystem);
        return {
          key: fieldKey,
          ...displayMeta,
          displayValuesByInput: visibleInputIds.reduce((values, inputId) => {
            const valueSi = projectedState
              .modifierInputsByInput[inputId][modifierId][fieldKey];
            values[inputId] = valueSi == null
              ? ""
              : formatDisplayValue(
                  convertModifierFieldValueFromSi(fieldKey, valueSi, unitSystem),
                  displayMeta.decimals,
                );
            return values;
          }, {} as Record<InputIdType, string>),
        };
      }),
      affectedFields: modifier.affectedFields.map((fieldKey) => {
        const meta = fieldMetaByKey[fieldKey];
        return {
          key: fieldKey,
          label: `Effective ${meta.label.toLowerCase()}`,
          displayUnits: meta.displayUnits[unitSystem],
          displayValuesByInput: visibleInputIds.reduce((values, inputId) => {
            const displayValue = convertFieldValueFromSi(
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
  valueSi?: number | null;
  disableModifier: boolean;
}

export function parseModifierInputTransition(
  modifier: Pick<InputModifier, "extraInputs">,
  fieldKey: ModifierFieldKeyType,
  rawValue: string,
  unitSystem: UnitSystemType,
  wasActive: boolean,
): ModifierInputTransition {
  if (!modifier.extraInputs.includes(fieldKey)) {
    return { accepted: false, disableModifier: false };
  }
  if (rawValue.trim() === "") {
    return { accepted: true, valueSi: null, disableModifier: wasActive };
  }

  const displayValue = Number(rawValue);
  if (!Number.isFinite(displayValue)) {
    return { accepted: false, disableModifier: false };
  }
  const valueSi = convertModifierFieldValueToSi(fieldKey, displayValue, unitSystem);
  return isModifierFieldValueValid(fieldKey, valueSi)
    ? { accepted: true, valueSi, disableModifier: false }
    : { accepted: false, disableModifier: false };
}

export function canEnableModifier(
  modifier: Pick<InputModifier, "extraInputs">,
  values: ModifierInputsByInputState[InputIdType][ModifierIdType],
): boolean {
  return isModifierConfigurationComplete(modifier, values);
}
