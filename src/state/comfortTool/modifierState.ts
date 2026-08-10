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
}

export function buildInputModifierControls({
  config,
  inputsByInput,
  activeModifiersByInput,
  modifierInputsByInput,
  visibleInputIds,
  unitSystem,
}: ModifierControlsOptions): InputModifierControlViewModel[] {
  const effectiveInputs = deriveEffectiveInputsByInput(
    inputsByInput,
    activeModifiersByInput,
    modifierInputsByInput,
    config.modifiers,
  );

  return config.modifiers.map((modifier) => {
    const modifierId = modifier.id;
    return {
      id: modifierId,
      label: modifier.label,
      description: modifier.description,
      activeByInput: visibleInputIds.reduce((values, inputId) => {
        values[inputId] = activeModifiersByInput[inputId][modifierId];
        return values;
      }, {} as InputModifierControlViewModel["activeByInput"]),
      completeByInput: visibleInputIds.reduce((values, inputId) => {
        values[inputId] = isModifierConfigurationComplete(
          modifier,
          modifierInputsByInput[inputId][modifierId],
        );
        return values;
      }, {} as InputModifierControlViewModel["completeByInput"]),
      extraInputs: modifier.extraInputs.map((fieldKey) => {
        const displayMeta = getModifierFieldDisplayMeta(fieldKey, unitSystem);
        return {
          key: fieldKey,
          ...displayMeta,
          displayValuesByInput: visibleInputIds.reduce((values, inputId) => {
            const valueSi = modifierInputsByInput[inputId][modifierId][fieldKey];
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
  modifier: InputModifier,
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
  modifier: InputModifier,
  values: ModifierInputsByInputState[InputIdType][ModifierIdType],
): boolean {
  return isModifierConfigurationComplete(modifier, values);
}
