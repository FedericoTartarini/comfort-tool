import {
  DerivedInputId,
  FieldKey,
  type CanonicalInputState,
  type DerivedInputId as DerivedInputIdType,
  type DerivedInputState,
} from "../../../models/fieldKeys";
import { fieldMetaByKey } from "../../../models/inputFieldsMeta";
import type { InputControlId as InputControlIdType } from "../../../models/inputControls";
import {
  HumidityInputMode,
  OptionKey,
  type HumidityInputMode as HumidityInputModeType,
  type ModelOptionsRecord,
} from "../../../models/inputModes";
import { inputOrder } from "../../../models/inputSlots";
import { humidityMenuItems } from "../../../models/controlMenuMeta";
import {
  convertFieldValueFromSi,
  convertFieldValueToSi,
  convertHumidityRatioFromSi,
  convertHumidityRatioToSi,
  convertVaporPressureFromSi,
  convertVaporPressureToSi,
  getHumidityRatioDisplayMeta,
  getVaporPressureDisplayMeta,
} from "../../units";
import {
  deriveRelativeHumidityFromDewPoint,
  deriveRelativeHumidityFromHumidityRatio,
  deriveRelativeHumidityFromVaporPressure,
  deriveRelativeHumidityFromWetBulb,
} from "../derivations";
import type { UnitSystem as UnitSystemType } from "../../../models/units";
import type {
  ControlBehaviorContext,
  InputControlBehavior,
} from "./types";
import {
  buildAdvancedOptionMenu,
  buildAdvancedOptionSection,
  buildDefaultPresentation,
  createControlBehavior,
  requireOptionValue,
  type OptionChangeHandler,
  type PresentationMeta,
} from "./numericControl";

interface HumidityModeDefinition {
  label: string;
  derivedKey: DerivedInputIdType | null;
  getPresentation: (
    context: ControlBehaviorContext,
    label: string,
  ) => PresentationMeta;
  fromSi: (valueSi: number, unitSystem: UnitSystemType) => number;
  toSi: (value: number, unitSystem: UnitSystemType) => number;
  toRelativeHumidity: (
    dryBulbTemperatureSi: number,
    valueSi: number,
  ) => number;
}

const temperatureMeta = fieldMetaByKey[FieldKey.DryBulbTemperature];
const relativeHumidityMeta = fieldMetaByKey[FieldKey.RelativeHumidity];

function buildTemperaturePresentation(
  context: ControlBehaviorContext,
  label: string,
): PresentationMeta {
  return {
    label,
    displayUnits: temperatureMeta.displayUnits[context.unitSystem],
    step: temperatureMeta.step,
    decimals: temperatureMeta.decimals,
    rangeText: "",
  };
}

const humidityModeDefinitions: Record<HumidityInputModeType, HumidityModeDefinition> = {
  [HumidityInputMode.RelativeHumidity]: {
    label: relativeHumidityMeta.label,
    derivedKey: null,
    getPresentation: (context, label) => ({
      ...buildDefaultPresentation(context, relativeHumidityMeta),
      label,
    }),
    fromSi: (valueSi) => valueSi,
    toSi: (value) => value,
    toRelativeHumidity: (_temperature, valueSi) => valueSi,
  },
  [HumidityInputMode.HumidityRatio]: {
    label: "Humidity ratio",
    derivedKey: DerivedInputId.HumidityRatio,
    getPresentation: (context, label) => ({
      label,
      ...getHumidityRatioDisplayMeta(context.unitSystem),
      rangeText: "",
    }),
    fromSi: convertHumidityRatioFromSi,
    toSi: convertHumidityRatioToSi,
    toRelativeHumidity: deriveRelativeHumidityFromHumidityRatio,
  },
  [HumidityInputMode.DewPoint]: {
    label: "Dew point",
    derivedKey: DerivedInputId.DewPoint,
    getPresentation: buildTemperaturePresentation,
    fromSi: (valueSi, unitSystem) => convertFieldValueFromSi(
      FieldKey.DryBulbTemperature,
      valueSi,
      unitSystem,
    ),
    toSi: (value, unitSystem) => convertFieldValueToSi(
      FieldKey.DryBulbTemperature,
      value,
      unitSystem,
    ),
    toRelativeHumidity: deriveRelativeHumidityFromDewPoint,
  },
  [HumidityInputMode.WetBulb]: {
    label: "Wet-bulb temperature",
    derivedKey: DerivedInputId.WetBulb,
    getPresentation: buildTemperaturePresentation,
    fromSi: (valueSi, unitSystem) => convertFieldValueFromSi(
      FieldKey.DryBulbTemperature,
      valueSi,
      unitSystem,
    ),
    toSi: (value, unitSystem) => convertFieldValueToSi(
      FieldKey.DryBulbTemperature,
      value,
      unitSystem,
    ),
    toRelativeHumidity: deriveRelativeHumidityFromWetBulb,
  },
  [HumidityInputMode.VaporPressure]: {
    label: "Vapor pressure",
    derivedKey: DerivedInputId.VaporPressure,
    getPresentation: (context, label) => ({
      label,
      ...getVaporPressureDisplayMeta(context.unitSystem),
      rangeText: "",
    }),
    fromSi: convertVaporPressureFromSi,
    toSi: convertVaporPressureToSi,
    toRelativeHumidity: deriveRelativeHumidityFromVaporPressure,
  },
};

