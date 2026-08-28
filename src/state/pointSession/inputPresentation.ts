import type { ModelId as ModelIdType } from "../../catalog/modelIds";
import type {
  InputControlKey as InputControlKeyType,
  InputControlViewModel,
} from "../../catalog/inputControls";
import type { OptionKey as OptionKeyType } from "../../catalog/inputModes";
import type { InputId as InputIdType } from "../../catalog/inputSlots";
import type { UnitSystem as UnitSystemType } from "../../catalog/units";
import type { ControlBehaviorContext } from "../../engines/comfort/controls/types";
import { comfortModelMetaById } from "../modelRegistry";
import type { RuntimeComfortModelDefinition } from "../modelRegistry/definition";
import {
  setInputModifierDraftEnabled,
  updateInputModifierDraftInput,
} from "./modifierState";
import type {
  InputFieldRowViewModel,
  InputModifierControlViewModel,
  InputModifierDraftEntry,
  InputModifiersViewModel,
  InputPanelViewModel,
} from "./types";

export function buildInputControlViewModels(
  config: RuntimeComfortModelDefinition,
  context: ControlBehaviorContext,
): InputControlViewModel[] {
  return config.controls
    .map((control) => control.behavior.buildViewModel(context))
    .filter((control) => !control.hidden);
}

export function clampDisplayValue(
  value: number,
  minValue?: number,
  maxValue?: number,
): number {
  if (minValue !== undefined && value < minValue) {
    return minValue;
  }
  if (maxValue !== undefined && value > maxValue) {
    return maxValue;
  }
  return value;
}

export function normalizeInputFieldDisplayValue(
  control: Pick<InputControlViewModel, "minValue" | "maxValue">,
  rawValue: string,
): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed || !Number.isFinite(Number(trimmed))) {
    return null;
  }
  return String(clampDisplayValue(Number(trimmed), control.minValue, control.maxValue));
}

export interface InputPanelActionCallbacks {
  onSetCompareEnabled: (enabled: boolean) => void;
  onToggleUnitSystem: () => void;
  onToggleCompareInputVisibility: (inputId: InputIdType) => void;
  onActivateInput: (inputId: InputIdType) => void;
  onUpdateInput: (
    inputId: InputIdType,
    controlId: InputControlKeyType,
    rawValue: string,
  ) => void;
  onSetModelOption: (optionKey: OptionKeyType, value: string) => void;
  getInputModifierDraft: () => InputModifierDraftEntry[];
  projectInputModifierDraft: (
    draft: readonly InputModifierDraftEntry[],
  ) => InputModifierControlViewModel[];
  onApplyInputModifierDraft: (
    draft: readonly InputModifierDraftEntry[],
  ) => boolean;
}

interface BuildInputPanelOptions {
  selectedModel: ModelIdType;
  compareEnabled: boolean;
  unitSystem: UnitSystemType;
  activeInputId: InputIdType;
  visibleInputIds: InputIdType[];
  allowedModelIds: readonly ModelIdType[];
  config: RuntimeComfortModelDefinition;
  context: ControlBehaviorContext;
  committedModifierControls: InputModifierControlViewModel[];
  callbacks: InputPanelActionCallbacks;
  onSelectModel: (modelId: ModelIdType) => void;
}

function countActiveModifiers(
  controls: readonly InputModifierControlViewModel[],
  visibleInputIds: readonly InputIdType[],
): number {
  return controls.reduce((count, modifier) => (
    count + visibleInputIds.filter((inputId) => modifier.activeByInput[inputId]).length
  ), 0);
}

