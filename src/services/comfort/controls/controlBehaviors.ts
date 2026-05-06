/**
 * Input Control Behaviors
 * 
 * Defines the logic and interaction patterns for sidebar input controls. 
 * Orchestrates field value synchronization, unit conversions, and the management 
 * of advanced option menus for complex comfort model parameters.
 */
import { ChartId } from "../../../models/chartOptions";
import {
  DerivedInputId,
  FieldKey,
  type FieldKey as FieldKeyType,
} from "../../../models/fieldKeys";
import { fieldMetaByKey, type FieldMeta } from "../../../models/inputFieldsMeta";
import type {
  AdvancedOptionMenu,
  AdvancedOptionSection,
  InputControlId as InputControlIdType,
  InputControlViewModel,
  PresetInputOption,
} from "../../../models/inputControls";
import {
  AirSpeedControlMode,
  AirSpeedInputMode,
  HumidityInputMode,
  OptionKey,
  TemperatureMode,
  type AirSpeedControlMode as AirSpeedControlModeType,
  type AirSpeedInputMode as AirSpeedInputModeType,
  type HumidityInputMode as HumidityInputModeType,
  type TemperatureMode as TemperatureModeType,
} from "../../../models/inputModes";
import { inputOrder, type InputId as InputIdType } from "../../../models/inputSlots";
import {
  airSpeedControlMenuItems,
  airSpeedInputMenuItems,
  humidityMenuItems,
  temperatureMenuItems,
  type MenuItemDefinition,
} from "../../../models/controlMenuMeta";
import {
  convertFieldValueFromSi,
  convertFieldValueToSi,
  convertHumidityRatioFromSi,
  convertHumidityRatioToSi,
  convertVaporPressureFromSi,
  convertVaporPressureToSi,
  formatDisplayValue,
  getHumidityRatioDisplayMeta,
  getVaporPressureDisplayMeta,
} from "../../units";
import {
  applyOperativeTemperatureControlMode,
  normalizeControlOptions,
  synchronizeControlInputState,
} from "../syncState";
import type { BehaviorPatch, ControlBehaviorContext, InputControlBehavior } from "./types";
import { createSingleInputPatch } from "./types";

/**
 * Type for the presentation meta data, used to build the presentation of the control.
 * Contains information about the units, step, decimals, range, and min/max values of a control.
 */
type PresentationMeta = {
  label: string;
  displayUnits: string;
  step: number;
  decimals: number;
  rangeText: string;
  minValue?: number;
  maxValue?: number;
};

/**
 * Type for the control behavior config. Used to define the behavior of a control (e.g. how units are displayed).
 */
type ControlBehaviorConfig = {
  controlId: InputControlIdType;
  fieldKey: FieldKeyType;
  /**
   * Gets the presentation of the control.
   * @param context - The context of the control behavior.
   * @param meta - The metadata of the field key.
   * @returns The presentation of the control.
   */
  getPresentation?: (context: ControlBehaviorContext, meta: FieldMeta) => PresentationMeta;
  /**
   * Determines if the control should be hidden.
   * @param context - The context of the control behavior.
   * @returns Whether the control should be hidden.
   */
  hidden?: (context: ControlBehaviorContext) => boolean;
  /**
   * Gets the advanced option menu for the control.
   * @param context - The context of the control behavior.
   * @returns The advanced option menu for the control.
   */
  getMenu?: (context: ControlBehaviorContext) => AdvancedOptionMenu;
  /**
   * Gets the preset input options for the control.
   * @param context - The context of the control behavior.
   * @returns The preset input options for the control.
   */
  presetOptions?: PresetInputOption[];
  /**
   * Gets the preset decimals for the control.
   * @param context - The context of the control behavior.
   * @returns The preset decimals for the control.
   */
  presetDecimals?: number;
  /**
   * Whether the clothing builder should be shown for the control.
   * @param context - The context of the control behavior.
   * @returns Whether the clothing builder should be shown for the control.
   */
  showClothingBuilder?: boolean;
  /**
   * Gets the display value for the control.
   * @param context - The context of the control behavior.
   * @param inputId - The ID of the input to get the display value for.
   * @returns The display value for the control.
   */
  getDisplayValue?: (context: ControlBehaviorContext, inputId: InputIdType) => number;
  /**
   * Parses the input value for the control.
   * @param context - The context of the control behavior.
   * @param nextValue - The next value to parse for the control.
   * @returns The parsed input value for the control.
   */
  parseInput?: (context: ControlBehaviorContext, nextValue: number) => number | null;
  /**
   * Applies the input value to the control.
   * @param context - The context of the control behavior.
   * @param inputId - The ID of the input to apply the value to.
   * @param nextValue - The next value to apply to the input.
   * @returns The behavior patch to apply to the control.
   */
  applyInput?: (
    // Context of the control behavior.
    context: ControlBehaviorContext,
    // ID of the input to apply the value to.
    inputId: InputIdType,
    // The next value to apply to the input.
    nextValue: number | null,
  ) => BehaviorPatch | null;
  /**
   * Applies the option change to the control.
   * @param context - The context of the control behavior.
   * @param optionKey - The key of the option to apply the change to.
   * @param nextValue - The next value of the option to apply.
   * @returns The behavior patch to apply to the control.
   */
  applyOptionChange?: (
    // Context of the control behavior.
    context: ControlBehaviorContext,
    // The key of the option to apply the change to.
    optionKey: typeof OptionKey[keyof typeof OptionKey],
    // The next value of the option to apply.
    nextValue: string,
  ) => BehaviorPatch | null;
};

