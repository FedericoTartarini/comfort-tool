import { PhysicalQuantityId, PrimaryQuantityId, getQuantityPresentationMeta, type QuantityPresentationMeta } from "../../../models/quantities";
import type {
  AdvancedOptionMenu,
  AdvancedOptionSection,
  InputControlId as InputControlIdType,
  InputControlViewModel,
  PresetInputOption,
} from "../../../models/inputControls";
import {
  AirSpeedControlMode,
  OptionKey,
  type AirSpeedControlMode as AirSpeedControlModeType,
  type ModelOptionsRecord,
  type OptionKey as OptionKeyType,
} from "../../../models/inputModes";
import type { InputId as InputIdType } from "../../../models/inputSlots";
import {
  airSpeedControlMenuItems,
  type MenuItemDefinition,
} from "../../../models/controlMenuMeta";
import {
  convertQuantityFromSi,
  convertQuantityToSi,
  formatDisplayValue,
} from "../../units";
import {
  BehaviorPatch,
  ControlBehaviorContext,
  InputControlBehavior,
  createSingleInputPatch,
} from "./types";

export type { QuantityPresentationMeta };

export interface PresentationMeta {
  label: string;
  displayUnits: string;
  step: number;
  decimals: number;
  rangeText: string;
  minValue?: number;
  maxValue?: number;
}

export interface NumericControlBehaviorConfig {
  controlId: InputControlIdType;
  fieldKey: PrimaryQuantityId;
  getPresentation?: (
    context: ControlBehaviorContext,
    meta: QuantityPresentationMeta,
  ) => PresentationMeta;
  hidden?: (context: ControlBehaviorContext) => boolean;
  disabled?: (context: ControlBehaviorContext) => boolean;
  getMenu?: (context: ControlBehaviorContext) => AdvancedOptionMenu;
  presetOptions?: readonly PresetInputOption[];
  presetDecimals?: number;
  showClothingBuilder?: boolean;
  getDisplayValue?: (
    context: ControlBehaviorContext,
    inputId: InputIdType,
  ) => number;
  parseInput?: (
    context: ControlBehaviorContext,
    nextValue: number,
  ) => number | null;
  applyInput?: (
    context: ControlBehaviorContext,
    inputId: InputIdType,
    nextValue: number,
  ) => BehaviorPatch | null;
  minValue?: number;
  maxValue?: number;
}

export type OptionChangeHandler = (
  context: ControlBehaviorContext,
  nextValue: string,
) => BehaviorPatch | null;

export function requireOptionValue<Value extends string>(
  options: ModelOptionsRecord,
  optionKey: OptionKeyType,
  values: readonly Value[],
): Value {
  const value = options[optionKey];
  if (typeof value !== "string" || !values.includes(value as Value)) {
    throw new Error(`Invariant violation: invalid option ${optionKey}.`);
  }
  return value as Value;
}

function buildRangeText(
  fieldKey: PrimaryQuantityId,
  minValue: number,
  maxValue: number,
  decimals: number,
  context: ControlBehaviorContext,
): string {
  const minimum = formatDisplayValue(
    convertQuantityFromSi(fieldKey, minValue, context.unitSystem),
    decimals,
  );
  const maximum = formatDisplayValue(
    convertQuantityFromSi(fieldKey, maxValue, context.unitSystem),
    decimals,
  );
  return `From ${minimum} to ${maximum}`;
}

export function buildDefaultPresentation(
  context: ControlBehaviorContext,
  quantityId: PrimaryQuantityId,
  overrides?: { minValue?: number; maxValue?: number },
): PresentationMeta {
  const meta = getQuantityPresentationMeta(quantityId, context.unitSystem);
  const minValue = overrides?.minValue ?? meta.minSi;
  const maxValue = overrides?.maxValue ?? meta.maxSi;
  return {
    label: meta.label,
    displayUnits: meta.displayUnits,
    step: meta.step,
    decimals: meta.decimals,
    rangeText: buildRangeText(
      quantityId,
      minValue,
      maxValue,
      meta.decimals,
      context,
    ),
    minValue: convertQuantityFromSi(quantityId, minValue, context.unitSystem),
    maxValue: convertQuantityFromSi(quantityId, maxValue, context.unitSystem),
  };
}

export function buildAdvancedOptionSection<Value extends string>(
  title: string | undefined,
  optionKey: OptionKeyType,
  activeValue: string,
  items: readonly MenuItemDefinition<Value>[],
): AdvancedOptionSection {
  return {
    title,
    items: items.map((item) => ({
      label: item.label,
      description: item.description,
      value: item.value,
      optionKey,
      active: item.value === activeValue,
    })),
  };
}

