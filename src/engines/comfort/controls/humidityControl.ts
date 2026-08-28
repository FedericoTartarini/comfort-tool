import { PhysicalQuantityId, getQuantityDisplayMeta, getQuantityPresentationMeta, type DerivedSlotQuantityId, type DerivedSlotQuantityState, type PhysicalQuantityId as PhysicalQuantityIdType, type PrimaryInputState } from "../../../catalog/quantities";
import type { InputControlId as InputControlIdType } from "../../../catalog/inputControls";
import {
  HumidityInputMode,
  OptionKey,
  type HumidityInputMode as HumidityInputModeType,
  type ModelOptionsRecord,
} from "../../../catalog/inputModes";
import { inputOrder } from "../../../catalog/inputSlots";
import { humidityMenuItems } from "../../../catalog/controlMenuMeta";
import { getDerivedFromAuxiliary } from "../quantityStateRouting";
import {
  convertQuantityFromSi,
  convertQuantityToSi,
} from "../../units";
import {
  deriveRelativeHumidityFromDewPoint,
  deriveRelativeHumidityFromHumidityRatio,
  deriveRelativeHumidityFromVaporPressure,
  deriveRelativeHumidityFromWetBulb,
} from "../derivations";
import { UnitSystem } from "../../../catalog/units";
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
  derivedKey: DerivedSlotQuantityId | null;
  getPresentation: (
    context: ControlBehaviorContext,
    label: string,
  ) => PresentationMeta;
  toRelativeHumidity: (
    dryBulbTemperatureSi: number,
    valueSi: number,
  ) => number;
}

const relativeHumidityLabel = getQuantityPresentationMeta(
  PhysicalQuantityId.RelativeHumidity,
  UnitSystem.SI,
).label;

function catalogPresentation(
  context: ControlBehaviorContext,
  quantityId: PhysicalQuantityIdType,
  label: string,
): PresentationMeta {
  const display = getQuantityDisplayMeta(quantityId, context.unitSystem);
  return {
    label,
    displayUnits: display.displayUnits,
    step: display.step,
    rangeText: "",
  };
}

const humidityModeDefinitions: Record<HumidityInputModeType, HumidityModeDefinition> = {
  [HumidityInputMode.RelativeHumidity]: {
    label: relativeHumidityLabel,
    quantityId: PhysicalQuantityId.RelativeHumidity,
    derivedKey: null,
    getPresentation: (context, label) => ({
      ...buildDefaultPresentation(context, PhysicalQuantityId.RelativeHumidity),
      label,
    }),
    toRelativeHumidity: (_temperature, valueSi) => valueSi,
  },
  [HumidityInputMode.HumidityRatio]: { label: "Humidity ratio", quantityId: PhysicalQuantityId.HumidityRatio, derivedKey: PhysicalQuantityId.HumidityRatio, getPresentation: (context, label) => catalogPresentation(
      context, PhysicalQuantityId.HumidityRatio, label, ), toRelativeHumidity: deriveRelativeHumidityFromHumidityRatio },
  [HumidityInputMode.DewPoint]: { label: "Dew point", quantityId: PhysicalQuantityId.DewPoint, derivedKey: PhysicalQuantityId.DewPoint, getPresentation: (context, label) => catalogPresentation(
      context, PhysicalQuantityId.DewPoint, label, ), toRelativeHumidity: deriveRelativeHumidityFromDewPoint },
  [HumidityInputMode.WetBulb]: { label: "Wet-bulb temperature", quantityId: PhysicalQuantityId.WetBulb, derivedKey: PhysicalQuantityId.WetBulb, getPresentation: (context, label) => catalogPresentation(
      context, PhysicalQuantityId.WetBulb, label, ), toRelativeHumidity: deriveRelativeHumidityFromWetBulb },
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
  return { ...inputState, [PhysicalQuantityId.RelativeHumidity]: definition.toRelativeHumidity(
      inputState[PhysicalQuantityId.DryBulbTemperature], resolvedDerivedState[definition.derivedKey], ) };
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
      return convertQuantityFromSi(
        definition.quantityId,
        getHumidityValueSi(
          definition,
          context.quantitiesByInput[inputId],
          getDerivedFromAuxiliary(context.auxiliaryQuantitiesByInput[inputId]),
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