// Values of the temperature mode enum. Used for input validation.
const temperatureModeValues = Object.values(TemperatureMode);
// Values of the air speed input mode enum. Used for input validation.
const airSpeedInputModeValues = Object.values(AirSpeedInputMode);
// Values of the air speed control mode enum. Used for input validation.
const airSpeedControlModeValues = Object.values(AirSpeedControlMode);
// Values of the humidity input mode enum. Used for input validation.
const humidityInputModeValues = Object.values(HumidityInputMode);

// Check if a string is a valid temperature mode. Used for input validation.
function isTemperatureMode(value: string): value is TemperatureModeType {
  return temperatureModeValues.includes(value as TemperatureModeType);
}

// Check if a string is a valid air speed input mode. Used for input validation.
function isAirSpeedInputMode(value: string): value is AirSpeedInputModeType {
  return airSpeedInputModeValues.includes(value as AirSpeedInputModeType);
}

// Check if a string is a valid air speed control mode. Used for input validation.
function isAirSpeedControlMode(value: string): value is AirSpeedControlModeType {
  return airSpeedControlModeValues.includes(value as AirSpeedControlModeType);
}

// Check if a string is a valid humidity input mode. Used for input validation.
function isHumidityInputMode(value: string): value is HumidityInputModeType {
  return humidityInputModeValues.includes(value as HumidityInputModeType);
}

// Build the range text for a field. Used in table to build the full range for inputs.
function buildRangeText(meta: FieldMeta, context: ControlBehaviorContext): string {
  const minimum = formatDisplayValue(
    convertFieldValueFromSi(meta.key, meta.minValue, context.unitSystem),
    meta.decimals,
  );
  const maximum = formatDisplayValue(
    convertFieldValueFromSi(meta.key, meta.maxValue, context.unitSystem),
    meta.decimals,
  );
  return `From ${minimum} to ${maximum}`;
}

// Build the default presentation for a field. Used as a fallback for other behaviors.
export function buildDefaultPresentation(context: ControlBehaviorContext, meta: FieldMeta): PresentationMeta {
  return {
    label: meta.label,
    displayUnits: meta.displayUnits[context.unitSystem],
    step: meta.step,
    decimals: meta.decimals,
    rangeText: buildRangeText(meta, context),
    minValue: convertFieldValueFromSi(meta.key, meta.minValue, context.unitSystem),
    maxValue: convertFieldValueFromSi(meta.key, meta.maxValue, context.unitSystem),
  };
}

/**
 * Builds a section for the advanced settings menu.
 * Maps each menu item to its associated option key and determines its active state.
 */
function buildAdvancedOptionSection<Value extends string>(
  // Title for the advanced option menu section.
  title: string | undefined,
  // The key of the option that this section belongs to.
  optionKey: typeof OptionKey[keyof typeof OptionKey],
  // The currently active value of the option.
  activeValue: string,
  // The menu items for the section.
  items: MenuItemDefinition<Value>[],
): AdvancedOptionSection {
  // Map each menu item to its associated option key and determine its active state.
  const mappedItems = items.map((item) => ({
    // The label to display for the menu item.
    label: item.label,
    // The description to display for the menu item.
    description: item.description,
    // The value of the menu item.
    value: item.value,
    // The key of the option that this menu item belongs to.
    optionKey,
    // Whether the menu item is active.
    active: item.value === activeValue,
  }));

  // Return the advanced option section.
  return { title, items: mappedItems };
}

/**
 * Builds an advanced option menu for a control.
 * This menu is used to override the default behavior of a control by changing
 * the options that control the behavior.
 */
function buildAdvancedOptionMenu(
  // Title for the advanced option menu.
  title: string,
  // The sections for the advanced option menu.
  sections: AdvancedOptionSection[],
): AdvancedOptionMenu {
  // Return the advanced option menu.
  return { title, sections };
}

/**
 * Builds a patch that syncs the inputs of a control to the options.
 * This is used to update the inputs of a control when an option is changed.
 */
function buildCanonicalInputSyncPatch(
  // The IDs of the inputs to sync.
  targetInputIds: InputIdType[],
  // The patch to apply to the options.
  optionsPatch: Partial<Record<typeof OptionKey[keyof typeof OptionKey], string>>,
  // The updater function to apply to the inputs.
  updater: (
    // The ID of the input to update.
    inputId: InputIdType,
  ) => {
    // The next state of the input.
    inputState: Record<typeof FieldKey[keyof typeof FieldKey], number>
  },
): BehaviorPatch {
  // The patch to apply to the inputs.
  const inputsPatch = {} as BehaviorPatch["inputsPatch"];

  // Apply the updater function to each target input.
  targetInputIds.forEach((inputId) => {
    // The next state of the input.
    const nextState = updater(inputId);
    // Update the input state in the patch.
    inputsPatch[inputId] = nextState.inputState;
  });

  // Return the patch for inputs and options.
  return {
    // The patch to apply to the inputs.
    inputsPatch,
    // The patch to apply to the options.
    optionsPatch,
  };
}

