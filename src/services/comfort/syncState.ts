import {
  DerivedInputId,
  FieldKey,
  type CanonicalInputState,
  type DerivedInputState,
} from "../../models/fieldKeys";
import { InputId, type InputId as InputIdType } from "../../models/inputSlots";
import {
  TemperatureMode,
  type TemperatureMode as TemperatureModeType,
} from "../../models/inputModes";
import { t_o, psy_ta_rh } from "jsthermalcomfort";

export function deriveInputDerivedState(inputState: CanonicalInputState): DerivedInputState {
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
): Record<InputIdType, DerivedInputState> {
  return {
    [InputId.Input1]: deriveInputDerivedState(inputsByInput[InputId.Input1]),
    [InputId.Input2]: deriveInputDerivedState(inputsByInput[InputId.Input2]),
    [InputId.Input3]: deriveInputDerivedState(inputsByInput[InputId.Input3]),
  };
}

export function synchronizeTemperatureMode(
  inputState: CanonicalInputState,
  temperatureMode: TemperatureModeType,
): { inputState: CanonicalInputState } {
  if (temperatureMode === TemperatureMode.Air) {
    return { inputState: { ...inputState } };
  }

  const operativeTemperature = t_o(
    inputState[FieldKey.DryBulbTemperature],
    inputState[FieldKey.MeanRadiantTemperature],
    inputState[FieldKey.RelativeAirSpeed],
  );

  return {
    inputState: {
      ...inputState,
      [FieldKey.DryBulbTemperature]: operativeTemperature,
      [FieldKey.MeanRadiantTemperature]: operativeTemperature,
    },
  };
}
