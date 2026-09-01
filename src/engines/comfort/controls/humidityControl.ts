import { PhysicalQuantityId, getPhysicalQuantityMeta, type DerivedHumidityQuantityId, type PhysicalQuantityId as PhysicalQuantityIdType, type QuantityRangeSi, type QuantityState } from "../../../catalog/quantities";
import type { InputControlId as InputControlIdType } from "../../../catalog/inputControls";
import {
  HumidityInputMode,
  OptionKey,
  type HumidityInputMode as HumidityInputModeType,
  type ModelOptionsRecord,
} from "../../../catalog/inputModes";
import { inputOrder } from "../../../catalog/inputSlots";
import { humidityMenuItems } from "../../../catalog/controlMenuMeta";
import { getDerivedFromQuantities } from "../quantityStateRouting";
import {
  convertQuantityFromSi,
  convertQuantityToSi,
} from "../../units";
import {
  deriveRelativeHumidityFromDewPoint,
  deriveRelativeHumidityFromHumidityRatio,
  deriveRelativeHumidityFromVaporPressure,
  deriveRelativeHumidityFromWetBulb,
  type DerivedSlotQuantityState,
} from "../derivations";
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
  quantityId: PhysicalQuantityIdType;
  derivedKey: DerivedHumidityQuantityId | null;
  getPresentation: (
    context: ControlBehaviorContext,
    label: string,
  ) => PresentationMeta;
  toRelativeHumidity: (
    dryBulbTemperatureSi: number,
    valueSi: number,
  ) => number;
}

const relativeHumidityLabel = getPhysicalQuantityMeta(
  PhysicalQuantityId.RelativeHumidity,
).label;

export const derivedHumidityRangeSi: Record<DerivedHumidityQuantityId, QuantityRangeSi> = {
  [PhysicalQuantityId.DewPointTemperature]: { min: -50, max: 50 },
  [PhysicalQuantityId.HumidityRatio]: { min: 0, max: 0.025 },
  [PhysicalQuantityId.WetBulbTemperature]: { min: -50, max: 50 },
  [PhysicalQuantityId.VaporPressure]: { min: 0, max: 10000 },
};

function catalogPresentation(
  context: ControlBehaviorContext,
  quantityId: DerivedHumidityQuantityId,
  label: string,
): PresentationMeta {
  return {
    ...buildDefaultPresentation(context, quantityId, {
      minValue: derivedHumidityRangeSi[quantityId].min,
      maxValue: derivedHumidityRangeSi[quantityId].max,
    }),
    label,
  };
}

const humidityModeDefinitions: Record<HumidityInputModeType, HumidityModeDefinition> = {
  [HumidityInputMode.RelativeHumidity]: {
    label: relativeHumidityLabel,
    quantityId: PhysicalQuantityId.RelativeHumidity,
    derivedKey: null,
    getPresentation: (context, label) => ({
      ...buildDefaultPresentation(context, PhysicalQuantityId.RelativeHumidity, {
        minValue: 0,
        maxValue: 100,
      }),
      label,
    }),
    toRelativeHumidity: (_temperature, valueSi) => valueSi,
  },
  [HumidityInputMode.HumidityRatio]: { label: "Humidity ratio", quantityId: PhysicalQuantityId.HumidityRatio, derivedKey: PhysicalQuantityId.HumidityRatio, getPresentation: (context, label) => catalogPresentation(
      context, PhysicalQuantityId.HumidityRatio, label, ), toRelativeHumidity: deriveRelativeHumidityFromHumidityRatio },
  [HumidityInputMode.DewPoint]: { label: "Dew point", quantityId: PhysicalQuantityId.DewPointTemperature, derivedKey: PhysicalQuantityId.DewPointTemperature, getPresentation: (context, label) => catalogPresentation(
      context, PhysicalQuantityId.DewPointTemperature, label, ), toRelativeHumidity: deriveRelativeHumidityFromDewPoint },
  [HumidityInputMode.WetBulb]: { label: "Wet-bulb temperature", quantityId: PhysicalQuantityId.WetBulbTemperature, derivedKey: PhysicalQuantityId.WetBulbTemperature, getPresentation: (context, label) => catalogPresentation(
      context, PhysicalQuantityId.WetBulbTemperature, label, ), toRelativeHumidity: deriveRelativeHumidityFromWetBulb },
  [HumidityInputMode.VaporPressure]: { label: "Vapor pressure", quantityId: PhysicalQuantityId.VaporPressure, derivedKey: PhysicalQuantityId.VaporPressure, getPresentation: (context, label) => catalogPresentation(
      context, PhysicalQuantityId.VaporPressure, label, ), toRelativeHumidity: deriveRelativeHumidityFromVaporPressure },
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
  inputState: QuantityState,
  derivedState: DerivedSlotQuantityState,
): number {
  return definition.derivedKey === null
    ? inputState[PhysicalQuantityId.RelativeHumidity] ?? 0
    : derivedState[definition.derivedKey];
}

export function synchronizeHumidityInputState(
  inputState: QuantityState,
  derivedState: DerivedSlotQuantityState,
  humidityMode: HumidityInputModeType,
  derivedOverrides: Partial<DerivedSlotQuantityState> = {},
): QuantityState {
  const definition = humidityModeDefinitions[humidityMode];
  if (definition.derivedKey === null) return { ...inputState };
  const resolvedDerivedState = { ...derivedState, ...derivedOverrides };
  return { ...inputState, [PhysicalQuantityId.RelativeHumidity]: definition.toRelativeHumidity(
      inputState[PhysicalQuantityId.DryBulbTemperature] ?? 0, resolvedDerivedState[definition.derivedKey], ) };
}

export function synchronizeSelectedHumidityMode(
  inputState: QuantityState,
  derivedState: DerivedSlotQuantityState,
  options: ModelOptionsRecord,
): QuantityState {
  return synchronizeHumidityInputState(
    inputState,
    derivedState,
    requireHumidityInputMode(options),
  );
}

export function createHumidityControlBehavior(
  controlId: InputControlIdType,
  rangeSi: QuantityRangeSi,
): InputControlBehavior {
  return createControlBehavior({
    controlId,
    fieldKey: PhysicalQuantityId.RelativeHumidity,
    minValue: rangeSi.min,
    maxValue: rangeSi.max,
    getPresentation: (context) => {
      const mode = requireHumidityInputMode(context.options);
      const definition = humidityModeDefinitions[mode];
      if (mode === HumidityInputMode.RelativeHumidity) {
        return {
          ...buildDefaultPresentation(context, PhysicalQuantityId.RelativeHumidity, {
            minValue: rangeSi.min,
            maxValue: rangeSi.max,
          }),
          label: definition.label,
        };
      }
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
      return convertQuantityFromSi(
        definition.quantityId,
        getHumidityValueSi(
          definition,
          context.quantitiesByInput[inputId],
          getDerivedFromQuantities(context.quantitiesByInput[inputId]),
        ),
        context.unitSystem,
      );
    },
    parseInput: (context, value) => {
      const definition = humidityModeDefinitions[
        requireHumidityInputMode(context.options)
      ];
      return convertQuantityToSi(
        definition.quantityId,
        value,
        context.unitSystem,
      );
    },
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
            getDerivedFromQuantities(context.quantitiesByInput[inputId]),
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
            getDerivedFromQuantities(context.quantitiesByInput[inputId]),
      nextMode,
    ),
  ]));
  return {
    quantitiesPatch,
    optionsPatch: { [OptionKey.HumidityInputMode]: nextMode },
  };
};