/**
 * Builds overrides for derived inputs. This is used to override the default
 * behavior of a control by changing the options that control the behavior.
 */
function buildDerivedInputOverrides(
  // The context of the control behavior.
  context: ControlBehaviorContext,
  // The ID of the input.
  inputId: InputIdType,
  // The overrides for the derived inputs.
  overrides?: Partial<Record<typeof DerivedInputId[keyof typeof DerivedInputId], number>>,
) {
  // Return the overrides for the derived inputs by merging the default
  // overrides with the provided overrides.
  return Object.assign({}, context.derivedByInput[inputId], overrides);
}

/**
 * Gets the default display value for an input field. Used for derived inputs.
 */
function getDefaultDisplayValue(
  // The context of the control behavior.
  context: ControlBehaviorContext,
  // The ID of the input.
  inputId: InputIdType,
  // The key of the field.
  fieldKey: FieldKeyType,
): number {
  // Convert the field value to the display units and format it for display.
  return convertFieldValueFromSi(fieldKey, context.inputsByInput[inputId][fieldKey], context.unitSystem);
}

/**
 * Creates a control behavior used for creating new controls, such as derived inputs.
 */
export function createControlBehavior(config: ControlBehaviorConfig): InputControlBehavior {
  // The metadata for the field that this control is associated with.
  const meta = fieldMetaByKey[config.fieldKey];

  // Return the control behavior.
  return {
    // Build the view model for this control. Takes the current state of the
    // control behavior (context) and returns the view model for the control.
    buildViewModel: (context: ControlBehaviorContext): InputControlViewModel => {
      // Determine the presentation of the control. Use the provided function
      // if it exists, otherwise fall back to the default presentation.
      let presentation: PresentationMeta;
      if (config.getPresentation) {
        presentation = config.getPresentation(context, meta);
      } else {
        presentation = buildDefaultPresentation(context, meta);
      }

      // Determine if the control should be hidden. Use the provided function
      // if it exists, otherwise fall back to the default behavior (not hidden).
      let hidden = false;
      if (config.hidden) {
        hidden = config.hidden(context);
      }

      // Determine the editor kind based on whether preset options are available.
      // If preset options are available, the editor kind will be "preset".
      // Otherwise, the editor kind will be "number".
      let editorKind: "number" | "preset" = "number";
      if (config.presetOptions && config.presetOptions.length > 0) {
        editorKind = "preset";
      }

      // Determine the advanced option menu for the control. If no menu is provided,
      // the advanced option menu will be null.
      let menu: AdvancedOptionMenu = null;
      if (config.getMenu) {
        menu = config.getMenu(context);
      }

      // Use the provided preset options if available, otherwise use an empty array.
      let presetOptions: PresetInputOption[] = [];
      if (config.presetOptions) {
        presetOptions = config.presetOptions;
      }

      // Determine the number of decimals to use for preset options.
      // If no preset decimals are provided, use the presentation decimals.
      let presetDecimals = presentation.decimals;
      if (config.presetDecimals !== undefined) {
        presetDecimals = config.presetDecimals;
      }

      // Determine if the clothing builder should be shown. Use the provided function
      // if it exists, otherwise fall back to the default behavior.
      let showClothingBuilder = false;
      if (config.showClothingBuilder) {
        showClothingBuilder = config.showClothingBuilder;
      }

      // Calculate the display values for each visible input. Use the provided function
      // if it exists, otherwise fall back to the default behavior (getting the
      // display value from the context).
      const displayValuesByInput = context.visibleInputIds.reduce((accumulator, inputId) => {
        // Use the provided display value function if available, otherwise fall back
        // to the default display value function.
        let value: number | undefined | null;
        if (config.getDisplayValue) {
          value = config.getDisplayValue(context, inputId);
        }
        // Use the default display value function if no display value function is
        // provided or if the display value function returns undefined or null.
        if (value === undefined || value === null) {
          value = getDefaultDisplayValue(context, inputId, config.fieldKey);
        }
        accumulator[inputId] = formatDisplayValue(value, presentation.decimals);
        return accumulator;
      }, 
      {} as Record<InputIdType, string>);

      const numericValuesByInput = context.visibleInputIds.reduce((accumulator, inputId) => {
        let value: number | undefined | null;
        if (config.getDisplayValue) {
          value = config.getDisplayValue(context, inputId);
        }
        if (value === undefined || value === null) {
          value = getDefaultDisplayValue(context, inputId, config.fieldKey);
        }
        // Assign the numeric value to the input in the accumulator.
        accumulator[inputId] = value;
        // Return the accumulator.
        return accumulator;
      }, {} as Record<InputIdType, number>);

      // Return the view model.
      return {
        // The ID of the control (e.g. FieldKey.AmbientAirTemperature).
        id: config.controlId,
        // The label for the control (e.g. "Ambient Air Temperature").
        label: presentation.label,
        // The display units for the control (e.g. "°C" or "°F").
        displayUnits: presentation.displayUnits,
        // The range text for the control (e.g. "50-100°C" or "50-100°F").
        rangeText: presentation.rangeText,
        // The minimum value for the control (e.g. 100).
        minValue: presentation.minValue,
        // The maximum value for the control (e.g. 150).
        maxValue: presentation.maxValue,
        // Whether the control should be hidden (e.g. false).
        hidden,
        // The kind of editor to use for the control (e.g. "number" or "preset").
        editorKind,
        // The step size for the control (e.g. 1).
        step: presentation.step,
        // The advanced option menu for the control (e.g. null).
        menu,
        // The preset options for the control (e.g. []).
        presetOptions,
        // Whether to show the clothing builder for the control (e.g. true).
        showClothingBuilder,
        // The number of decimals to use for preset options (e.g. 1).
        presetDecimals,
        // The display values for the control (e.g. {ambientAirTemperature: "20.0"}).
        displayValuesByInput,
        // The numeric values for the control (e.g. {ambientAirTemperature: 20.0}).
        numericValuesByInput,
      };
    },
    // Apply the input value to the control.
    applyInput: (context, inputId, rawValue) => {
      // If the input value is empty, return null.
      if (!rawValue.trim()) {
        return null;
      }
      // Parse the input value to a number.
      const parsedValue = Number(rawValue);
      // If the parsed value is NaN, return null.
      if (Number.isNaN(parsedValue)) {
        return null;
      }

      // If the parseInput function is provided, use it to parse the input value. Otherwise, use
      // the default behavior (convertFieldValueToSi) to convert the parsed value to SI units.
      let nextValue: number | null;
      if (config.parseInput) {
        nextValue = config.parseInput(context, parsedValue);
      } else {
        nextValue = convertFieldValueToSi(config.fieldKey, parsedValue, context.unitSystem);
      }

      // If the conversion results in null, return null.
      if (nextValue === null) {
        return null;
      }

      // If the applyInput function is provided, use it to apply the input value to the control.
      if (config.applyInput) {
        return config.applyInput(context, inputId, nextValue);
      }

      // Create a new input state object with the updated field value.
      const nextInputState = Object.assign({}, context.inputsByInput[inputId]);
      // Set the field value in the input state.
      nextInputState[config.fieldKey] = nextValue;

      // Return a patch to update the input state.
      return createSingleInputPatch(inputId, nextInputState);
    },
    // Apply an option change to the control.
    applyOptionChange: config.applyOptionChange,
  };
}

