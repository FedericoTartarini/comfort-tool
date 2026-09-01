import { PhysicalQuantityId, type AuxiliaryInputState, type PrimaryInputState } from "../../catalog/quantities";
import {
  derivePsychrometricSlots,
  type DerivedSlotQuantityState,
} from "./derivations/psychrometrics";
import { InputId, type InputId as InputIdType } from "../../catalog/inputSlots";
import {
  TemperatureMode,
  type TemperatureMode as TemperatureModeType,
} from "../../catalog/inputModes";
import { t_o } from "jsthermalcomfort";
import {
  QuantitiesByInputState,
  syncDerivedQuantitiesIntoAuxiliary,
  syncAllDerivedQuantities,
  type AuxiliaryQuantitiesByInputState,
} from "./quantityStateRouting";

export { derivePsychrometricSlots } from "./derivations/psychrometrics";

export function deriveInputsDerivedState(
  quantitiesByInput: QuantitiesByInputState,
): Record<InputIdType, DerivedSlotQuantityState> {
  return {
    [InputId.Input1]: derivePsychrometricSlots(quantitiesByInput[InputId.Input1]),
    [InputId.Input2]: derivePsychrometricSlots(quantitiesByInput[InputId.Input2]),
    [InputId.Input3]: derivePsychrometricSlots(quantitiesByInput[InputId.Input3]),
  };
}

export function syncDerivedStateIntoAuxiliary(
  quantitiesByInput: QuantitiesByInputState,
  auxiliaryQuantitiesByInput: AuxiliaryQuantitiesByInputState,
): void {
  syncAllDerivedQuantities(
    quantitiesByInput,
    auxiliaryQuantitiesByInput,
    derivePsychrometricSlots,
  );
}

export function syncDerivedStateForInput(
  inputId: InputIdType,
  quantitiesByInput: QuantitiesByInputState,
  auxiliaryQuantitiesByInput: AuxiliaryQuantitiesByInputState,
): void {
  syncDerivedQuantitiesIntoAuxiliary(
    quantitiesByInput[inputId],
    auxiliaryQuantitiesByInput[inputId],
    derivePsychrometricSlots(quantitiesByInput[inputId]),
  );
}

export function synchronizeTemperatureMode(
  inputState: PrimaryInputState,
  temperatureMode: TemperatureModeType,
): { inputState: PrimaryInputState } {
  if (temperatureMode === TemperatureMode.Air) {
    return { inputState: { ...inputState } };
  }

  const operativeTemperature = t_o(
    inputState[PhysicalQuantityId.DryBulbTemperature],
    inputState[PhysicalQuantityId.MeanRadiantTemperature],
    inputState[PhysicalQuantityId.RelativeAirSpeed],
  );

  return {
    inputState: { ...inputState, [PhysicalQuantityId.DryBulbTemperature]: operativeTemperature, [PhysicalQuantityId.MeanRadiantTemperature]: operativeTemperature },
  };
}

export function readDerivedFromAuxiliary(
  auxiliary: AuxiliaryInputState,
  primary: PrimaryInputState,
): DerivedSlotQuantityState {
  const derived = derivePsychrometricSlots(primary);
  return { [PhysicalQuantityId.DewPointTemperature]: auxiliary[PhysicalQuantityId.DewPointTemperature]
      ?? derived[PhysicalQuantityId.DewPointTemperature], [PhysicalQuantityId.HumidityRatio]: auxiliary[PhysicalQuantityId.HumidityRatio]
      ?? derived[PhysicalQuantityId.HumidityRatio], [PhysicalQuantityId.WetBulbTemperature]: auxiliary[PhysicalQuantityId.WetBulbTemperature]
      ?? derived[PhysicalQuantityId.WetBulbTemperature], [PhysicalQuantityId.VaporPressure]: auxiliary[PhysicalQuantityId.VaporPressure]
      ?? derived[PhysicalQuantityId.VaporPressure] };
}