const humidityModeValues = Object.values(HumidityInputMode);

export function requireHumidityInputMode(
  options: ModelOptionsRecord,
): HumidityInputModeType {
  return requireOptionValue(
    options,
    OptionKey.HumidityInputMode,
    humidityModeValues,
  );
}

function getHumidityValueSi(
  definition: HumidityModeDefinition,
  inputState: CanonicalInputState,
  derivedState: DerivedInputState,
): number {
  return definition.derivedKey === null
    ? inputState[FieldKey.RelativeHumidity]
    : derivedState[definition.derivedKey];
}

export function synchronizeHumidityInputState(
  inputState: CanonicalInputState,
  derivedState: DerivedInputState,
  humidityMode: HumidityInputModeType,
  derivedOverrides: Partial<DerivedInputState> = {},
): CanonicalInputState {
  const definition = humidityModeDefinitions[humidityMode];
  if (definition.derivedKey === null) return { ...inputState };
  const resolvedDerivedState = { ...derivedState, ...derivedOverrides };
  return {
    ...inputState,
    [FieldKey.RelativeHumidity]: definition.toRelativeHumidity(
      inputState[FieldKey.DryBulbTemperature],
      resolvedDerivedState[definition.derivedKey],
    ),
  };
}

export function synchronizeSelectedHumidityMode(
  inputState: CanonicalInputState,
  derivedState: DerivedInputState,
  options: ModelOptionsRecord,
): CanonicalInputState {
  return synchronizeHumidityInputState(
    inputState,
    derivedState,
    requireHumidityInputMode(options),
  );
}

export function createHumidityControlBehavior(
  controlId: InputControlIdType,
): InputControlBehavior {
  return createControlBehavior({
    controlId,
    fieldKey: FieldKey.RelativeHumidity,
    getPresentation: (context) => {
      const definition = humidityModeDefinitions[
        requireHumidityInputMode(context.options)
      ];
      return definition.getPresentation(context, definition.label);
    },
    getMenu: (context) => buildAdvancedOptionMenu("Humidity input", [
      buildAdvancedOptionSection(
        undefined,
        OptionKey.HumidityInputMode,
        requireHumidityInputMode(context.options),
        humidityMenuItems,
      ),
    ]),
    getDisplayValue: (context, inputId) => {
      const definition = humidityModeDefinitions[
        requireHumidityInputMode(context.options)
      ];
      return definition.fromSi(
        getHumidityValueSi(
          definition,
          context.inputsByInput[inputId],
          context.derivedByInput[inputId],
        ),
        context.unitSystem,
      );
    },
    parseInput: (context, value) => humidityModeDefinitions[
      requireHumidityInputMode(context.options)
    ].toSi(value, context.unitSystem),
    applyInput: (context, inputId, nextValueSi) => {
      const mode = requireHumidityInputMode(context.options);
      const definition = humidityModeDefinitions[mode];
      const nextInputState = { ...context.inputsByInput[inputId] };
      const derivedOverrides: Partial<DerivedInputState> = {};
      if (definition.derivedKey === null) {
        nextInputState[FieldKey.RelativeHumidity] = nextValueSi;
      } else {
        derivedOverrides[definition.derivedKey] = nextValueSi;
      }
      return {
        inputsPatch: {
          [inputId]: synchronizeHumidityInputState(
            nextInputState,
            context.derivedByInput[inputId],
            mode,
            derivedOverrides,
          ),
        },
      };
    },
  });
}

export const humidityModeOptionHandler: OptionChangeHandler = (
  context,
  nextValue,
) => {
  const nextMode = requireOptionValue(
    { [OptionKey.HumidityInputMode]: nextValue },
    OptionKey.HumidityInputMode,
    humidityModeValues,
  );
  if (requireHumidityInputMode(context.options) === nextMode) return null;

  const inputsPatch = Object.fromEntries(inputOrder.map((inputId) => [
    inputId,
    synchronizeHumidityInputState(
      context.inputsByInput[inputId],
      context.derivedByInput[inputId],
      nextMode,
    ),
  ]));
  return {
    inputsPatch,
    optionsPatch: { [OptionKey.HumidityInputMode]: nextMode },
  };
};