/**
 * Creates an input control behavior for temperature. Used for both Dry Bulb Temperature and Operative Temperature.
 * @param controlId The ID of the control.
 * @returns An input control behavior for temperature.
 */
export function createTemperatureControlBehavior(controlId: InputControlIdType): InputControlBehavior {
  // Get the temperature field metadata (e.g., units, precision).
  const temperatureMeta = fieldMetaByKey[FieldKey.DryBulbTemperature];

  // Return a control behavior.
  return createControlBehavior({
    // The ID of the control.
    controlId,
    // The field key for the control (always FieldKey.DryBulbTemperature).
    fieldKey: FieldKey.DryBulbTemperature,
    // Get the presentation for the control.
    getPresentation: (context) => {
      // Get the temperature mode from the control options (e.g., Operative or Dry Bulb).
      const temperatureMode = normalizeControlOptions(context.options)[OptionKey.TemperatureMode];
      
      // Get the label for the control.
      let label = temperatureMeta.label;
      // If the temperature mode is operative, set the label to "Operative temperature".
      if (temperatureMode === TemperatureMode.Operative) {
        label = "Operative temperature";
      }
      // Return the presentation.
      return {
        // The label for the control.
        label,
        // The display units for the control.
        displayUnits: temperatureMeta.displayUnits[context.unitSystem],
        // The increment/decrement (step) size for the control.
        step: temperatureMeta.step,
        // The number of decimals to use for the control.
        decimals: temperatureMeta.decimals,
        // The range text for the control (e.g., "20-30°C").
        rangeText: buildRangeText(temperatureMeta, context),
        // The minimum value for the control.
        minValue: convertFieldValueFromSi(
          // The field key for the control.
          temperatureMeta.key,
          // The minimum value for the control in SI units.
          temperatureMeta.minValue,
          // The unit system for the control.
          context.unitSystem,
        ),
        // The maximum value for the control.
        maxValue: convertFieldValueFromSi(
          // The field key for the control.
          temperatureMeta.key,
          // The maximum value for the control in SI units.
          temperatureMeta.maxValue,
          // The unit system for the control.
          context.unitSystem,
        ),
      };
    },
    // Get the advanced option menu for the control.
    getMenu: (context) => {
      // Get the temperature mode from the control options (e.g., Operative or Dry Bulb).
      const temperatureMode = normalizeControlOptions(context.options)[OptionKey.TemperatureMode];
      // If the selected chart is not one of the main comfort charts, and the temperature mode is not Operative, return null.
      const isComfortChart = 
        context.selectedChartId === ChartId.Psychrometric ||
        context.selectedChartId === ChartId.Stress ||
        context.selectedChartId === ChartId.Adaptive ||
        context.selectedChartId === ChartId.PmvDynamic ||
        context.selectedChartId === ChartId.UtciDynamic ||
        context.selectedChartId === ChartId.AdaptiveDynamic;

      if (!isComfortChart && temperatureMode !== TemperatureMode.Operative) {
        // Return null if the temperature mode is not Operative and the selected chart is not a comfort chart.
        return null;
      }

      // Return the advanced option menu.
      return buildAdvancedOptionMenu("Temperature input", [
        // Build the advanced option section.
        buildAdvancedOptionSection(
          // The section title.
          undefined,
          // The option key.
          OptionKey.TemperatureMode,
          // The current option value.
          temperatureMode,
          // The menu items.
          temperatureMenuItems,
        ),
      ]);
    },
    // Apply the input value to the control.
    applyInput: (context, inputId, nextValueSi) => {
      // Normalize the control options.
      const options = normalizeControlOptions(context.options);
      
      // Create a new input state object with the updated field value.
      const nextInputState = Object.assign({}, context.inputsByInput[inputId]);
      // Set the field value in the input state.
      nextInputState[FieldKey.DryBulbTemperature] = nextValueSi;
      
      // If the temperature mode is operative, set the mean radiant temperature to the same value.
      if (options[OptionKey.TemperatureMode] === TemperatureMode.Operative) {
        nextInputState[FieldKey.MeanRadiantTemperature] = nextValueSi;
      }

      // Synchronize the control input state.
      const synchronizedState = synchronizeControlInputState(
        // The next input state.
        nextInputState,
        // The current control options.
        context.options,
        // The derived state.
        context.derivedByInput[inputId],
      );
      // Return a patch to update the input state.
      return createSingleInputPatch(inputId, synchronizedState.inputState);
    },
    // Apply the option change to the control.
    applyOptionChange: (context, optionKey, nextValue) => {
      // If the option key is not temperature mode or the next value is not a valid temperature mode, return null.
      if (optionKey !== OptionKey.TemperatureMode || !isTemperatureMode(nextValue)) {
        return null;
      }

      // Normalize the control options.
      const currentOptions = normalizeControlOptions(context.options);
      if (currentOptions[optionKey] === nextValue) {
        return null;
      }

      // Merge the next option value into the options object.
      const nextOptions = Object.assign({}, context.options);
      nextOptions[optionKey] = nextValue;

      // Return a patch to update the input state for all inputs.
      return buildCanonicalInputSyncPatch(
        // The order of inputs to process.
        inputOrder,
        // The option value to set.
        { [optionKey]: nextValue },
        // The function to apply to each input.
        (inputId) => {
          // If the next value is operative temperature, apply the operative temperature control mode.
          if (nextValue === TemperatureMode.Operative) {
            // Apply the operative temperature control mode.
            return applyOperativeTemperatureControlMode(
              // The input state for the control.
              context.inputsByInput[inputId],
              // The next control options.
              nextOptions,
              // The derived state for the control.
              context.derivedByInput[inputId],
            );
          }

          // Otherwise, synchronize the control input state.
          return synchronizeControlInputState(
            // The input state for the control.
            context.inputsByInput[inputId],
            // The next control options.
            nextOptions,
            // The derived state for the control.
            context.derivedByInput[inputId],
          );
        },
      );
    },
  });
}

