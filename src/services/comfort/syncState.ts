import { DerivedInputId, FieldKey, type DerivedInputId as DerivedInputIdType, type FieldKey as FieldKeyType } from "../../models/fieldKeys";
import { inputOrder, type InputId as InputIdType } from "../../models/inputSlots";
import {
  defaultPmvOptions,
  HumidityInputMode,
  OptionKey,
  type ModelOptionsRecord,
  type PmvModelOptions,
} from "../../models/inputModes";
import {
  deriveRelativeHumidityFromDewPoint,
  deriveRelativeHumidityFromHumidityRatio,
  deriveRelativeHumidityFromWetBulb,
  deriveRelativeHumidityFromVaporPressure,
} from "./derivations";
import { t_o, psy_ta_rh } from "jsthermalcomfort";

export type CanonicalInputState = Record<FieldKeyType, number>;
export type CanonicalDerivedState = Partial<Record<DerivedInputIdType, number>>;

/**
 * Resolves a given moisture mode and its associated derived state into a single cohesive relative humidity value.
 * Uses psychrometric functions to iteratively resolve Dew Point, Wet Bulb, Vapor Pressure, and Humidity Ratio.
 *
 * @param dryBulbTemperature The primary dry bulb temperature of the state.
 * @param humidityMode The active Moisture/Humidity input model applied.
 * @param derivedState The currently resolved generic derived state.
 * @returns The resolved relative humidity percentage, or null if the mode is not specifically constrained.
 */
export function resolveMoistureModeToRelativeHumidity(
  dryBulbTemperature: number,
  humidityMode: typeof HumidityInputMode[keyof typeof HumidityInputMode],
  derivedState: CanonicalDerivedState
): number | null {
  switch (humidityMode) {
    case HumidityInputMode.DewPoint:
      return deriveRelativeHumidityFromDewPoint(dryBulbTemperature, derivedState[DerivedInputId.DewPoint] ?? 0);
    case HumidityInputMode.HumidityRatio:
      return deriveRelativeHumidityFromHumidityRatio(dryBulbTemperature, derivedState[DerivedInputId.HumidityRatio] ?? 0);
    case HumidityInputMode.WetBulb:
      return deriveRelativeHumidityFromWetBulb(dryBulbTemperature, derivedState[DerivedInputId.WetBulb] ?? 0);
    case HumidityInputMode.VaporPressure:
      return deriveRelativeHumidityFromVaporPressure(dryBulbTemperature, derivedState[DerivedInputId.VaporPressure] ?? 0);
    default:
      return null;
  }
}

/**
 * Handles overriding sparse data. It accepts an incomplete/partial options dictionary 
 * and patches any missing keys with their corresponding safe canonical defaults.
 * @param options A partial record of model options.
 * @returns A fully populated PmvModelOptions object.
 */
export function normalizePmvOptions(options: ModelOptionsRecord): PmvModelOptions {
  return {
    ...defaultPmvOptions,
    ...options,
  } as PmvModelOptions;
}

/**
 * Calculates all derived environmental values for a single input state.
 * @param inputState The canonical SI input values.
 * @returns A record of derived psychrometric values.
 */
export function deriveInputDerivedState(inputState: CanonicalInputState): CanonicalDerivedState {
  const psychrometricState = psy_ta_rh(
    inputState[FieldKey.DryBulbTemperature],
    inputState[FieldKey.RelativeHumidity],
  );

  return {
    [DerivedInputId.DewPoint]: psychrometricState.t_dp,
    [DerivedInputId.HumidityRatio]: psychrometricState.hr,
    [DerivedInputId.WetBulb]: psychrometricState.t_wb,
    [DerivedInputId.VaporPressure]: psychrometricState.p_vap,
  };
}

export function deriveInputsDerivedState(
  inputsByInput: Record<InputIdType, CanonicalInputState>,
): Record<InputIdType, CanonicalDerivedState> {
  return inputOrder.reduce((accumulator, inputId) => {
    accumulator[inputId] = deriveInputDerivedState(inputsByInput[inputId]);
    return accumulator;
  }, {} as Record<InputIdType, CanonicalDerivedState>);
}

function resolveDerivedInputState(
  inputState: CanonicalInputState,
  derivedInputOverrides: CanonicalDerivedState = {},
): CanonicalDerivedState {
  return {
    ...deriveInputDerivedState(inputState),
    ...derivedInputOverrides,
  };
}

/**
 * Synchronizes the canonical input state to match the currently enabled model options.
 * For example, if 'Dew Point' mode is enabled, it updates Relative Humidity to match the dew point.
 * @param inputState The current canonical input state.
 * @param options The active model options.
 * @param derivedInputOverrides Optional overrides for derived values.
 * @returns The updated canonical input state.
 */
export function synchronizePmvInputState(
  inputState: CanonicalInputState,
  options: ModelOptionsRecord,
  derivedInputOverrides: CanonicalDerivedState = {},
): { inputState: CanonicalInputState } {
  const normalizedOptions = normalizePmvOptions(options);
  const resolvedDerivedState = resolveDerivedInputState(inputState, derivedInputOverrides);
  const nextInputState = { ...inputState };

  const moistureDerivedRh = resolveMoistureModeToRelativeHumidity(
    nextInputState[FieldKey.DryBulbTemperature],
    normalizedOptions[OptionKey.HumidityInputMode],
    resolvedDerivedState
  );

  if (moistureDerivedRh !== null) {
    nextInputState[FieldKey.RelativeHumidity] = moistureDerivedRh;
  }

  return {
    inputState: nextInputState,
  };
}

export function applyOperativeTemperatureMode(
  inputState: CanonicalInputState,
  options: ModelOptionsRecord,
  derivedInputOverrides: CanonicalDerivedState = {},
): { inputState: CanonicalInputState } {
  const operativeTemperature = t_o(
    inputState[FieldKey.DryBulbTemperature],
    inputState[FieldKey.MeanRadiantTemperature],
    inputState[FieldKey.RelativeAirSpeed],
  );

  return synchronizePmvInputState(
    {
      ...inputState,
      [FieldKey.DryBulbTemperature]: operativeTemperature,
      [FieldKey.MeanRadiantTemperature]: operativeTemperature,
    },
    options,
    derivedInputOverrides,
  );
}
