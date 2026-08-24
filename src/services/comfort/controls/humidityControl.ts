import { PhysicalQuantityId, getQuantityPresentationMeta, type DerivedSlotQuantityId, type DerivedSlotQuantityState, type PrimaryInputState } from "../../../models/physicalQuantities";
import type { InputControlId as InputControlIdType } from "../../../models/inputControls";
import {
  HumidityInputMode,
  OptionKey,
  type HumidityInputMode as HumidityInputModeType,
  type ModelOptionsRecord,
} from "../../../models/inputModes";
import { inputOrder } from "../../../models/inputSlots";
import { humidityMenuItems } from "../../../models/controlMenuMeta";
import { getDerivedFromAuxiliary } from "../quantityStateRouting";
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
import { UnitSystem } from "../../../models/units";
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
  derivedKey: DerivedSlotQuantityId | null;
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

const relativeHumidityLabel = getQuantityPresentationMeta(
  PhysicalQuantityId.RelativeHumidity,
  UnitSystem.SI,
).label;

function buildTemperaturePresentation(
  context: ControlBehaviorContext,
  label: string,
): PresentationMeta {
  const temperatureMeta = getQuantityPresentationMeta(
    PhysicalQuantityId.DryBulbTemperature,
    context.unitSystem,
  );
  return {
    label,
    displayUnits: temperatureMeta.displayUnits,
    step: temperatureMeta.step,
    decimals: temperatureMeta.decimals,
    rangeText: "",
  };
}

const humidityModeDefinitions: Record<HumidityInputModeType, HumidityModeDefinition> = {
  [HumidityInputMode.RelativeHumidity]: {
    label: relativeHumidityLabel,
    derivedKey: null,
    getPresentation: (context, label) => ({
      ...buildDefaultPresentation(context, PhysicalQuantityId.RelativeHumidity),
      label,
    }),
    fromSi: (valueSi) => valueSi,
    toSi: (value) => value,
    toRelativeHumidity: (_temperature, valueSi) => valueSi,
  },
  [HumidityInputMode.HumidityRatio]: {
    label: "Humidity ratio",
    derivedKey: PhysicalQuantityId.DerivedHumidityRatio,
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
    derivedKey: PhysicalQuantityId.DewPoint,
    getPresentation: buildTemperaturePresentation,
    fromSi: (valueSi, unitSystem) => convertFieldValueFromSi(
      PhysicalQuantityId.DryBulbTemperature,
      valueSi,
      unitSystem,
    ),
    toSi: (value, unitSystem) => convertFieldValueToSi(
      PhysicalQuantityId.DryBulbTemperature,
      value,
      unitSystem,
    ),
    toRelativeHumidity: deriveRelativeHumidityFromDewPoint,
  },
  [HumidityInputMode.WetBulb]: {
    label: "Wet-bulb temperature",
    derivedKey: PhysicalQuantityId.WetBulb,
    getPresentation: buildTemperaturePresentation,
    fromSi: (valueSi, unitSystem) => convertFieldValueFromSi(
      PhysicalQuantityId.DryBulbTemperature,
      valueSi,
      unitSystem,
    ),
    toSi: (value, unitSystem) => convertFieldValueToSi(
      PhysicalQuantityId.DryBulbTemperature,
      value,
      unitSystem,
    ),
    toRelativeHumidity: deriveRelativeHumidityFromWetBulb,
  },
  [HumidityInputMode.VaporPressure]: {
    label: "Vapor pressure",
    derivedKey: PhysicalQuantityId.VaporPressure,
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
  inputState: PrimaryInputState,
  derivedState: DerivedSlotQuantityState,
): number {
  return definition.derivedKey === null
    ? inputState[PhysicalQuantityId.RelativeHumidity]
    : derivedState[definition.derivedKey];
}

export function synchronizeHumidityInputState(
  inputState: PrimaryInputState,
  derivedState: DerivedSlotQuantityState,
  humidityMode: HumidityInputModeType,
  derivedOverrides: Partial<DerivedSlotQuantityState> = {},
): PrimaryInputState {
  const definition = humidityModeDefinitions[humidityMode];
  if (definition.derivedKey === null) return { ...inputState };
  const resolvedDerivedState = { ...derivedState, ...derivedOverrides };
  return {
    ...inputState,
    [PhysicalQuantityId.RelativeHumidity]: definition.toRelativeHumidity(
      inputState[PhysicalQuantityId.DryBulbTemperature],
      resolvedDerivedState[definition.derivedKey],
    ),
  };
}

export function synchronizeSelectedHumidityMode(
  inputState: PrimaryInputState,
  derivedState: DerivedSlotQuantityState,
  options: ModelOptionsRecord,
): PrimaryInputState {
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
    fieldKey: PhysicalQuantityId.RelativeHumidity,
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
          context.quantitiesByInput[inputId],
          getDerivedFromAuxiliary(context.auxiliaryQuantitiesByInput[inputId]),
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
      const nextInputState = { ...context.quantitiesByInput[inputId] };
      const derivedOverrides: Partial<DerivedSlotQuantityState> = {};
      if (definition.derivedKey === null) {
        nextInputState[PhysicalQuantityId.RelativeHumidity] = nextValueSi;
      } else {
        derivedOverrides[definition.derivedKey] = nextValueSi;
      }
      return {
        quantitiesPatch: {
          [inputId]: synchronizeHumidityInputState(
            nextInputState,
            getDerivedFromAuxiliary(context.auxiliaryQuantitiesByInput[inputId]),
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

  const quantitiesPatch = Object.fromEntries(inputOrder.map((inputId) => [
    inputId,
    synchronizeHumidityInputState(
      context.quantitiesByInput[inputId],
      getDerivedFromAuxiliary(context.auxiliaryQuantitiesByInput[inputId]),
      nextMode,
    ),
  ]));
  return {
    quantitiesPatch,
    optionsPatch: { [OptionKey.HumidityInputMode]: nextMode },
  };
};