/**
 * Creates an input control behavior for air speed. Used for both relative and measured air speed.
 * @param controlId The ID of the control.
 * @returns An input control behavior for air speed.
 */
export function createAirSpeedControlBehavior(controlId: InputControlIdType): InputControlBehavior {
  // The metadata for the field that this control is associated with.
  const airSpeedMeta = fieldMetaByKey[FieldKey.RelativeAirSpeed];

  // Return the control behavior.
  return createControlBehavior({
    // The ID of the control.
    controlId,
    // The key of the field that this control is associated with.
    fieldKey: FieldKey.RelativeAirSpeed,
    // The function to build the presentation for the control.
    getPresentation: (context) => {
      // The air speed mode for the control.
      const airSpeedMode = normalizeControlOptions(context.options)[OptionKey.AirSpeedInputMode];
      
      // The label to display for the control, which varies depending on the air speed mode. 
      // If the air speed mode is "Measured", the label is "Measured air speed". Otherwise, the label is "Relative air speed".
      let label = "Relative air speed";
      if (airSpeedMode === AirSpeedInputMode.Measured) {
        label = "Measured air speed";
      }

      // Return the presentation for the control.
      return {
        // The label to display for the control.
        label,
        // The units to display for the control.
        displayUnits: airSpeedMeta.displayUnits[context.unitSystem],
        // The step to use for the control.
        step: airSpeedMeta.step,
        // The number of decimals to display for the control.
        decimals: airSpeedMeta.decimals,
        // The range text to display for the control.
        rangeText: buildRangeText(airSpeedMeta, context),
        // The minimum value for the control.
        minValue: convertFieldValueFromSi(
          // The key of the field.
          airSpeedMeta.key,
          // The minimum value in SI units.
          airSpeedMeta.minValue,
          // The unit system to use.
          context.unitSystem,
        ),
        // The maximum value for the control.
        maxValue: convertFieldValueFromSi(
          // The key of the field.
          airSpeedMeta.key,
          // The maximum value in SI units.
          airSpeedMeta.maxValue,
          // The unit system to use.
          context.unitSystem,
        ),
      };
    },
    // Get the menu for the control.
    getMenu: (context) => {
      // Normalize the control options.
      const options = normalizeControlOptions(context.options);
      // Return the menu for the control.
      return buildAdvancedOptionMenu("Air speed options", [
        // Build the input mode section.
        buildAdvancedOptionSection(
          // The label for the section.
          "Input mode",
          // The key of the option.
          OptionKey.AirSpeedInputMode,
          // The current option value.
          options[OptionKey.AirSpeedInputMode],
          // The menu items for the option.
          airSpeedInputMenuItems,
        ),
        // Build the occupant control section.
        buildAdvancedOptionSection(
          // The label for the section.
          "Occupant control",
          // The key of the option.
          OptionKey.AirSpeedControlMode,
          // The current option value.
          options[OptionKey.AirSpeedControlMode],
          // The menu items for the option.
          airSpeedControlMenuItems,
        ),
      ]);
    },
    // Get the display value for the control.
    getDisplayValue: (context, inputId) => {
      // Normalize the control options.
      const airSpeedMode = normalizeControlOptions(context.options)[OptionKey.AirSpeedInputMode];
      
      // The source value for the display value.
      let sourceValue;
      // If the air speed mode is measured, the source value is the measured air speed.
      if (airSpeedMode === AirSpeedInputMode.Measured) {
        // Get the measured air speed from the derived inputs.
        sourceValue = context.derivedByInput[inputId][DerivedInputId.MeasuredAirSpeed];
        // If the measured air speed is undefined or null, set it to 0.
        if (sourceValue === undefined || sourceValue === null) {
          sourceValue = 0;
        }
      } else {
        // Get the relative air speed from the inputs.
        sourceValue = context.inputsByInput[inputId][FieldKey.RelativeAirSpeed];
      }

      // Return the display value for the control.
      return convertFieldValueFromSi(FieldKey.RelativeAirSpeed, sourceValue, context.unitSystem);
    },
    // Apply input to the control.
    applyInput: (context, inputId, nextValueSi) => {
      // Normalize the control options.
      const airSpeedMode = normalizeControlOptions(context.options)[OptionKey.AirSpeedInputMode];
      
      // The next input state for the control.
      const nextInputState = Object.assign({}, context.inputsByInput[inputId]);
      // The derived input overrides for the control.
      const derivedInputOverrides = buildDerivedInputOverrides(context, inputId);

      // If the air speed mode is measured, the derived input override is the measured air speed.
      if (airSpeedMode === AirSpeedInputMode.Measured) {
        // Set the measured air speed in the derived input overrides.
        derivedInputOverrides[DerivedInputId.MeasuredAirSpeed] = nextValueSi;
      } else {
        // Otherwise, set the relative air speed in the next input state.
        nextInputState[FieldKey.RelativeAirSpeed] = nextValueSi;
      }

      // Synchronize the control input state.
      const synchronizedState = synchronizeControlInputState(nextInputState, context.options, derivedInputOverrides);
      // Return a patch to update the input state for the control.
      return createSingleInputPatch(inputId, synchronizedState.inputState);
    },
    // Apply option change to the control.
    applyOptionChange: (context, optionKey, nextValue) => {
      // If the option key is the air speed control mode.
      if (optionKey === OptionKey.AirSpeedControlMode) {
        // If the next value is not a valid air speed control mode, return null.
        if (!isAirSpeedControlMode(nextValue)) {
          return null;
        }

        // Get the current options.
        const currentOptions = normalizeControlOptions(context.options);
        // If the current option value is the same as the next value, return null.
        if (currentOptions[optionKey] === nextValue) {
          return null;
        }

        // Return the options patch.
        return {
          optionsPatch: {
            [optionKey]: nextValue,
          },
        };
      }

      // If the option key is the air speed input mode and the next value is a valid air speed input mode.
      if (optionKey !== OptionKey.AirSpeedInputMode || !isAirSpeedInputMode(nextValue)) {
        return null;
      }

      // Get the current options.
      const currentOptions = normalizeControlOptions(context.options);
      // If the current option value is the same as the next value, return null.
      if (currentOptions[optionKey] === nextValue) {
        return null;
      }

      // The next options.
      const nextOptions = Object.assign({}, context.options);
      // Set the next option value.
      nextOptions[optionKey] = nextValue;

      // Return the canonical input sync patch.
      return buildCanonicalInputSyncPatch(
        // The order of the inputs.
        inputOrder,
        // The option patch.
        { [optionKey]: nextValue },
        // The function to synchronize the control input state.
        (inputId) => synchronizeControlInputState(
          // The input state for the control.
          context.inputsByInput[inputId],
          // The next options.
          nextOptions,
          // The derived input overrides for the control.
          context.derivedByInput[inputId],
        ),
      );
    },
  });
}