export function buildAdvancedOptionMenu(
  title: string,
  sections: AdvancedOptionSection[],
): AdvancedOptionMenu {
  return { title, sections };
}

export function createControlBehavior(
  config: NumericControlBehaviorConfig,
): InputControlBehavior {
  return {
    buildViewModel: (context): InputControlViewModel => {
      const presentationMeta = getQuantityPresentationMeta(
        config.fieldKey,
        context.unitSystem,
      );
      const presentation = config.getPresentation?.(context, presentationMeta)
        ?? buildDefaultPresentation(context, config.fieldKey, {
          minValue: config.minValue,
          maxValue: config.maxValue,
        });
      const getDisplayValue = (inputId: InputIdType) => (
        config.getDisplayValue?.(context, inputId)
        ?? convertQuantityFromSi(
          config.fieldKey,
          context.quantitiesByInput[inputId][config.fieldKey],
          context.unitSystem,
        )
      );
      const numericValuesByInput: InputControlViewModel["numericValuesByInput"] = {};
      const displayValuesByInput: InputControlViewModel["displayValuesByInput"] = {};
      for (const inputId of context.visibleInputIds) {
        const value = getDisplayValue(inputId);
        numericValuesByInput[inputId] = value;
        displayValuesByInput[inputId] = formatDisplayValue(
          value,
          presentation.decimals,
        );
      }

      return {
        id: config.controlId,
        label: presentation.label,
        displayUnits: presentation.displayUnits,
        rangeText: presentation.rangeText,
        minValue: presentation.minValue,
        maxValue: presentation.maxValue,
        hidden: config.hidden?.(context) ?? false,
        disabled: config.disabled?.(context) ?? false,
        editorKind: config.presetOptions?.length ? "preset" : "number",
        step: presentation.step,
        menu: config.getMenu?.(context) ?? null,
        presetOptions: [...(config.presetOptions ?? [])],
        presetDecimals: config.presetDecimals ?? presentation.decimals,
        showClothingBuilder: config.showClothingBuilder ?? false,
        displayValuesByInput,
        numericValuesByInput,
      };
    },
    applyInput: (context, inputId, rawValue) => {
      if (!rawValue.trim()) return null;
      const parsedValue = Number(rawValue);
      if (!Number.isFinite(parsedValue)) return null;
      const nextValue = config.parseInput?.(context, parsedValue)
        ?? convertQuantityToSi(config.fieldKey, parsedValue, context.unitSystem);
      if (nextValue === null || !Number.isFinite(nextValue)) return null;
      return config.applyInput?.(context, inputId, nextValue)
        ?? createSingleInputPatch(inputId, { [config.fieldKey]: nextValue });
    },
  };
}

const airSpeedControlModeValues = Object.values(AirSpeedControlMode);

export function createAirSpeedControlBehavior(
  controlId: InputControlIdType,
  options: { supportsOccupantAirSpeedControl?: boolean } = {},
): InputControlBehavior {
  const supportsOccupantAirSpeedControl = options.supportsOccupantAirSpeedControl ?? true;
  return createControlBehavior({
    controlId,
    fieldKey: PhysicalQuantityId.RelativeAirSpeed,
    getPresentation: (context, meta) => ({
      ...buildDefaultPresentation(context, PhysicalQuantityId.RelativeAirSpeed),
      label: "Relative air speed",
      displayUnits: meta.displayUnits,
    }),
    getMenu: (context) => {
      if (!supportsOccupantAirSpeedControl) return null;
      const mode = requireOptionValue(
        context.options,
        OptionKey.AirSpeedControlMode,
        airSpeedControlModeValues,
      );
      return buildAdvancedOptionMenu("Air speed options", [
        buildAdvancedOptionSection(
          "Occupant control",
          OptionKey.AirSpeedControlMode,
          mode,
          airSpeedControlMenuItems,
        ),
      ]);
    },
  });
}

export function createAirSpeedOptionHandler(): OptionChangeHandler {
  return (context, nextValue) => {
    const nextMode = requireOptionValue(
      { [OptionKey.AirSpeedControlMode]: nextValue },
      OptionKey.AirSpeedControlMode,
      airSpeedControlModeValues,
    );
    const currentMode = requireOptionValue(
      context.options,
      OptionKey.AirSpeedControlMode,
      airSpeedControlModeValues,
    );
    return currentMode === nextMode
      ? null
      : { optionsPatch: { [OptionKey.AirSpeedControlMode]: nextMode } };
  };
}

export type { AirSpeedControlModeType };
