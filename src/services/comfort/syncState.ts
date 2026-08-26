import { PhysicalQuantityId, type AuxiliaryInputState, type DerivedSlotQuantityState, type PrimaryInputState } from "../../catalog/quantities";
import { InputId, type InputId as InputIdType } from "../../catalog/inputSlots";
import {
  TemperatureMode,
  type TemperatureMode as TemperatureModeType,
} from "../../catalog/inputModes";
import { t_o } from "jsthermalcomfort";
import { derivePsychrometricSlots } from "./derivations/psychrometrics";
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
    inputState: {
      ...inputState,
      [PhysicalQuantityId.DryBulbTemperature]: operativeTemperature,
      [PhysicalQuantityId.MeanRadiantTemperature]: operativeTemperature,
    },
  };
}

export function readDerivedFromAuxiliary(
  auxiliary: AuxiliaryInputState,
  primary: PrimaryInputState,
): DerivedSlotQuantityState {
  const derived = derivePsychrometricSlots(primary);
  return {
    [PhysicalQuantityId.DewPoint]: auxiliary[PhysicalQuantityId.DewPoint]
      ?? derived[PhysicalQuantityId.DewPoint],
    [PhysicalQuantityId.DerivedHumidityRatio]: auxiliary[PhysicalQuantityId.DerivedHumidityRatio]
      ?? derived[PhysicalQuantityId.DerivedHumidityRatio],
    [PhysicalQuantityId.WetBulb]: auxiliary[PhysicalQuantityId.WetBulb]
      ?? derived[PhysicalQuantityId.WetBulb],
    [PhysicalQuantityId.VaporPressure]: auxiliary[PhysicalQuantityId.VaporPressure]
      ?? derived[PhysicalQuantityId.VaporPressure],
  };
}