function buildFieldRowViewModel(
  control: InputControlViewModel,
  visibleInputIds: InputIdType[],
  activeInputId: InputIdType,
  callbacks: InputPanelActionCallbacks,
): InputFieldRowViewModel {
  return {
    control,
    visibleInputIds,
    activeInputId,
    onActivateInput: callbacks.onActivateInput,
    onCommitValue: (inputId, rawValue) => {
      callbacks.onActivateInput(inputId);
      const normalized = normalizeInputFieldDisplayValue(control, rawValue);
      if (normalized === null) {
        return null;
      }
      callbacks.onUpdateInput(inputId, control.id, normalized);
      return normalized;
    },
    onCommitPreset: (inputId, value) => {
      callbacks.onActivateInput(inputId);
      callbacks.onUpdateInput(
        inputId,
        control.id,
        clampDisplayValue(value, control.minValue, control.maxValue)
          .toFixed(control.presetDecimals),
      );
    },
    onSelectOption: callbacks.onSetModelOption,
  };
}

function buildModifiersViewModel(
  selectedModel: ModelIdType,
  unitSystem: UnitSystemType,
  visibleInputIds: InputIdType[],
  committedModifierControls: InputModifierControlViewModel[],
  callbacks: InputPanelActionCallbacks,
): InputModifiersViewModel | null {
  if (committedModifierControls.length === 0) {
    return null;
  }

  return {
    editorContextKey: [selectedModel, unitSystem, ...visibleInputIds].join(":"),
    visibleInputIds,
    activeCount: countActiveModifiers(committedModifierControls, visibleInputIds),
    availableCount: committedModifierControls.length,
    controls: committedModifierControls,
    getDraft: callbacks.getInputModifierDraft,
    projectDraft: callbacks.projectInputModifierDraft,
    applyDraft: callbacks.onApplyInputModifierDraft,
    setDraftEnabled: setInputModifierDraftEnabled,
    updateDraftInput: (
      draft,
      inputId,
      modifierId,
      quantityId,
      rawValue,
    ) => updateInputModifierDraftInput(
      draft,
      inputId,
      modifierId,
      quantityId,
      rawValue,
      unitSystem,
    ),
  };
}

export function buildInputPanelViewModel({
  selectedModel,
  compareEnabled,
  unitSystem,
  activeInputId,
  visibleInputIds,
  allowedModelIds,
  config,
  context,
  committedModifierControls,
  callbacks,
  onSelectModel,
}: BuildInputPanelOptions): InputPanelViewModel {
  const controls = buildInputControlViewModels(config, context);
  const clothingControl = controls.find((control) => (
    control.showClothingBuilder && control.maxValue !== undefined
  ));

  return {
    tool: {
      selectedModel,
      modelOptions: allowedModelIds.map((modelId) => ({
        name: comfortModelMetaById[modelId].label,
        value: modelId,
        description: comfortModelMetaById[modelId].description,
      })),
      compareEnabled,
      unitSystem,
      onSelectModel,
      onSetCompareEnabled: callbacks.onSetCompareEnabled,
      onToggleUnitSystem: callbacks.onToggleUnitSystem,
    },
    compare: compareEnabled
      ? {
          visibleInputIds,
          onToggle: callbacks.onToggleCompareInputVisibility,
        }
      : null,
    fields: controls.map((control) => buildFieldRowViewModel(
      control,
      visibleInputIds,
      activeInputId,
      callbacks,
    )),
    clothingBuilder: clothingControl && clothingControl.maxValue !== undefined
      ? {
          maxValue: clothingControl.maxValue,
          activeInputId,
          visibleInputIds,
          onSelectInput: callbacks.onActivateInput,
          onApplyClothingValue: (inputId, value) => {
            callbacks.onActivateInput(inputId);
            callbacks.onUpdateInput(
              inputId,
              clothingControl.id,
              clampDisplayValue(
                value,
                clothingControl.minValue,
                clothingControl.maxValue,
              ).toFixed(clothingControl.presetDecimals),
            );
          },
        }
      : null,
    modifiers: buildModifiersViewModel(
      selectedModel,
      unitSystem,
      visibleInputIds,
      committedModifierControls,
      callbacks,
    ),
  };
}