/**
 * Create the humidity control behavior.
 */
export function createHumidityControlBehavior(controlId: InputControlIdType): InputControlBehavior {
  // The meta data for the relative humidity field.
  const relativeHumidityMeta = fieldMetaByKey[FieldKey.RelativeHumidity];
  // The meta data for the dry bulb temperature field.
  const temperatureMeta = fieldMetaByKey[FieldKey.DryBulbTemperature];

  // Return the control behavior.
  return createControlBehavior({
    // The control ID.
    controlId,
    // The field key.
    fieldKey: FieldKey.RelativeHumidity,
    // Get the presentation for the control.
    getPresentation: (context) => {
      // Normalize the control options.
      const humidityMode = normalizeControlOptions(context.options)[OptionKey.HumidityInputMode];

      // If the humidity mode is dew point.
      if (humidityMode === HumidityInputMode.DewPoint) {
        return {
          // The label for the control.
          label: "Dew point",
          // The display units for the control.
          displayUnits: temperatureMeta.displayUnits[context.unitSystem],
          // The step for the control.
          step: temperatureMeta.step,
          // The number of decimals for the control.
          decimals: temperatureMeta.decimals,
          // The range text for the control.
          rangeText: "",
        };
      }

      // If the humidity mode is humidity ratio.
      if (humidityMode === HumidityInputMode.HumidityRatio) {
        // Get the display meta data for the humidity ratio.
        const meta = getHumidityRatioDisplayMeta(context.unitSystem);
        return {
          // The label for the control.
          label: "Humidity ratio",
          // The display units for the control.
          displayUnits: meta.displayUnits,
          // The step for the control.
          step: meta.step,
          // The number of decimals for the control.
          decimals: meta.decimals,
          // The range text for the control.
          rangeText: "",
        };
      }

      // If the humidity mode is wet bulb.
      if (humidityMode === HumidityInputMode.WetBulb) {
        return {
          // The label for the control.
          label: "Wet-bulb temperature",
          // The display units for the control.
          displayUnits: temperatureMeta.displayUnits[context.unitSystem],
          // The step for the control.
          step: temperatureMeta.step,
          // The number of decimals for the control.
          decimals: temperatureMeta.decimals,
          // The range text for the control.
          rangeText: "",
        };
      }

      // If the humidity mode is vapor pressure.
      if (humidityMode === HumidityInputMode.VaporPressure) {
        // Get the display meta data for the vapor pressure.
        const meta = getVaporPressureDisplayMeta(context.unitSystem);
        return {
          // The label for the control.
          label: "Vapor pressure",
          // The display units for the control.
          displayUnits: meta.displayUnits,
          // The step for the control.
          step: meta.step,
          // The number of decimals for the control.
          decimals: meta.decimals,
          // The range text for the control.
          rangeText: "",
        };
      }

      // Return the presentation for the relative humidity control.
      return {
        // The label for the control.
        label: relativeHumidityMeta.label,
        // The display units for the control.
        displayUnits: relativeHumidityMeta.displayUnits[context.unitSystem],
        // The step for the control.
        step: relativeHumidityMeta.step,
        // The number of decimals for the control.
        decimals: relativeHumidityMeta.decimals,
        // The range text for the control.
        rangeText: buildRangeText(relativeHumidityMeta, context),
        // The minimum value for the control.
        minValue: convertFieldValueFromSi(
          // The field key for the relative humidity control.
          relativeHumidityMeta.key,
          // The minimum value for the relative humidity control in SI units.
          relativeHumidityMeta.minValue,
          // The unit system for the control.
          context.unitSystem,
        ),
        // The maximum value for the control.
        maxValue: convertFieldValueFromSi(
          // The field key for the relative humidity control.
          relativeHumidityMeta.key,
          // The maximum value for the relative humidity control in SI units.
          relativeHumidityMeta.maxValue,
          // The unit system for the control.
          context.unitSystem,
        ),
      };
    },
    getMenu: (context) => {
      // Get the humidity mode from the control options.
      const humidityMode = normalizeControlOptions(context.options)[OptionKey.HumidityInputMode];
      // Return the advanced option menu for the humidity control.
      return buildAdvancedOptionMenu("Humidity input", [
        // Build the advanced option section for the humidity control.
        buildAdvancedOptionSection(
          // The section icon.
          undefined,
          // The option key.
          OptionKey.HumidityInputMode,
          // The option value.
          humidityMode,
          // The option menu items.
          humidityMenuItems,
        ),
      ]);
    },
    // Get the display value for the control.
    getDisplayValue: (context, inputId) => {
      // Get the humidity mode from the control options.
      const humidityMode = normalizeControlOptions(context.options)[OptionKey.HumidityInputMode];
      // Get the derived state for the control.
      const derivedState = context.derivedByInput[inputId];

      // If the humidity mode is dew point.
      if (humidityMode === HumidityInputMode.DewPoint) {
        // Get the dew point value from the derived state.
        let value = derivedState[DerivedInputId.DewPoint];
        // If the dew point value is undefined or null, set it to 0.
        if (value === undefined || value === null) {
          value = 0;
        }
        // Convert the dew point value to the display units.
        return convertFieldValueFromSi(
          // The field key for the dew point control.
          FieldKey.DryBulbTemperature,
          // The dew point value.
          value,
          // The unit system for the control.
          context.unitSystem,
        );
      }

      // If the humidity mode is humidity ratio.
      if (humidityMode === HumidityInputMode.HumidityRatio) {
        // Get the humidity ratio value from the derived state.
        let value = derivedState[DerivedInputId.HumidityRatio];
        // If the humidity ratio value is undefined or null, set it to 0.
        if (value === undefined || value === null) {
          value = 0;
        }
        // Convert the humidity ratio value to the display units.
        return convertHumidityRatioFromSi(value, context.unitSystem);
      }

      // If the humidity mode is wet bulb.
      if (humidityMode === HumidityInputMode.WetBulb) {
        // Get the wet bulb value from the derived state.
        let value = derivedState[DerivedInputId.WetBulb];
        // If the wet bulb value is undefined or null, set it to 0.
        if (value === undefined || value === null) {
          value = 0;
        }
        // Convert the wet bulb value to the display units.
        return convertFieldValueFromSi(
          // The field key for the wet bulb control.
          FieldKey.DryBulbTemperature,
          // The wet bulb value.
          value,
          // The unit system for the control.
          context.unitSystem,
        );
      }

      // If the humidity mode is vapor pressure.
      if (humidityMode === HumidityInputMode.VaporPressure) {
        // Get the vapor pressure value from the derived state.
        let value = derivedState[DerivedInputId.VaporPressure];
        // If the vapor pressure value is undefined or null, set it to 0.
        if (value === undefined || value === null) {
          value = 0;
        }
        // Convert the vapor pressure value to the display units.
        return convertVaporPressureFromSi(value, context.unitSystem);
      }

      // If the humidity mode is relative humidity.
      if (humidityMode === HumidityInputMode.RelativeHumidity) {
        // Get the relative humidity value from the input state.
        let value = context.inputsByInput[inputId][FieldKey.RelativeHumidity];
        // If the relative humidity value is undefined or null, set it to 0.
        if (value === undefined || value === null) {
          value = 0;
        }
        return value;
      }

      // Convert the relative humidity value to the display units.
      return convertFieldValueFromSi(
        // The field key for the relative humidity control.
        FieldKey.RelativeHumidity,
        // The relative humidity value.
        context.inputsByInput[inputId][FieldKey.RelativeHumidity],
        // The unit system for the control.
        context.unitSystem,
      );
    },
    // Parse the input value.
    parseInput: (context, nextValue) => {
      // Get the humidity mode from the control options.
      const humidityMode = normalizeControlOptions(context.options)[OptionKey.HumidityInputMode];

      // If the humidity mode is dew point.
      if (humidityMode === HumidityInputMode.DewPoint) {
        // Convert the dew point value to SI units.
        return convertFieldValueToSi(FieldKey.DryBulbTemperature, nextValue, context.unitSystem);
      }

      // If the humidity mode is humidity ratio.
      if (humidityMode === HumidityInputMode.HumidityRatio) {
        // Convert the humidity ratio value to SI units.
        return convertHumidityRatioToSi(nextValue, context.unitSystem);
      }

      // If the humidity mode is wet bulb.
      if (humidityMode === HumidityInputMode.WetBulb) {
        // Convert the wet bulb value to SI units.
        return convertFieldValueToSi(FieldKey.DryBulbTemperature, nextValue, context.unitSystem);
      }

      // If the humidity mode is vapor pressure.
      if (humidityMode === HumidityInputMode.VaporPressure) {
        // Convert the vapor pressure value to SI units.
        return convertVaporPressureToSi(nextValue, context.unitSystem);
      }

      // Otherwise, convert the relative humidity value to SI units.
      return convertFieldValueToSi(FieldKey.RelativeHumidity, nextValue, context.unitSystem);
    },
    // Apply the input to the control.
    applyInput: (context, inputId, nextValue) => {
      // Get the humidity mode from the control options.
      const humidityMode = normalizeControlOptions(context.options)[OptionKey.HumidityInputMode];

      // Get the next input state.
      const nextInputState = Object.assign({}, context.inputsByInput[inputId]);
      // Build the derived input overrides.
      const derivedInputOverrides = buildDerivedInputOverrides(context, inputId);

      // If the humidity mode is dew point.
      if (humidityMode === HumidityInputMode.DewPoint) {
        // Set the dew point override.
        derivedInputOverrides[DerivedInputId.DewPoint] = nextValue;
      }
      // If the humidity mode is humidity ratio.
      else if (humidityMode === HumidityInputMode.HumidityRatio) {
        // Set the humidity ratio override.
        derivedInputOverrides[DerivedInputId.HumidityRatio] = nextValue;
      }
      // If the humidity mode is wet bulb.
      else if (humidityMode === HumidityInputMode.WetBulb) {
        // Set the wet bulb override.
        derivedInputOverrides[DerivedInputId.WetBulb] = nextValue;
      }
      // If the humidity mode is vapor pressure.
      else if (humidityMode === HumidityInputMode.VaporPressure) {
        // Set the vapor pressure override.
        derivedInputOverrides[DerivedInputId.VaporPressure] = nextValue;
      }
      // Otherwise, set the relative humidity override.
      else {
        nextInputState[FieldKey.RelativeHumidity] = nextValue;
      }

      // Synchronize the input state with the control options and derived input overrides.
      const synchronizedState = synchronizeControlInputState(nextInputState, context.options, derivedInputOverrides);
      // Create a patch for the input state.
      return createSingleInputPatch(inputId, synchronizedState.inputState);
    },
    // Apply an option change to the control.
    applyOptionChange: (context, optionKey, nextValue) => {
      // Check if the option key is humidity input mode and the next value is a valid humidity input mode.
      if (optionKey !== OptionKey.HumidityInputMode || !isHumidityInputMode(nextValue)) {
        return null;
      }

      // Get the current options.
      const currentOptions = normalizeControlOptions(context.options);
      // If the current option value is equal to the next option value, return null.
      if (currentOptions[optionKey] === nextValue) {
        return null;
      }

      // Get the next options.
      const nextOptions = Object.assign({}, context.options);
      // Set the next option as the humidity input mode.
      nextOptions[optionKey] = nextValue;

      // Return a patch for the input state.
      return buildCanonicalInputSyncPatch(
        inputOrder,
        { [optionKey]: nextValue },
        (inputId) => synchronizeControlInputState(
          context.inputsByInput[inputId],
          nextOptions,
          context.derivedByInput[inputId],
        ),
      );
    },
  });
}
