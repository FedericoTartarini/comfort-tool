import { PhysicalQuantityId, getPhysicalQuantityMeta } from "../../../catalog/quantities";
import { unitLabel } from "../../../catalog/units";
import type {
  AdvancedOptionMenu,
  AdvancedOptionSection,
  InputControlId as InputControlIdType,
  InputControlViewModel,
  PresetInputOption,
} from "../../../catalog/inputControls";
import {
  AirSpeedControlMode,
  OptionKey,
  type AirSpeedControlMode as AirSpeedControlModeType,
  type ModelOptionsRecord,
  type OptionKey as OptionKeyType,
} from "../../../catalog/inputModes";
import type { InputId as InputIdType } from "../../../catalog/inputSlots";
import {
  airSpeedControlMenuItems,
  type MenuItemDefinition,
} from "../../../catalog/controlMenuMeta";
import {
  convertQuantityFromSi,
  convertQuantityToSi,
  formatDisplayValue,
  roundToDisplay,
} from "../../units";
import {
  BehaviorPatch,
  ControlBehaviorContext,
  InputControlBehavior,
  createSingleInputPatch,
} from "./types";

export interface CatalogFieldPresentation {
  label: string;
  displayUnits: string;
  step: number;
}

export interface PresentationMeta {
  label: string;
  displayUnits: string;
  step: number;
  rangeText: string;
  minValue?: number;
  maxValue?: number;
}

export interface NumericControlBehaviorConfig {
  controlId: InputControlIdType;
  fieldKey: PhysicalQuantityId;
  getPresentation?: (
    context: ControlBehaviorContext,
    meta: CatalogFieldPresentation,
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
  fieldKey: PhysicalQuantityId,
  minValue: number,
  maxValue: number,
  context: ControlBehaviorContext,
): string {
  const minimum = formatDisplayValue(
    convertQuantityFromSi(fieldKey, minValue, context.unitSystem),
  );
  const maximum = formatDisplayValue(
    convertQuantityFromSi(fieldKey, maxValue, context.unitSystem),
  );
  return `From ${minimum} to ${maximum}`;
}

export function buildDefaultPresentation(
  context: ControlBehaviorContext,
  quantityId: PhysicalQuantityId,
  rangeSi: { minValue: number; maxValue: number },
): PresentationMeta {
  const meta = getPhysicalQuantityMeta(quantityId);
  return {
    label: meta.label,
    displayUnits: unitLabel(meta.siUnit, context.unitSystem),
    step: meta.step,
    rangeText: buildRangeText(
      quantityId,
      rangeSi.minValue,
      rangeSi.maxValue,
      context,
    ),
    minValue: convertQuantityFromSi(quantityId, rangeSi.minValue, context.unitSystem),
    maxValue: convertQuantityFromSi(quantityId, rangeSi.maxValue, context.unitSystem),
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
  const resolveDisplayValue = (
    context: ControlBehaviorContext,
    inputId: InputIdType,
  ) => (
    config.getDisplayValue?.(context, inputId)
    ?? convertQuantityFromSi(
      config.fieldKey,
      context.quantitiesByInput[inputId][config.fieldKey] ?? 0,
      context.unitSystem,
    )
  );
  return {
    buildViewModel: (context): InputControlViewModel => {
      const catalog = getPhysicalQuantityMeta(config.fieldKey);
      const presentationMeta: CatalogFieldPresentation = {
        label: catalog.label,
        displayUnits: unitLabel(catalog.siUnit, context.unitSystem),
        step: catalog.step,
      };
      if (config.minValue === undefined || config.maxValue === undefined) {
        throw new Error(
          `Numeric control ${config.controlId} must declare SI minValue and maxValue.`,
        );
      }
      const presentation = config.getPresentation?.(context, presentationMeta)
        ?? buildDefaultPresentation(context, config.fieldKey, {
          minValue: config.minValue,
          maxValue: config.maxValue,
        });
      const numericValuesByInput: InputControlViewModel["numericValuesByInput"] = {};
      const displayValuesByInput: InputControlViewModel["displayValuesByInput"] = {};
      for (const inputId of context.visibleInputIds) {
        const value = resolveDisplayValue(context, inputId);
        numericValuesByInput[inputId] = value;
        displayValuesByInput[inputId] = formatDisplayValue(value);
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
        presetDecimals: config.presetDecimals ?? 2,
        showClothingBuilder: config.showClothingBuilder ?? false,
        displayValuesByInput,
        numericValuesByInput,
      };
    },
    applyInput: (context, inputId, rawValue) => {
      if (!rawValue.trim()) return null;
      const parsedValue = Number(rawValue);
      if (!Number.isFinite(parsedValue)) return null;
      const currentDisplay = formatDisplayValue(resolveDisplayValue(context, inputId));
      if (rawValue.trim() === currentDisplay) return null;
      const displayValue = roundToDisplay(parsedValue);
      if (formatDisplayValue(displayValue) === currentDisplay) return null;
      const nextValue = config.parseInput?.(context, displayValue)
        ?? convertQuantityToSi(config.fieldKey, displayValue, context.unitSystem);
      if (nextValue === null || !Number.isFinite(nextValue)) return null;
      return config.applyInput?.(context, inputId, nextValue)
        ?? createSingleInputPatch(inputId, { [config.fieldKey]: nextValue });
    },
  };
}

const airSpeedControlModeValues = Object.values(AirSpeedControlMode);

export function createAirSpeedControlBehavior(
  controlId: InputControlIdType,
  options: {
    supportsOccupantAirSpeedControl?: boolean;
    minValue: number;
    maxValue: number;
  },
): InputControlBehavior {
  const supportsOccupantAirSpeedControl = options.supportsOccupantAirSpeedControl ?? true;
  return createControlBehavior({
    controlId,
    fieldKey: PhysicalQuantityId.RelativeAirSpeed,
    minValue: options.minValue,
    maxValue: options.maxValue,
    getPresentation: (context, meta) => ({
      ...buildDefaultPresentation(context, PhysicalQuantityId.RelativeAirSpeed, {
        minValue: options.minValue,
        maxValue: options.maxValue,
      }),
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
